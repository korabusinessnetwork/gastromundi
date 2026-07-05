import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { buscarInsights, atualizarStatusInsight } from "@/lib/jarvas";
import { perguntarAoJarvas } from "@/lib/jarvasAssistente";
import C from "@/constants/colors";
import { LuSparkles, LuX, LuCheck, LuTrash2, LuArrowRight, LuSend } from "react-icons/lu";

/**
 * Jarvas — central de insights (fase 4 da spec JARVAS.md).
 * Sino flutuante com badge de não lidos + painel lateral.
 * Severidade segue a semântica de cores do Design System:
 * info → azul · warning → âmbar · danger → vermelho.
 */

const COR_SEVERIDADE = { info: C.blue, warning: "#f59e0b", danger: C.red };
const LABEL_TIPO = { insight: "Insight", alerta: "Alerta", sugestao: "Sugestão" };
const ROTA_ACAO = {
  abrir_estoque: "/app/estoque",
  abrir_relatorio: "/app/relatorio",
  abrir_fechamentos: "/app/relatorio",
  abrir_logs: "/app/admin",
  abrir_financeiro: "/app/financeiro",
};

const tempoRelativo = (iso) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

export default function JarvasPanel() {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [insights, setInsights] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // ── Assistente conversacional (fase 5 — só admin/gerente) ──
  const [aba, setAba] = useState("insights");
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [perguntando, setPerguntando] = useState(false);
  const fimChatRef = useRef(null);
  const podeConversar = ["admin", "gerente"].includes(currentUser?.role);

  useEffect(() => {
    fimChatRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, perguntando]);

  const enviarPergunta = async () => {
    const pergunta = texto.trim();
    if (!pergunta || perguntando) return;
    setTexto("");
    const historico = mensagens.slice(-6);
    setMensagens((prev) => [...prev, { papel: "usuario", texto: pergunta }]);
    setPerguntando(true);
    const { resposta, error } = await perguntarAoJarvas(pergunta, historico);
    setMensagens((prev) => [...prev, { papel: "jarvas", texto: resposta ?? error ?? "Não consegui responder agora." }]);
    setPerguntando(false);
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await buscarInsights({ status: ["novo", "lido"], limite: 50 });
    setInsights(data ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (currentUser) carregar();
  }, [currentUser, carregar]);

  useEffect(() => {
    if (aberto) carregar();
  }, [aberto, carregar]);

  // ── Realtime: novos insights e mudanças de status entre dispositivos ──
  // O postgres_changes respeita RLS — cada operador só recebe os insights
  // que já poderia ver (ex.: estratégico só chega para gerente/admin).
  // Requer Realtime habilitado na tabela `jarvas_insights` (Database → Replication).
  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel("jarvas-insights-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvas_insights" }, (payload) => {
        setInsights(prev => prev.find(i => i.id === payload.new.id) ? prev : [payload.new, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jarvas_insights" }, (payload) => {
        const atualizado = payload.new;
        setInsights(prev =>
          ["descartado", "executado"].includes(atualizado.status)
            ? prev.filter(i => i.id !== atualizado.id)
            : prev.map(i => (i.id === atualizado.id ? atualizado : i)),
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  if (!currentUser) return null;

  const naoLidos = insights.filter((i) => i.status === "novo").length;

  const mudarStatus = async (id, status) => {
    setInsights((prev) =>
      status === "descartado" || status === "executado"
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, status } : i)),
    );
    await atualizarStatusInsight(id, status, currentUser.username);
  };

  const executarAcao = async (insight) => {
    const rota = ROTA_ACAO[insight?.acao?.tipo];
    await mudarStatus(insight.id, "executado");
    setAberto(false);
    if (rota) navigate(rota, { state: { ts: Date.now(), jarvas: insight.acao?.params ?? {} } });
  };

  return (
    <>
      {/* ── Sino flutuante ─────────────────────────────────────── */}
      <button
        onClick={() => setAberto((v) => !v)}
        title="Jarvas — insights e alertas"
        style={{
          position: "fixed", right: 18, bottom: 18, zIndex: 400,
          width: 52, height: 52, borderRadius: "50%",
          background: naoLidos > 0 ? C.accent : C.card,
          border: `1px solid ${naoLidos > 0 ? C.accent : C.border}`,
          color: naoLidos > 0 ? "#fff" : C.muted,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 18px rgba(0,0,0,0.45)",
          transition: "background 0.15s, color 0.15s",
        }}
      >
        <LuSparkles size={22} />
        {naoLidos > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 20, height: 20, padding: "0 5px",
            borderRadius: 10, background: C.red, color: "#fff",
            fontSize: 11, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {naoLidos > 99 ? "99+" : naoLidos}
          </span>
        )}
      </button>

      {/* ── Painel lateral ─────────────────────────────────────── */}
      {aberto && (
        <>
          <div
            onClick={() => setAberto(false)}
            style={{ position: "fixed", inset: 0, zIndex: 401, background: "rgba(0,0,0,0.5)" }}
          />
          <div style={{
            position: "fixed", right: 0, top: 0, zIndex: 402,
            width: "min(400px, 92vw)", height: "100dvh",
            background: C.card, borderLeft: `1px solid ${C.border}`,
            display: "flex", flexDirection: "column",
            fontFamily: "'Inter',system-ui,sans-serif", color: C.text,
          }}>
            {/* Cabeçalho */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "16px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
            }}>
              <LuSparkles size={18} color={C.accent} />
              <div style={{ flex: 1, fontWeight: 900, fontSize: 15, letterSpacing: "-0.3px" }}>
                Jarvas
                <span style={{ color: C.muted, fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                  insights · alertas · sugestões
                </span>
              </div>
              <button
                onClick={() => setAberto(false)}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4 }}
              >
                <LuX size={18} />
              </button>
            </div>

            {/* Abas (assistente só para gerência) */}
            {podeConversar && (
              <div style={{ display: "flex", gap: 6, padding: "10px 14px 0", flexShrink: 0 }}>
                {[["insights", "Insights"], ["chat", "Perguntar ao Jarvas"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setAba(id)}
                    style={{
                      flex: 1, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                      fontSize: 12.5, fontWeight: 700,
                      background: aba === id ? C.alow : "none",
                      border: `1px solid ${aba === id ? `${C.accent}55` : C.border}`,
                      color: aba === id ? C.accent : C.muted,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Aba: conversa ─────────────────────────────────── */}
            {podeConversar && aba === "chat" && (
              <>
                <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
                  {mensagens.length === 0 && (
                    <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 24, lineHeight: 1.6 }}>
                      Pergunte sobre o negócio — vendas, estoque, caixa.<br />
                      Ex.: “Como foram as vendas esta semana?”<br />
                      <span style={{ fontSize: 11.5 }}>O Jarvas responde só com base nos seus dados reais.</span>
                    </div>
                  )}
                  {mensagens.map((m, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: m.papel === "usuario" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                      <div style={{
                        maxWidth: "85%", padding: "9px 12px", borderRadius: 12,
                        fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
                        background: m.papel === "usuario" ? C.accent : C.surface,
                        border: m.papel === "usuario" ? "none" : `1px solid ${C.border}`,
                        color: m.papel === "usuario" ? "#fff" : C.text,
                      }}>
                        {m.texto}
                      </div>
                    </div>
                  ))}
                  {perguntando && (
                    <div style={{ color: C.muted, fontSize: 12.5, padding: "4px 2px" }}>Jarvas está analisando…</div>
                  )}
                  <div ref={fimChatRef} />
                </div>
                <div style={{
                  display: "flex", gap: 8, padding: 12,
                  borderTop: `1px solid ${C.border}`, flexShrink: 0,
                }}>
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") enviarPergunta(); }}
                    placeholder="Pergunte ao Jarvas…"
                    maxLength={1000}
                    style={{
                      flex: 1, background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 10, padding: "10px 12px", color: C.text,
                      fontSize: 13, outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={enviarPergunta}
                    disabled={perguntando || !texto.trim()}
                    style={{
                      background: texto.trim() && !perguntando ? C.accent : C.faint,
                      border: "none", borderRadius: 10, color: "#fff",
                      padding: "0 14px", cursor: texto.trim() && !perguntando ? "pointer" : "default",
                      display: "flex", alignItems: "center",
                    }}
                  >
                    <LuSend size={16} />
                  </button>
                </div>
              </>
            )}

            {/* Lista */}
            {(aba === "insights" || !podeConversar) && (
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {carregando && insights.length === 0 && (
                <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 24 }}>Carregando…</div>
              )}
              {!carregando && insights.length === 0 && (
                <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 24 }}>
                  Tudo em ordem por aqui. O Jarvas avisa quando algo merecer atenção.
                </div>
              )}
              {insights.map((i) => {
                const cor = COR_SEVERIDADE[i.severidade] ?? C.blue;
                return (
                  <div key={i.id} style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${cor}`, borderRadius: 10,
                    padding: "12px 14px", marginBottom: 10,
                    opacity: i.status === "lido" ? 0.75 : 1,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                        color: cor, background: `${cor}22`,
                        padding: "2px 7px", borderRadius: 8, letterSpacing: "0.4px",
                      }}>
                        {LABEL_TIPO[i.tipo] ?? i.tipo}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>{i.modulo}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 11, color: C.muted }}>{tempoRelativo(i.created_at)}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{i.titulo}</div>
                    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>{i.descricao}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {i.acao?.label && (
                        <button
                          onClick={() => executarAcao(i)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: C.alow, border: `1px solid ${C.accent}55`,
                            color: C.accent, borderRadius: 8, padding: "6px 10px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          {i.acao.label} <LuArrowRight size={13} />
                        </button>
                      )}
                      <span style={{ flex: 1 }} />
                      {i.status === "novo" && (
                        <button
                          onClick={() => mudarStatus(i.id, "lido")}
                          title="Marcar como lido"
                          style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 8px", cursor: "pointer" }}
                        >
                          <LuCheck size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => mudarStatus(i.id, "descartado")}
                        title="Descartar"
                        style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 8px", cursor: "pointer" }}
                      >
                        <LuTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
