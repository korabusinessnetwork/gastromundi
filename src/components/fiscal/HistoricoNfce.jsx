import { useCallback, useEffect, useState } from "react";
import {
  LuReceipt, LuSearch, LuCircleCheck, LuClock, LuCircleX, LuBan,
  LuLoaderCircle, LuTriangleAlert, LuRotateCw, LuInbox,
} from "react-icons/lu";
import { listarNfceEmitidas } from "@/lib/nfceEmitidasRepo";
import { buscarEmitenteFiscal } from "@/lib/fiscal";
import BotaoReimprimirNfce from "./BotaoReimprimirNfce";
import CancelarNfce from "./CancelarNfce";
import "./HistoricoNfce.css";

/**
 * <HistoricoNfce> — histórico das NFC-e emitidas do estabelecimento, com ação
 * por linha (reimprimir 2ª via / cancelar).
 *
 * Por que é intuitiva (Princípio nº1): reúne num só lugar as notas do dia a dia
 * com o rótulo do balcão ("Notas fiscais emitidas") e um badge COLORIDO por
 * estado (Autorizada = verde, Pendente = espera, Rejeitada/Cancelada = alerta/
 * neutro) — o operador bate o olho e entende. Os filtros (status em chips,
 * busca por chave, intervalo de datas) estreitam a lista sem jargão. TODOS os
 * estados ficam visíveis: carregando (spinner), vazio (mensagem acolhedora),
 * erro (com "Tentar de novo") e sucesso (lista + "Carregar mais"). As ações são
 * as MESMAS unidades já usadas na venda (<BotaoReimprimirNfce>/<CancelarNfce>),
 * então quem já cancela/reimprime no detalhe reencontra o mesmo comportamento
 * aqui — e o cancelamento recarrega a linha na hora (feedback imediato).
 *
 * FRONTEIRA DE SEGREDO intacta: lê só documento público (número, chave,
 * protocolo, status, valor). Nunca toca em certificado/CSC.
 */
