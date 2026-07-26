import {
  LuLayoutGrid,
  LuSearch,
  LuLock,
  LuPause,
  LuPlus,
} from "react-icons/lu";
import { fmtComanda, fmtDinheiro } from "@/pages/mobile/fmt";
import "./ComandasTab.css";

/**
 * Aba "Comandas" do /palm (garçom).
 *
 * Puramente apresentacional: recebe a lista de células já resolvida pelo
 * shell (estado, total, trava de uso) e devolve apenas cliques. Nenhuma
 * regra de negócio, contexto ou acesso a dados mora aqui.
 */
function celulaInfo(comanda) {
  const { estado, total } = comanda;

  if (estado === "lancada") {
    return {
      classe: "comandas-tab__celula--lancada",
      rotulo: "Aberta",
      mostrarTotal: true,
      total,
    };
  }

  if (estado === "comItens") {
    return {
      classe: "comandas-tab__celula--comItens",
      rotulo: "Em andamento",
      mostrarTotal: true,
      total,
    };
  }

  return {
    classe: "comandas-tab__celula--vazia",
    rotulo: "Vazio",
    mostrarTotal: false,
    total: 0,
  };
}

function CelulaComanda({ comanda }) {
  const { numero, emUso, nomeTrava, onClick } = comanda;
  const info = celulaInfo(comanda);

  return (
    <button
      type="button"
      className={`comandas-tab__celula ${info.classe}`}
      onClick={onClick}
    >
      <div className="comandas-tab__celulaTopo">
        <span className="comandas-tab__numero">{fmtComanda(numero)}</span>
        <span className="comandas-tab__badge">{info.rotulo}</span>
      </div>

      {info.mostrarTotal ? (
        <span className="comandas-tab__total">{fmtDinheiro(info.total)}</span>
      ) : (
        <span className="comandas-tab__disponivel">
          <LuPlus aria-hidden="true" />
          Abrir comanda
        </span>
      )}

      {emUso ? (
        <span className="comandas-tab__trava">
          <LuLock aria-hidden="true" />
          Em uso{nomeTrava ? ` · ${nomeTrava}` : ""}
        </span>
      ) : null}
    </button>
  );
}

export default function ComandasTab({
  busca,
  onBusca,
  onVoltar,
  comandas,
  temMais,
  limite,
  total,
  onVerMais,
  barraEsperas,
}) {
  const comAtividade = comandas.filter((c) => c.estado !== "vazia").length;
  const buscaVazia = busca && comandas.length === 0;

  return (
    <div className="comandas-tab">
      <header className="comandas-tab__header">
        <div className="comandas-tab__titulo">
          <LuLayoutGrid aria-hidden="true" />
          <h1>Comandas</h1>
          <span className="comandas-tab__contagem">{comAtividade} em uso</span>
        </div>
        <button
          type="button"
          className="comandas-tab__voltar"
          onClick={onVoltar}
        >
          Voltar
        </button>
      </header>

      <label className="comandas-tab__busca">
        <LuSearch aria-hidden="true" />
        <input
          type="text"
          inputMode="search"
          placeholder="Buscar comanda…"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
        />
      </label>

      {buscaVazia ? (
        <p className="comandas-tab__vazio">
          Nenhuma comanda encontrada para "{busca}". Tente outro número ou
          nome.
        </p>
      ) : (
        <div className="comandas-tab__grade">
          {comandas.map((comanda) => (
            <CelulaComanda key={comanda.numero} comanda={comanda} />
          ))}
        </div>
      )}

      {temMais ? (
        <button
          type="button"
          className="comandas-tab__verMais"
          onClick={onVerMais}
        >
          Ver mais · {limite}/{total}
        </button>
      ) : null}

      {barraEsperas ? (
        <button
          type="button"
          className="comandas-tab__esperas"
          onClick={barraEsperas.onClick}
        >
          <LuPause aria-hidden="true" />
          <span>
            {barraEsperas.qtd} pedidos em espera ·{" "}
            {fmtDinheiro(barraEsperas.total)}
          </span>
          <span className="comandas-tab__esperasAcao">Revisar e enviar</span>
        </button>
      ) : null}
    </div>
  );
}
