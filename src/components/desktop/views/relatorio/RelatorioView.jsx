import DesempenhoReport from "./DesempenhoReport";
import {
  LuLock, LuX
} from "react-icons/lu";
import Empty from "./Empty";
import FechamentoDetalheModal from "./FechamentoDetalheModal";
import { PERIODOS } from "./apoio";
import { useRelatorios } from "@/features/relatorios/hooks/useRelatorios";
import AbaVendas from "././AbaVendas";
import AbaCancelamentos from "././AbaCancelamentos";
import AbaFechamentos from "././AbaFechamentos";
import AbaLogs from "././AbaLogs";
import AbaCredenciais from "././AbaCredenciais";
import AbaAdmin from "././AbaAdmin";
import "./RelatorioView.css";

export default function RelatorioView() {
  const tela = useRelatorios();
  const {
    aba, setAba, periodo, setPeriodo, customInicio, setCustomInicio, customFim, setCustomFim, fechDetalhe, setFechDetalhe, customLabels, sz, isAdmin, isSuperAdmin, ABAS,
  } = tela;

  return (
    <div className="relatorio-view" style={{ "--rel-pad": `${sz.pad}px`, "--rel-pad-sm": `${sz.padSm}px`, "--rel-gap": `${sz.gap}px` }}>

      {/* ── Header ── */}
      <div className="relatorio-view__topo">
        <div>
          <div className="relatorio-view__titulo">Relatórios</div>
          <div className="relatorio-view__subtitulo">
            Visão geral do movimento do estabelecimento
          </div>
        </div>

        <div className="relatorio-view__periodos-area">
          <div className="relatorio-view__periodos">
            {PERIODOS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className={`relatorio-view__periodo-btn${periodo === p.id ? " relatorio-view__periodo-btn--ativo" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {periodo === "custom" && (
            <div className="relatorio-view__datas">
              <input
                type="date"
                className={`relatorio-date-input${customInicio ? " relatorio-date-input--preenchida" : ""}`}
                value={customInicio}
                onChange={e => setCustomInicio(e.target.value)}
              />
              <span className="relatorio-view__date-sep">até</span>
              <input
                type="date"
                className={`relatorio-date-input${customFim ? " relatorio-date-input--preenchida" : ""}`}
                value={customFim}
                min={customInicio || undefined}
                onChange={e => setCustomFim(e.target.value)}
              />
              {(customInicio || customFim) && (
                <button
                  onClick={() => { setCustomInicio(""); setCustomFim(""); }}
                  className="relatorio-view__limpar-datas"
                  title="Limpar datas"
                >
                  <LuX size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="relatorio-view__abas">
        {ABAS.map(a => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`relatorio-view__aba${aba === a ? " relatorio-view__aba--ativa" : ""}`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* ── Conteúdo ── */}
      <div className="relatorio-view__conteudo">

        {/* ══ VENDAS ══ */}
        {aba === "Vendas" && <AbaVendas tela={tela} />}

        {/* ══ DESEMPENHO (vendas, margem — F011) ══ */}
        {aba === "Desempenho" && !isAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores e gerentes" sz={sz} />
        )}
        {aba === "Desempenho" && isAdmin && <DesempenhoReport />}

        {/* ══ CANCELAMENTOS ══ */}
        {aba === "Cancelamentos" && <AbaCancelamentos tela={tela} />}

        {/* ══ FECHAMENTOS ══ */}
        {aba === "Fechamentos" && <AbaFechamentos tela={tela} />}

        {/* ══ LOGS ══ */}
        {aba === "Logs" && !isAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores e gerentes" sz={sz} />
        )}

        {aba === "Logs" && isAdmin && <AbaLogs tela={tela} />}

        {/* ══ CREDENCIAIS ══ */}
        {aba === "Credenciais" && !isAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores" sz={sz} />
        )}

        {aba === "Credenciais" && isAdmin && <AbaCredenciais tela={tela} />}

        {/* ══ ADMIN (visão consolidada — só role admin) — B3 ══ */}
        {aba === "Admin" && !isSuperAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores" sz={sz} />
        )}
        {aba === "Admin" && isSuperAdmin && <AbaAdmin tela={tela} />}
      </div>

      {fechDetalhe && (
        <FechamentoDetalheModal f={fechDetalhe} customLabels={customLabels} onClose={() => setFechDetalhe(null)} />
      )}
    </div>
  );
}
