import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSessao } from "@/context/AppContext";
import { assinarInsightsJarvas } from "@/features/jarvas/dados/insights";
import { buscarInsights, atualizarStatusInsight } from "@/features/jarvas/dados/jarvas";
import { perguntarAoJarvas } from "@/features/jarvas/dados/jarvasAssistente";
import { novoUid } from "@/lib/uidLista";
import { LuSparkles, LuX, LuCheck, LuTrash2, LuArrowRight, LuSend } from "react-icons/lu";
import "./JarvasPanel.css";
import { ehGerencia } from "@/constants/roles";

/**
 * Jarvas — central de insights (fase 4 da spec JARVAS.md).
 * Sino flutuante com badge de não lidos + painel lateral.
 * Severidade segue a semântica de cores do Design System:
 * info → azul · warning → âmbar · danger → vermelho.
 */

// A cor de cada severidade mora em JarvasPanel.css (jarvas-insight--<severidade>).
const SEVERIDADES = ["info", "warning", "danger"];
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
  const { currentUser } = useSessao();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [insights, setInsights] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // ── Assistente conversacional (fase 5 — só admin/gerente) ──
  const [aba, setAba] = useState("insights");
  // TD015: a conversa é append-only hoje, mas cada balão é um nó que o React reusa
  // pela chave, e a lista rola sozinha a cada mensagem nova. Identidade própria
  // mantém cada balão no lugar certo quando a tela ganhar "limpar conversa" ou
  // reenvio. O `uid` vive só aqui: nada desta lista vai para o banco.
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [perguntando, setPerguntando] = useState(false);
  const fimChatRef = useRef(null);
  const podeConversar = ehGerencia(currentUser);

  useEffect(() => {
    fimChatRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, perguntando]);

  const enviarPergunta = async () => {
    const pergunta = texto.trim();
    if (!pergunta || perguntando) return;
    setTexto("");
    const historico = mensagens.slice(-6);
    setMensagens((prev) => [...prev, { papel: "usuario", texto: pergunta, uid: novoUid() }]);
    setPerguntando(true);
    const { resposta, error } = await perguntarAoJarvas(pergunta, historico);
    setMensagens((prev) => [...prev, { papel: "jarvas", texto: resposta ?? error ?? "Não consegui responder agora.", uid: novoUid() }]);
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
    return assinarInsightsJarvas({
      aoInserir: (novo) => {
        setInsights(prev => prev.find(i => i.id === novo.id) ? prev : [novo, ...prev]);
      },
      aoAtualizar: (atualizado) => {
        setInsights(prev =>
          ["descartado", "executado"].includes(atualizado.status)
            ? prev.filter(i => i.id !== atualizado.id)
            : prev.map(i => (i.id === atualizado.id ? atualizado : i)),
        );
      },
    });
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
        title="Jarvas, insights e alertas"
        className={`jarvas-bell${naoLidos > 0 ? " jarvas-bell--novos" : ""}`}
      >
        <LuSparkles size={22} />
        {naoLidos > 0 && (
          <span className="jarvas-bell__badge">
            {naoLidos > 99 ? "99+" : naoLidos}
          </span>
        )}
      </button>

      {/* ── Painel lateral ─────────────────────────────────────── */}
      {aberto && (
        <>
          <div
            onClick={() => setAberto(false)}
            className="jarvas-fundo"
          />
          <div className="jarvas-panel">
            {/* Cabeçalho */}
            <div className="jarvas-header">
              <LuSparkles size={18} className="jarvas-header__icone" />
              <div className="jarvas-header__title">
                Jarvas
                <span className="jarvas-header__subtitle">
                  insights · alertas · sugestões
                </span>
              </div>
              <button
                onClick={() => setAberto(false)}
                className="jarvas-header__fechar"
              >
                <LuX size={18} />
              </button>
            </div>

            {/* Abas (assistente só para gerência) */}
            {podeConversar && (
              <div className="jarvas-tabs">
                {[["insights", "Insights"], ["chat", "Perguntar ao Jarvas"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setAba(id)}
                    className={`jarvas-tabs__button${aba === id ? " jarvas-tabs__button--ativa" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Aba: conversa ─────────────────────────────────── */}
            {podeConversar && aba === "chat" && (
              <>
                <div className="jarvas-chat">
                  {mensagens.length === 0 && (
                    <div className="jarvas-chat__empty">
                      Pergunte sobre o negócio, vendas, estoque, caixa.<br />
                      Ex.: "Como foram as vendas esta semana?"<br />
                      <span className="jarvas-chat__help">O Jarvas responde só com base nos seus dados reais.</span>
                    </div>
                  )}
                  {mensagens.map((m) => (
                    <div key={m.uid} className={`jarvas-chat__linha jarvas-chat__linha--${m.papel === "usuario" ? "usuario" : "jarvas"}`}>
                      <div className="jarvas-message">
                        {m.texto}
                      </div>
                    </div>
                  ))}
                  {perguntando && (
                    <div className="jarvas-thinking">Jarvas está analisando…</div>
                  )}
                  <div ref={fimChatRef} />
                </div>
                <div className="jarvas-chat__envio">
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") enviarPergunta(); }}
                    placeholder="Pergunte ao Jarvas…"
                    maxLength={1000}
                    className="jarvas-input"
                  />
                  <button
                    onClick={enviarPergunta}
                    disabled={perguntando || !texto.trim()}
                    className="jarvas-chat__enviar"
                  >
                    <LuSend size={16} />
                  </button>
                </div>
              </>
            )}

            {/* Lista */}
            {(aba === "insights" || !podeConversar) && (
            <div className="jarvas-list">
              {carregando && insights.length === 0 && (
                <div className="jarvas-list__loading">Carregando…</div>
              )}
              {!carregando && insights.length === 0 && (
                <div className="jarvas-list__empty">
                  Tudo em ordem por aqui. O Jarvas avisa quando algo merecer atenção.
                </div>
              )}
              {insights.map((i) => {
                const severidade = SEVERIDADES.includes(i.severidade) ? i.severidade : "info";
                return (
                  <div key={i.id} className={`jarvas-insight jarvas-insight--${severidade}${i.status === "lido" ? " jarvas-insight--lido" : ""}`}>
                    <div className="jarvas-insight__topo">
                      <span className="jarvas-insight__badge">
                        {LABEL_TIPO[i.tipo] ?? i.tipo}
                      </span>
                      <span className="jarvas-insight__module">{i.modulo}</span>
                      <span className="jarvas-espaco" />
                      <span className="jarvas-insight__time">{tempoRelativo(i.created_at)}</span>
                    </div>
                    <div className="jarvas-insight__title">{i.titulo}</div>
                    <div className="jarvas-insight__description">{i.descricao}</div>
                    <div className="jarvas-insight__acoes">
                      {i.acao?.label && (
                        <button
                          onClick={() => executarAcao(i)}
                          className="jarvas-insight__action-button"
                        >
                          {i.acao.label} <LuArrowRight size={13} />
                        </button>
                      )}
                      <span className="jarvas-espaco" />
                      {i.status === "novo" && (
                        <button
                          onClick={() => mudarStatus(i.id, "lido")}
                          title="Marcar como lido"
                          className="jarvas-insight__icone-btn"
                        >
                          <LuCheck size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => mudarStatus(i.id, "descartado")}
                        title="Descartar"
                        className="jarvas-insight__icone-btn"
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
