import { useState, useEffect } from "react";
import { useSessao } from "@/context/AppContext";
import { usePedidosCozinha, useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { iniciarPreparo, marcarPronto, tempoDecorridoMin, estaAtrasado, formatarTempoDecorrido, statusCozinha, referenciaDaEtapa } from "@/lib/cozinha";
import { enviarViaProducao } from "@/lib/impressao/despacho";
import { LuArmchair, LuChefHat, LuClock, LuTriangleAlert, LuPlay, LuCheck, LuPrinter } from "react-icons/lu";
import "./CozinhaView.css";
import { fmtComanda } from "@/lib/rotuloComanda";
import { itensNaoCancelados } from "@/lib/comandaItens";


// A cor de cada coluna fica no CSS (`cozinha-view__coluna--<status>`), com os
// tokens --gm-* que o tenant sobrescreve (decisão 017, TD018).
const COLUNAS = [
  { status: "aguardando", titulo: "Aguardando" },
  { status: "em_preparo", titulo: "Em Preparo" },
  { status: "pronto",     titulo: "Pronto" },
];

/**
 * Cozinha / KDS (F007) — docs/03_REGRAS_DE_NEGOCIO/COZINHA.md.
 * Painel em tempo real, organizado por status de preparo. O "pedido"
 * aqui é a comanda em `pending` (ver src/lib/cozinha.js).
 */
export default function CozinhaView() {
  const { currentUser } = useSessao();
  const { pedidos, loading, erro, recarregar } = usePedidosCozinha();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [processando, setProcessando] = useState({});

  // Recalcula tempo decorrido/atraso periodicamente (os dados não mudam, só o relógio)
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const marcarProcessando = (id, valor) => setProcessando((prev) => ({ ...prev, [id]: valor }));

  const handleIniciarPreparo = async (pedido) => {
    if (processando[pedido.id]) return;
    marcarProcessando(pedido.id, true);
    try {
      const { error } = await iniciarPreparo(pedido.id, currentUser?.username);
      if (error) console.error("[cozinha] erro ao iniciar preparo:", error);
    } finally {
      marcarProcessando(pedido.id, false);
    }
  };

  const handleMarcarPronto = async (pedido) => {
    if (processando[pedido.id]) return;
    marcarProcessando(pedido.id, true);
    try {
      const { error } = await marcarPronto(pedido.id, currentUser?.username);
      if (error) console.error("[cozinha] erro ao marcar pronto:", error);
    } finally {
      marcarProcessando(pedido.id, false);
    }
  };

  // Via de produção: 1 clique imprime a comanda no destino do perfil —
  // impressora térmica pela Ponte KORA (que enfileira e reimprime sozinha
  // se estiver ocupada/desligada) ou a janela do navegador.
  // Nunca lança: pop-up bloqueado/falha de driver vira um alerta simples.
  const handleImprimirVia = async (pedido) => {
    const { error } = await enviarViaProducao(pedido);
    if (error) window.alert(error.message);
  };

  return (
    <div
      className="cozinha-view"
      style={{ "--cozinha-pad": `${sz.pad}px`, "--cozinha-gap": `${sz.gap}px` }}
    >
      {/* Header */}
      <div className="cozinha-view__header">
        <LuChefHat size={sz.fontLg} className="cozinha-view__header-icone" />
        <div>
          <div className="cozinha-view__header-titulo">Cozinha</div>
          <div className="cozinha-view__subtitulo">Painel de preparo em tempo real</div>
        </div>
      </div>

      {/* Falha ao carregar: nunca deixar o painel parecer "sem pedidos". */}
      {erro && (
        <div className="cozinha-view__erro" role="alert">
          <LuTriangleAlert size={sz.fontLg} color="var(--gm-red)" />
          <span className="cozinha-view__erro-texto">
            Não deu para carregar os pedidos. Pode haver pedidos esperando que não estão nesta tela.
          </span>
          <button type="button" className="cozinha-view__erro-btn" onClick={recarregar} disabled={loading}>
            {loading ? "Tentando…" : "Tentar de novo"}
          </button>
        </div>
      )}

      {/* Colunas */}
      <div className="cozinha-view__colunas">
        {COLUNAS.map((coluna) => {
          const pedidosColuna = pedidos
            .filter((p) => statusCozinha(p) === coluna.status)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

          return (
            <div key={coluna.status} className={`cozinha-view__coluna cozinha-view__coluna--${coluna.status}`}>
              {/* Cabeçalho da coluna */}
              <div className="cozinha-view__coluna-header">
                <span className="cozinha-view__coluna-bolinha" />
                <span className="cozinha-view__coluna-titulo">{coluna.titulo}</span>
                <span className="cozinha-view__coluna-contador">{pedidosColuna.length}</span>
              </div>

              {/* Cards */}
              <div className="cozinha-view__cards">
                {loading ? (
                  <div className="cozinha-view__vazio">Carregando…</div>
                ) : pedidosColuna.length === 0 ? (
                  <div className="cozinha-view__vazio">Nenhum pedido aqui.</div>
                ) : (
                  pedidosColuna.map((pedido) => (
                    <PedidoCard
                      key={pedido.id}
                      pedido={pedido}
                      sz={sz}
                      processando={!!processando[pedido.id]}
                      onIniciarPreparo={() => handleIniciarPreparo(pedido)}
                      onMarcarPronto={() => handleMarcarPronto(pedido)}
                      onImprimirVia={() => handleImprimirVia(pedido)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PedidoCard({ pedido, processando, onIniciarPreparo, onMarcarPronto, onImprimirVia }) {
  const status = statusCozinha(pedido);
  const referencia = referenciaDaEtapa(pedido);
  const minutos = tempoDecorridoMin(referencia);
  const atrasado = estaAtrasado(pedido);
  const itensAtivos = itensNaoCancelados(pedido.items);

  return (
    <div className={`pedido-card${atrasado ? " pedido-card--atrasado" : ""}`}>
      {/* Cabeçalho do card */}
      <div className="pedido-card__topo">
        <span className="pedido-card__comanda">{fmtComanda(pedido.comanda)}</span>
        {pedido.mesa && <span className="pedido-card__mesa"><LuArmchair size={12} aria-hidden="true" className="pedido-card__mesa-icone" /> {pedido.mesa}</span>}
        <span className="pedido-card__tempo">
          {atrasado ? <LuTriangleAlert size={12} /> : <LuClock size={12} />}
          {formatarTempoDecorrido(minutos)}
        </span>
        {/* F015 — via de produção, 1 clique */}
        <button
          onClick={onImprimirVia}
          title="Imprimir via de produção"
          className="pedido-card__btn-imprimir"
        >
          <LuPrinter size={13} />
        </button>
      </div>

      {/* Itens */}
      <div className="pedido-card__itens">
        {itensAtivos.map((item, idx) => (
          <div key={item.uid ?? idx} className="pedido-card__item">
            <span className="pedido-card__item-qtd">{item.qty ?? 1}x</span> {item.name}
            {Array.isArray(item.obs) && item.obs.length > 0 && (
              <div className="pedido-card__item-obs">
                {item.obs.join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ação */}
      {status === "aguardando" && (
        <button
          onClick={onIniciarPreparo}
          disabled={processando}
          className="pedido-card__btn-acao pedido-card__btn-acao--iniciar"
        >
          <LuPlay size={13} /> {processando ? "Iniciando..." : "Iniciar Preparo"}
        </button>
      )}
      {status === "em_preparo" && (
        <button
          onClick={onMarcarPronto}
          disabled={processando}
          className="pedido-card__btn-acao pedido-card__btn-acao--pronto"
        >
          <LuCheck size={13} /> {processando ? "Salvando..." : "Marcar Pronto"}
        </button>
      )}
    </div>
  );
}
