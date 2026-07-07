import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { usePedidosCozinha, useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { iniciarPreparo, marcarPronto, tempoDecorridoMin, estaAtrasado } from "@/lib/cozinha";
import { montarViaProducao, buscarConfigImpressao } from "@/lib/impressao";
import { imprimirDocumento } from "@/lib/impressao/drivers";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { LuChefHat, LuClock, LuTriangleAlert, LuPlay, LuCheck, LuPrinter } from "react-icons/lu";
import "./CozinhaView.css";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

// AMBER ("em preparo") é uma cor semântica de status, não de marca —
// segue fixa, como AMBER em ComandaGrid.jsx (não faz parte do tema do tenant).
const AMBER = "#f59e0b";
const COLUNAS = [
  { status: "aguardando", titulo: "Aguardando", cor: "var(--gm-blue)" },
  { status: "em_preparo", titulo: "Em Preparo", cor: AMBER },
  { status: "pronto",     titulo: "Pronto",      cor: "var(--gm-green)" },
];

/**
 * Cozinha / KDS (F007) — docs/03_REGRAS_DE_NEGOCIO/COZINHA.md.
 * Painel em tempo real, organizado por status de preparo. O "pedido"
 * aqui é a comanda em `pending` (ver src/lib/cozinha.js).
 */
export default function CozinhaView() {
  const { currentUser } = useApp();
  const { pedidos, loading } = usePedidosCozinha();
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

  // F015/F020 — via de produção: 1 clique, sem preço/jargão, só o que
  // a cozinha precisa. O driver (browser-raster/QZ Tray) e o perfil de
  // papel (58/80mm) vêm da config de impressão do estabelecimento.
  // Nunca lança: pop-up bloqueado/falha de driver vira um alerta simples.
  const handleImprimirVia = async (pedido) => {
    const dados = montarViaProducao({ pedido });
    const { data: configImpressao } = await buscarConfigImpressao();
    const { error } = await imprimirDocumento(dados, configImpressao?.perfilImpressora);
    if (error) window.alert(error.message);
  };

  return (
    <div className="cozinha-view" style={{ background: C.bg }}>
      {/* Header */}
      <div className="cozinha-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <LuChefHat size={sz.fontLg} color={C.accent} />
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Cozinha</div>
          <div className="cozinha-view__subtitulo" style={{ color: C.muted, fontSize: sz.fontSm }}>Painel de preparo em tempo real</div>
        </div>
      </div>

      {/* Colunas */}
      <div className="cozinha-view__colunas" style={{ gap: sz.gap, padding: sz.pad }}>
        {COLUNAS.map((coluna) => {
          const pedidosColuna = pedidos
            .filter((p) => (p.status_cozinha ?? "aguardando") === coluna.status)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

          return (
            <div key={coluna.status} className="cozinha-view__coluna">
              {/* Cabeçalho da coluna */}
              <div className="cozinha-view__coluna-header">
                <span className="cozinha-view__coluna-bolinha" style={{ background: coluna.cor }} />
                <span style={{ fontWeight: 800, fontSize: sz.fontBase }}>{coluna.titulo}</span>
                <span className="cozinha-view__coluna-contador" style={{ fontSize: sz.fontSm }}>{pedidosColuna.length}</span>
              </div>

              {/* Cards */}
              <div className="cozinha-view__cards">
                {loading ? (
                  <div className="cozinha-view__vazio" style={{ fontSize: sz.fontSm }}>Carregando…</div>
                ) : pedidosColuna.length === 0 ? (
                  <div className="cozinha-view__vazio" style={{ fontSize: sz.fontSm }}>Nenhum pedido aqui.</div>
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

function PedidoCard({ pedido, sz, processando, onIniciarPreparo, onMarcarPronto, onImprimirVia }) {
  const referencia = pedido.status_cozinha === "em_preparo" ? pedido.em_preparo_em : pedido.created_at;
  const minutos = tempoDecorridoMin(referencia);
  const atrasado = estaAtrasado(pedido);
  const itensAtivos = (Array.isArray(pedido.items) ? pedido.items : []).filter((i) => !i.cancelado);

  return (
    <div className="pedido-card" style={{
      border: `1.5px solid ${atrasado ? C.red : C.border}`,
      boxShadow: atrasado ? `0 0 0 1px ${alfa(C.red, "33")}` : "none",
    }}>
      {/* Cabeçalho do card */}
      <div className="pedido-card__topo">
        <span style={{ fontWeight: 800, fontSize: sz.fontBase }}>{fmtComanda(pedido.comanda)}</span>
        {pedido.mesa && <span className="pedido-card__mesa" style={{ fontSize: sz.fontSm }}>🪑 {pedido.mesa}</span>}
        <span className="pedido-card__tempo" style={{ fontSize: sz.fontSm - 1, color: atrasado ? C.red : C.muted }}>
          {atrasado ? <LuTriangleAlert size={12} /> : <LuClock size={12} />}
          {minutos} min
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
          <div key={idx} className="pedido-card__item" style={{ fontSize: sz.fontSm }}>
            <span style={{ fontWeight: 700 }}>{item.qty ?? 1}x</span> {item.name}
            {Array.isArray(item.obs) && item.obs.length > 0 && (
              <div className="pedido-card__item-obs" style={{ fontSize: sz.fontSm - 1 }}>
                {item.obs.join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ação */}
      {pedido.status_cozinha === "aguardando" && (
        <button
          onClick={onIniciarPreparo}
          disabled={processando}
          className="pedido-card__btn-acao"
          style={{
            background: processando ? C.faint : C.accent,
            fontSize: sz.fontSm + 1, cursor: processando ? "not-allowed" : "pointer",
          }}
        >
          <LuPlay size={13} /> {processando ? "Iniciando..." : "Iniciar Preparo"}
        </button>
      )}
      {pedido.status_cozinha === "em_preparo" && (
        <button
          onClick={onMarcarPronto}
          disabled={processando}
          className="pedido-card__btn-acao"
          style={{
            background: processando ? C.faint : C.green,
            fontSize: sz.fontSm + 1, cursor: processando ? "not-allowed" : "pointer",
          }}
        >
          <LuCheck size={13} /> {processando ? "Salvando..." : "Marcar Pronto"}
        </button>
      )}
    </div>
  );
}