const STATUS_FILTROS = [
  { valor: "todas",      label: "Todas" },
  { valor: "autorizada", label: "Autorizadas" },
  { valor: "pendente",   label: "Pendentes" },
  { valor: "rejeitada",  label: "Rejeitadas" },
  { valor: "cancelada",  label: "Canceladas" },
];

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function HistoricoNfce() {
  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [busca, setBusca]         = useState("");   // texto do campo
  const [buscaAtiva, setBuscaAtiva] = useState(""); // termo já submetido
  const [de, setDe]   = useState("");
  const [ate, setAte] = useState("");

  const [linhas, setLinhas]       = useState([]);
  const [pagina, setPagina]       = useState(0);
  const [temMais, setTemMais]     = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]           = useState(false);
  const [emit, setEmit]           = useState(null);

  // Identidade do emitente (cabeçalho do cupom na reimpressão) — carrega UMA
  // vez, não por linha.
  useEffect(() => {
    let ativo = true;
    buscarEmitenteFiscal().then((e) => { if (ativo) setEmit(e); });
    return () => { ativo = false; };
  }, []);

  const carregarPagina = useCallback(async (p, { anexar }) => {
    setCarregando(true);
    setErro(false);
    const { data, error, temMais: mais } = await listarNfceEmitidas({
      status: filtroStatus,
      busca: buscaAtiva,
      de: de ? new Date(`${de}T00:00:00`).toISOString() : null,
      ate: ate ? new Date(`${ate}T23:59:59`).toISOString() : null,
      pagina: p,
    });
    if (error) {
      setErro(true);
      setCarregando(false);
      return;
    }
    setLinhas((prev) => (anexar ? [...prev, ...data] : data));
    setTemMais(mais);
    setPagina(p);
    setCarregando(false);
  }, [filtroStatus, buscaAtiva, de, ate]);

  // Recarrega do zero quando qualquer filtro muda.
  useEffect(() => { carregarPagina(0, { anexar: false }); }, [carregarPagina]);

  const recarregar = () => carregarPagina(0, { anexar: false });

  const submeterBusca = (e) => {
    e.preventDefault();
    setBuscaAtiva(busca.trim());
  };

  return (
    <div className="historico-nfce">
      <header className="historico-nfce__cabecalho">
        <h1 className="historico-nfce__titulo">
          <LuReceipt size={22} /> Notas fiscais emitidas
        </h1>

        <div className="historico-nfce__filtros">
          <div className="historico-nfce__chips" role="group" aria-label="Filtrar por situação">
            {STATUS_FILTROS.map((f) => (
              <button
                key={f.valor}
                type="button"
                className={`historico-nfce__chip ${filtroStatus === f.valor ? "historico-nfce__chip--ativo" : ""}`}
                aria-pressed={filtroStatus === f.valor}
                onClick={() => setFiltroStatus(f.valor)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <form className="historico-nfce__busca" onSubmit={submeterBusca}>
            <LuSearch size={16} className="historico-nfce__busca-icone" />
            <input
              type="search"
              className="historico-nfce__busca-input"
              placeholder="Buscar pela chave de acesso"
              aria-label="Buscar pela chave de acesso"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </form>

          <div className="historico-nfce__datas">
            <label className="historico-nfce__data">
              De
              <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
            </label>
            <label className="historico-nfce__data">
              Até
              <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
            </label>
          </div>
        </div>
      </header>

      {/* Carregando (primeira página) */}
      {carregando && linhas.length === 0 && (
        <div className="historico-nfce__estado">
          <LuLoaderCircle size={30} className="historico-nfce__spinner" />
          <p>Carregando as notas emitidas…</p>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="historico-nfce__estado historico-nfce__estado--erro">
          <LuTriangleAlert size={30} />
          <p>Não foi possível carregar as notas.</p>
          <button type="button" className="historico-nfce__retry" onClick={recarregar}>
            <LuRotateCw size={15} /> Tentar de novo
          </button>
        </div>
      )}

      {/* Vazio */}
      {!carregando && !erro && linhas.length === 0 && (
        <div className="historico-nfce__estado">
          <LuInbox size={30} />
          <p>Nenhuma nota fiscal por aqui ainda.</p>
          <span className="historico-nfce__dica">
            Assim que uma venda emitir NFC-e, ela aparece nesta lista. Ajuste os filtros acima para ampliar a busca.
          </span>
        </div>
      )}

      {/* Lista */}
      {linhas.length > 0 && (
        <>
          <ul className="historico-nfce__lista">
            {linhas.map((nota) => (
              <LinhaNota key={nota.id} nota={nota} emit={emit} onCancelada={recarregar} />
            ))}
          </ul>

          <div className="historico-nfce__rodape">
            {temMais && (
              <button
                type="button"
                className="historico-nfce__mais"
                onClick={() => carregarPagina(pagina + 1, { anexar: true })}
                disabled={carregando}
              >
                {carregando
                  ? (<><LuLoaderCircle size={15} className="historico-nfce__spinner" /> Carregando…</>)
                  : "Carregar mais"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Uma linha do histórico: identificação + estado + ações. */
function LinhaNota({ nota, emit, onCancelada }) {
  const b = badgeStatus(nota.status);
  const quando = nota.dh_emi ?? nota.created_at;
  const venda = { id: nota.venda_id };

  return (
    <li className="historico-nfce__linha">
      <div className="historico-nfce__ident">
        <span className="historico-nfce__numero">{identificacao(nota)}</span>
        <span className="historico-nfce__meta">
          {formatarData(quando)}
          {nota.tp_amb === 2 && <span className="historico-nfce__homolog"> · homologação</span>}
        </span>
      </div>

      <div className="historico-nfce__valor">{formatarValor(nota.v_nf)}</div>

      <span className={`historico-nfce__badge historico-nfce__badge--${b.mod}`}>
        <b.Icone size={14} /> {b.label}
      </span>

      <div className="historico-nfce__acoes">
        <BotaoReimprimirNfce registroInicial={nota} venda={venda} emit={emit} />
        <CancelarNfce registroInicial={nota} venda={venda} onCancelada={onCancelada} />
      </div>
    </li>
  );
}

/** Identificação legível da nota (número/série) com fallback para a chave. */
function identificacao(nota) {
  if (nota.numero != null) {
    return `Nº ${nota.numero}${nota.serie != null ? ` · Série ${nota.serie}` : ""}`;
  }
  const chave = String(nota.chave ?? "").replace(/\D/g, "");
  return chave ? `…${chave.slice(-8)}` : "Nota fiscal";
}

function badgeStatus(status) {
  switch (status) {
    case "autorizada": return { label: "Autorizada", mod: "ok",        Icone: LuCircleCheck };
    case "pendente":   return { label: "Pendente",   mod: "pendente",  Icone: LuClock };
    case "rejeitada":  return { label: "Rejeitada",  mod: "rejeitada", Icone: LuCircleX };
    case "cancelada":  return { label: "Cancelada",  mod: "cancelada", Icone: LuBan };
    default:           return { label: status || "—", mod: "neutro",   Icone: LuReceipt };
  }
}

function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatarValor(v) {
  if (v == null || Number.isNaN(Number(v))) return "";
  return MOEDA.format(Number(v));
}
