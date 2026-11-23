import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: varColor(C.bg), overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{
        padding: `${sz.pad - 4}px ${sz.pad}px`,
        borderBottom: `1px solid var(${C.border})`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0, gap: 16, flexWrap: "wrap",
      }}>
        <div>
          <div className="relatorio-view__titulo" style={{ fontWeight: 800 }}>Relatórios</div>
          <div className="relatorio-view__subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
            Visão geral do movimento do estabelecimento
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {PERIODOS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className="relatorio-view__periodo-btn"
                style={{
                  padding: "8px 16px", borderRadius: 10, border: "none",
                  background: periodo === p.id ? varColor(C.accent) : varColor(C.surface),
                  color: periodo === p.id ? "#fff" : varColor(C.muted),
                  cursor: "pointer", fontWeight: 600,
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {periodo === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <style>{`
                .relatorio-date-input::-webkit-calendar-picker-indicator {
                  filter: invert(1);
                  cursor: pointer;
                  opacity: 0.7;
                }
              `}</style>
              <input
                type="date"
                className="relatorio-date-input"
                value={customInicio}
                onChange={e => setCustomInicio(e.target.value)}
                style={{
                  padding: "7px 12px", borderRadius: 9,
                  border: `1.5px solid ${customInicio ? varColor(C.accent) : varColor(C.border)}`,
                  background: varColor(C.surface), color: varColor(C.text),
                  fontFamily: "inherit", outline: "none",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
              />
              <span className="relatorio-view__date-sep" style={{ color: varColor(C.muted), fontWeight: 600 }}>até</span>
              <input
                type="date"
                className="relatorio-date-input"
                value={customFim}
                min={customInicio || undefined}
                onChange={e => setCustomFim(e.target.value)}
                style={{
                  padding: "7px 12px", borderRadius: 9,
                  border: `1.5px solid ${customFim ? varColor(C.accent) : varColor(C.border)}`,
                  background: varColor(C.surface), color: varColor(C.text),
                  fontFamily: "inherit", outline: "none",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
              />
              {(customInicio || customFim) && (
                <button
                  onClick={() => { setCustomInicio(""); setCustomFim(""); }}
                  style={{
                    background: "none", border: `1px solid var(${C.border})`,
                    borderRadius: 8, padding: "6px 8px", cursor: "pointer",
                    color: varColor(C.muted), display: "flex", alignItems: "center",
                    transition: "border-color 0.15s",
                  }}
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
      <div style={{
        display: "flex", padding: `0 ${sz.pad}px`,
        borderBottom: `1px solid var(${C.border})`, flexShrink: 0,
        overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
      }}>
        {ABAS.map(a => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className="relatorio-view__aba"
            style={{
              padding: "14px 22px", border: "none", background: "none",
              color: aba === a ? varColor(C.accent) : varColor(C.muted),
              fontWeight: aba === a ? 700 : 500,
              cursor: "pointer",
              borderBottom: `2px solid ${aba === a ? varColor(C.accent) : "transparent"}`,
              marginBottom: -1, transition: "color 0.15s",
            }}
          >
            {a}
          </button>
        ))}
      </div>

      {/* ── Conteúdo ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

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
