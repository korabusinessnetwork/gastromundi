import { useEffect, useMemo, useState } from "react";
import {
  LuArrowLeft,
  LuCheck,
  LuChefHat,
  LuCircleCheck,
  LuClock,
  LuFlame,
  LuTriangleAlert,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { usePedidosCozinha } from "@/utils/hooks";
import {
  estaAtrasado,
  formatarTempoDecorrido,
  iniciarPreparo,
  marcarPronto,
  tempoDecorridoMin,
} from "@/lib/cozinha";
import "../modulos.css";
import "./CozinhaModulo.css";

/**
 * CozinhaModulo — tela mobile da Cozinha/KDS no Palm (tela 1i do redesign).
 *
 * Mesma fonte de dados do KDS de desktop (CozinhaView): o "pedido" desta base
 * é a comanda em `public.pending` com itens lançados, lida e sincronizada ao
 * vivo pelo hook `usePedidosCozinha` (select com colunas explícitas + canal
 * realtime na tabela `pending`). As ações reusam `iniciarPreparo` /
 * `marcarPronto` de src/lib/cozinha.js — inclusive o guard otimista que evita
 * duas estações avançarem a mesma comanda.
 *
 * Aqui, em vez das 3 colunas do desktop (que não cabem no celular), a mesma
 * informação vira 1 lista + chips de filtro: o cozinheiro vê uma etapa por vez,
 * com a próxima ação como único botão grande do cartão.
 */

const FILTROS = [
  { chave: "aguardando", rotulo: "Fila" },
  { chave: "em_preparo", rotulo: "Em preparo" },
  { chave: "pronto", rotulo: "Prontos" },
];

const VAZIOS = {
  aguardando: {
    Icone: LuChefHat,
    titulo: "Nada na fila",
    texto: "Quando o salão lançar um pedido, ele aparece aqui na hora.",
  },
  em_preparo: {
    Icone: LuFlame,
    titulo: "Nada em preparo",
    texto: 'Abra a fila e toque em "Começar preparo" para o próximo pedido.',
  },
  pronto: {
    Icone: LuCircleCheck,
    titulo: "Nada pronto ainda",
    texto: "Os pedidos que você finalizar ficam listados aqui.",
  },
};

/**
 * Rótulo curto da comanda para o KDS na mão: número puro vira `#42` (cabe no
 * topo do cartão junto com a mesa); nome livre ("Mesa VIP") passa intacto.
 * Variante compacta do `fmtComanda` do Palm — mesma regra, texto mais curto.
 */
function rotuloComanda(comanda) {
  const valor = String(comanda ?? "").trim();
  return /^\d+$/.test(valor) ? `#${valor}` : valor;
}

function itensAtivos(pedido) {
  return (Array.isArray(pedido?.items) ? pedido.items : []).filter((i) => !i?.cancelado);
}

function statusDe(pedido) {
  return pedido?.status_cozinha ?? "aguardando";
}

export default function CozinhaModulo({ onVoltar }) {
  const { currentUser } = useApp();
  const { pedidos, loading } = usePedidosCozinha();

  const [filtro, setFiltro] = useState("aguardando");
  const [processando, setProcessando] = useState({});
  const [erro, setErro] = useState("");

  // Os dados chegam por realtime; só o relógio precisa correr sozinho para o
  // tempo decorrido e o atraso continuarem verdadeiros na tela (igual ao KDS
  // de desktop, que também faz um tick de 30s).
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const porStatus = useMemo(() => {
    const grupos = { aguardando: [], em_preparo: [], pronto: [] };
    for (const pedido of pedidos) {
      const status = statusDe(pedido);
      if (grupos[status]) grupos[status].push(pedido);
    }
    // Fila e preparo: o mais antigo primeiro (é o que atrasa). Prontos: o mais
    // recente no topo, que é o que o cozinheiro acabou de fazer.
    grupos.aguardando.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    grupos.em_preparo.sort((a, b) => new Date(a.em_preparo_em ?? a.created_at) - new Date(b.em_preparo_em ?? b.created_at));
    grupos.pronto.sort((a, b) => new Date(b.pronto_em ?? b.created_at) - new Date(a.pronto_em ?? a.created_at));
    return grupos;
  }, [pedidos]);

  const lista = porStatus[filtro] ?? [];

  const executar = async (pedido, acao, mensagemErro) => {
    if (processando[pedido.id]) return;
    setProcessando((prev) => ({ ...prev, [pedido.id]: true }));
    setErro("");
    try {
      const { error } = await acao(pedido.id, currentUser?.username);
      if (error) setErro(mensagemErro);
    } catch {
      setErro(mensagemErro);
    } finally {
      setProcessando((prev) => ({ ...prev, [pedido.id]: false }));
    }
  };

  const handleComecar = (pedido) =>
    executar(pedido, iniciarPreparo, "Não deu para começar o preparo. Toque de novo.");

  const handlePronto = (pedido) =>
    executar(pedido, marcarPronto, "Não deu para marcar como pronto. Toque de novo.");

  const naFila = porStatus.aguardando.length;

  return (
    <div className="mod-tela">
      <header className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">Cozinha</h1>
          <p className="mod-header__subtitulo">
            {naFila === 1 ? "1 pedido na fila" : `${naFila} pedidos na fila`}
          </p>
        </div>
        <button
          type="button"
          className="mod-header__voltar"
          onClick={onVoltar}
          aria-label="Voltar"
        >
          <LuArrowLeft aria-hidden="true" />
        </button>
      </header>

      <div className="mod-chips" role="tablist" aria-label="Etapa do preparo">
        {FILTROS.map(({ chave, rotulo }) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={filtro === chave}
            className={`mod-chip${filtro === chave ? " mod-chip--ativo" : ""}`}
            onClick={() => setFiltro(chave)}
          >
            {rotulo}
            <span className="mod-chip__contador">{porStatus[chave].length}</span>
          </button>
        ))}
      </div>

      {erro ? (
        <p className="mod-erro" role="alert">
          {erro}
        </p>
      ) : null}

      {loading ? (
        <p className="mod-carregando">Carregando pedidos…</p>
      ) : lista.length === 0 ? (
        <Vazio filtro={filtro} />
      ) : (
        <div className="mod-lista">
          {lista.map((pedido) => (
            <CartaoPedido
              key={pedido.id}
              pedido={pedido}
              processando={Boolean(processando[pedido.id])}
              onComecar={() => handleComecar(pedido)}
              onPronto={() => handlePronto(pedido)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Vazio({ filtro }) {
  const { Icone, titulo, texto } = VAZIOS[filtro] ?? VAZIOS.aguardando;
  return (
    <div className="mod-vazio">
      <Icone aria-hidden="true" />
      <p className="mod-vazio__titulo">{titulo}</p>
      <p className="mod-vazio__texto">{texto}</p>
    </div>
  );
}

function CartaoPedido({ pedido, processando, onComecar, onPronto }) {
  const status = statusDe(pedido);
  const itens = itensAtivos(pedido);
  const atrasado = estaAtrasado({ ...pedido, status_cozinha: status });

  if (status === "pronto") {
    const desdePronto = formatarTempoDecorrido(tempoDecorridoMin(pedido.pronto_em));
    return (
      <article className="mod-cartao mod-cartao--green cozinha-modulo__cartao--compacto">
        <div className="mod-cartao__topo">
          <span className="mod-cartao__titulo">
            {rotuloComanda(pedido.comanda)}
            {pedido.mesa ? <span className="cozinha-modulo__mesa"> Mesa {pedido.mesa}</span> : null}
          </span>
          <span className="mod-badge mod-badge--ok">
            <LuCheck aria-hidden="true" />
            Pronto
          </span>
        </div>
        <p className="mod-cartao__sub">
          {itens.length === 1 ? "1 item" : `${itens.length} itens`} · pronto há {desdePronto}
        </p>
      </article>
    );
  }

  const emPreparo = status === "em_preparo";
  const referencia = emPreparo ? pedido.em_preparo_em : pedido.created_at;
  const tempo = formatarTempoDecorrido(tempoDecorridoMin(referencia));

  return (
    <article className={`mod-cartao ${emPreparo ? "mod-cartao--warn" : "mod-cartao--azul"}`}>
      <div className="mod-cartao__topo">
        <span className="mod-cartao__titulo">
          {rotuloComanda(pedido.comanda)}
          {pedido.mesa ? <span className="cozinha-modulo__mesa"> Mesa {pedido.mesa}</span> : null}
        </span>

        {emPreparo ? (
          <span className={`mod-badge mod-badge--warn${atrasado ? " cozinha-modulo__badge--atrasado" : ""}`}>
            {atrasado ? <LuTriangleAlert aria-hidden="true" /> : <LuFlame aria-hidden="true" />}
            Em preparo · {tempo}
          </span>
        ) : (
          <span className={`cozinha-modulo__tempo${atrasado ? " cozinha-modulo__tempo--atrasado" : ""}`}>
            {atrasado ? <LuTriangleAlert aria-hidden="true" /> : <LuClock aria-hidden="true" />}
            {tempo}
          </span>
        )}
      </div>

      <ul className="cozinha-modulo__itens">
        {itens.map((item, idx) => (
          <li key={`${item?.id ?? item?.name ?? "item"}-${idx}`} className="cozinha-modulo__item">
            <span className="cozinha-modulo__itemQtd">{item?.qty ?? 1}×</span>{" "}
            <span className="cozinha-modulo__itemNome">{item?.name}</span>
            {Array.isArray(item?.obs) && item.obs.length > 0 ? (
              <span className="cozinha-modulo__itemObs"> — {item.obs.join(" · ")}</span>
            ) : null}
          </li>
        ))}
      </ul>

      {emPreparo ? (
        <button
          type="button"
          className="mod-botao mod-botao--ok mod-botao--bloco"
          onClick={onPronto}
          disabled={processando}
        >
          <LuCheck aria-hidden="true" />
          {processando ? "Salvando…" : "Marcar pronto"}
        </button>
      ) : (
        <button
          type="button"
          className="mod-botao mod-botao--primario mod-botao--bloco"
          onClick={onComecar}
          disabled={processando}
        >
          <LuFlame aria-hidden="true" />
          {processando ? "Começando…" : "Começar preparo"}
        </button>
      )}
    </article>
  );
}
