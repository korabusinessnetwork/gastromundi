import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import C from "@/constants/colors";
import {
  LuPrinter, LuRefreshCw, LuCircleAlert, LuX,
  LuSettings, LuWifi, LuWifiOff, LuShieldCheck, LuLoader,
  LuPlay, LuSquareCheckBig,
} from "react-icons/lu";

const LS_KEY = "gastromundi:impressoras_config_v2";

function lerConfig() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { return {}; }
}
function salvarConfig(cfg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch {}
}

// ── Estado de conexão com QZ Tray ──────────────────────────────────

function useQZTray() {
  const [status, setStatus]         = useState("idle");     // idle | conectando | conectado | erro
  const [impressoras, setImpressoras] = useState([]);
  const [erroMsg, setErroMsg]       = useState("");

  const conectar = useCallback(async () => {
    setStatus("conectando");
    setErroMsg("");
    try {
      // Importação dinâmica para evitar erro de build em ambientes sem qz-tray
      const qz = (await import("qz-tray")).default;

      if (!qz.websocket.isActive()) {
        await qz.websocket.connect({ retries: 1, delay: 1 });
      }

      const lista = await qz.printers.find();
      setImpressoras(Array.isArray(lista) ? lista : [lista].filter(Boolean));
      setStatus("conectado");
    } catch (e) {
      const msg = e?.message ?? "";
      if (msg.includes("Unable to establish") || msg.includes("Connection refused") || msg.includes("WebSocket")) {
        setErroMsg("QZ Tray não encontrado. Certifique-se de que o QZ Tray está instalado e em execução neste computador.");
      } else {
        setErroMsg(msg || "Erro ao conectar ao QZ Tray.");
      }
      setStatus("erro");
    }
  }, []);

  const atualizar = useCallback(async () => {
    if (status !== "conectado") { await conectar(); return; }
    try {
      const qz = (await import("qz-tray")).default;
      const lista = await qz.printers.find();
      setImpressoras(Array.isArray(lista) ? lista : [lista].filter(Boolean));
    } catch {
      setStatus("idle");
    }
  }, [status, conectar]);

  return { status, impressoras, erroMsg, conectar, atualizar };
}

// ── Modal de seleção de impressora para um local ───────────────────

function ModalSelecionarImpressora({ local, impressoras, onClose, sz }) {
  const cfgAtual = lerConfig()[local.id] ?? null;
  const [selecionada, setSelecionada] = useState(cfgAtual?.nome ?? "");

  const salvar = () => {
    const cfg = lerConfig();
    if (selecionada) {
      cfg[local.id] = { nome: selecionada };
    } else {
      delete cfg[local.id];
    }
    salvarConfig(cfg);
    onClose(true);
  };

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 9200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div style={{ background: C.card, borderRadius: 20, width: "100%", maxWidth: 480, border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 20, padding: 28, maxHeight: "85vh" }}>

        {/* Título */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>Selecionar Impressora</div>
            <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>
              Local: <strong>{local.nome}</strong>
            </div>
          </div>
          <button onClick={() => onClose(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0, padding: 4 }}>
            <LuX size={20} />
          </button>
        </div>

        {/* Lista de impressoras */}
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {/* Opção "Nenhuma" */}
          <button
            onClick={() => setSelecionada("")}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 12, cursor: "pointer",
              border: `1.5px solid ${selecionada === "" ? C.red + "66" : C.border}`,
              background: selecionada === "" ? `${C.red}08` : C.surface,
              textAlign: "left", fontFamily: "inherit",
            }}
          >
            <LuX size={18} color={selecionada === "" ? C.red : C.muted} />
            <div style={{ fontWeight: 600, fontSize: sz.fontBase, color: selecionada === "" ? C.red : C.muted }}>
              Nenhuma (não imprimir neste local)
            </div>
          </button>

          {impressoras.map(nome => {
            const ativo = selecionada === nome;
            return (
              <button
                key={nome}
                onClick={() => setSelecionada(nome)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                  border: `1.5px solid ${ativo ? C.accent : C.border}`,
                  background: ativo ? `${C.accent}10` : C.surface,
                  textAlign: "left", fontFamily: "inherit",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <LuPrinter size={18} color={ativo ? C.accent : C.muted} />
                <div style={{ flex: 1, fontWeight: ativo ? 700 : 500, fontSize: sz.fontBase, color: ativo ? C.accent : C.text, textAlign: "left" }}>
                  {nome}
                </div>
                {ativo && (
                  <LuShieldCheck size={16} color={C.accent} />
                )}
              </button>
            );
          })}
        </div>

        {/* Ações */}
        <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => onClose(false)}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit" }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Tab principal ──────────────────────────────────────────────────

export default function ImpressorasConfig({ sz }) {
  const { status, impressoras, erroMsg, conectar, atualizar } = useQZTray();
  const [locais, setLocais]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs]   = useState(lerConfig());
  const [modal, setModal]       = useState(null); // local object
  const [testando, setTestando] = useState({}); // { [localId]: "idle"|"ok"|"erro" }

  useEffect(() => {
    supabase
      .from("locais_impressao")
      .select("id,nome,descricao,ativo")
      .order("created_at", { ascending: true })
      .then(({ data }) => { setLocais(data ?? []); setLoading(false); });
  }, []);

  const handleFecharModal = (salvou) => {
    setModal(null);
    if (salvou) setConfigs(lerConfig());
  };

  const removerConfig = (localId) => {
    const cfg = lerConfig();
    delete cfg[localId];
    salvarConfig(cfg);
    setConfigs(lerConfig());
  };

  const imprimirTeste = async (local, nomePrinter) => {
    setTestando(prev => ({ ...prev, [local.id]: "idle" }));
    try {
      const qz = (await import("qz-tray")).default;
      const config = qz.configs.create(nomePrinter);

      const agora = new Date().toLocaleString("pt-BR");
      const linha = (txt, tamanho = 32) => txt.padEnd(tamanho).slice(0, tamanho);

      const dados = [
        { type: "raw", format: "plain", data:
          "\x1B\x40"                          // inicializa impressora
          + "\x1B\x61\x01"                    // centraliza
          + "\x1B\x21\x30"                    // fonte dupla (grande)
          + "GASTROMUNDI\n"
          + "\x1B\x21\x00"                    // fonte normal
          + "by Kora\n"
          + "--------------------------------\n"
          + "\x1B\x61\x00"                    // alinha esquerda
          + `Local: ${local.nome}\n`
          + `Impressora: ${nomePrinter}\n`
          + `Data: ${agora}\n`
          + "--------------------------------\n"
          + "\x1B\x61\x01"                    // centraliza
          + "IMPRESSAO DE TESTE OK\n"
          + "--------------------------------\n"
          + "\n\n\n"
          + "\x1D\x56\x41\x03"               // corte parcial
        },
      ];

      await qz.print(config, dados);
      setTestando(prev => ({ ...prev, [local.id]: "ok" }));
      setTimeout(() => setTestando(prev => ({ ...prev, [local.id]: undefined })), 4000);
    } catch (e) {
      console.error("[imprimirTeste]", e);
      setTestando(prev => ({ ...prev, [local.id]: "erro" }));
      setTimeout(() => setTestando(prev => ({ ...prev, [local.id]: undefined })), 4000);
    }
  };

  // ── Banner de conexão QZ Tray ────────────────────────────────────

  const renderBannerQZ = () => {
    if (status === "idle") {
      return (
        <div style={{ padding: "16px 20px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14 }}>
          <LuWifi size={22} color={C.muted} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>Conectar ao QZ Tray</div>
            <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>
              O QZ Tray lê as impressoras instaladas no Windows e as disponibiliza para o sistema. Certifique-se de que ele está em execução neste computador.
            </div>
          </div>
          <button
            onClick={conectar}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: sz.fontSm, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
          >
            Conectar
          </button>
        </div>
      );
    }

    if (status === "conectando") {
      return (
        <div style={{ padding: "16px 20px", borderRadius: 14, background: `${C.accent}08`, border: `1px solid ${C.accent}33`, display: "flex", alignItems: "center", gap: 14 }}>
          <LuLoader size={20} color={C.accent} style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: sz.fontBase, color: C.accent, fontWeight: 600 }}>Conectando ao QZ Tray…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    if (status === "erro") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "16px 20px", borderRadius: 14, background: `${C.red}08`, border: `1px solid ${C.red}33`, display: "flex", alignItems: "flex-start", gap: 14 }}>
            <LuWifiOff size={22} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: C.red }}>QZ Tray não encontrado</div>
              <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>{erroMsg}</div>
            </div>
            <button
              onClick={conectar}
              style={{ padding: "8px 16px", borderRadius: 9, border: `1px solid ${C.red}44`, background: `${C.red}10`, color: C.red, fontWeight: 600, fontSize: sz.fontSm, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
            >
              <LuRefreshCw size={13} /> Tentar novamente
            </button>
          </div>

          {/* Instruções de instalação */}
          <div style={{ padding: "16px 20px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, fontSize: sz.fontSm, lineHeight: 1.7, color: C.muted }}>
            <div style={{ fontWeight: 700, color: C.text, marginBottom: 8, fontSize: sz.fontBase }}>Como instalar o QZ Tray</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Acesse <strong style={{ color: C.accent }}>qz.io</strong> e baixe o instalador para Windows</li>
              <li>Execute a instalação (não requer configuração)</li>
              <li>O QZ Tray iniciará automaticamente na bandeja do sistema</li>
              <li>Volte aqui e clique em <strong>Tentar novamente</strong></li>
            </ol>
          </div>
        </div>
      );
    }

    if (status === "conectado") {
      return (
        <div style={{ padding: "12px 20px", borderRadius: 14, background: `${C.green}08`, border: `1px solid ${C.green}33`, display: "flex", alignItems: "center", gap: 12 }}>
          <LuWifi size={18} color={C.green} />
          <div style={{ flex: 1, fontSize: sz.fontBase, color: C.green, fontWeight: 600 }}>
            QZ Tray conectado · {impressoras.length} impressora{impressoras.length !== 1 ? "s" : ""} encontrada{impressoras.length !== 1 ? "s" : ""}
          </div>
          <button
            onClick={atualizar}
            title="Atualizar lista"
            style={{ background: "none", border: `1px solid ${C.green}44`, borderRadius: 8, color: C.green, cursor: "pointer", padding: "6px 8px", lineHeight: 0 }}
          >
            <LuRefreshCw size={14} />
          </button>
        </div>
      );
    }
  };

  if (loading) {
    return <div style={{ color: C.muted, fontSize: sz.fontBase, padding: 40, textAlign: "center" }}>Carregando…</div>;
  }

  const conectado = status === "conectado";

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: sz.pad }}>

      {/* Banner QZ Tray */}
      {renderBannerQZ()}

      {/* Aviso de configuração por dispositivo */}
      {conectado && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: `${C.blue}0e`, border: `1px solid ${C.blue}22`, fontSize: sz.fontSm, color: C.muted }}>
          <strong style={{ color: C.blue }}>ℹ Por dispositivo</strong> — Esta configuração é salva localmente neste computador. Cada máquina escolhe suas próprias impressoras.
        </div>
      )}

      {/* Locais sem QZ conectado — mostra config salva, sem interação */}
      {locais.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "40px 24px", textAlign: "center", color: C.muted }}>
          <LuPrinter size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>Nenhum local de impressão cadastrado</div>
          <div style={{ fontSize: sz.fontSm, marginTop: 4 }}>Crie locais na aba <strong>Locais de Impressão</strong> primeiro.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {locais.map(local => {
            const cfg = configs[local.id] ?? null;
            return (
              <div
                key={local.id}
                style={{
                  background: C.card,
                  border: `1px solid ${cfg ? C.border : C.border}`,
                  borderRadius: 14,
                  padding: `${sz.padSm + 2}px ${sz.pad}px`,
                  display: "flex", alignItems: "center", gap: 14,
                  opacity: local.ativo ? 1 : 0.5,
                }}
              >
                {/* Ícone */}
                <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: cfg ? `${C.accent}18` : C.surface, border: `1px solid ${cfg ? C.accent + "44" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LuPrinter size={19} color={cfg ? C.accent : C.muted} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>
                    {local.nome}
                    {!local.ativo && <span style={{ fontSize: sz.fontSm, color: C.muted, marginLeft: 8, fontWeight: 400 }}>· inativo</span>}
                  </div>
                  <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cfg
                      ? <span style={{ color: C.accent, fontWeight: 600 }}>{cfg.nome}</span>
                      : "Sem impressora configurada"
                    }
                  </div>
                </div>

                {/* Badge */}
                {cfg ? (
                  <span style={{ fontSize: sz.fontSm - 1, fontWeight: 700, background: `${C.green}15`, border: `1px solid ${C.green}44`, color: C.green, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    Configurada
                  </span>
                ) : (
                  <span style={{ fontSize: sz.fontSm - 1, fontWeight: 700, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    Pendente
                  </span>
                )}

                {/* Botões */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  {/* Botão teste — só aparece quando configurado + conectado */}
                  {cfg && conectado && (() => {
                    const st = testando[local.id];
                    const ocupado = st === "idle";
                    return (
                      <button
                        onClick={() => !ocupado && imprimirTeste(local, cfg.nome)}
                        disabled={ocupado}
                        title="Imprimir página de teste"
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 13px", borderRadius: 9,
                          border: `1.5px solid ${st === "ok" ? C.green + "66" : st === "erro" ? C.red + "66" : C.border}`,
                          background: st === "ok" ? `${C.green}0f` : st === "erro" ? `${C.red}0f` : C.surface,
                          color: st === "ok" ? C.green : st === "erro" ? C.red : C.muted,
                          cursor: ocupado ? "not-allowed" : "pointer",
                          fontWeight: 600, fontSize: sz.fontSm, fontFamily: "inherit",
                          transition: "border-color 0.15s, background 0.15s",
                        }}
                      >
                        {ocupado
                          ? <LuLoader size={13} style={{ animation: "spin 1s linear infinite" }} />
                          : st === "ok"
                            ? <LuSquareCheckBig size={13} />
                            : st === "erro"
                              ? <LuCircleAlert size={13} />
                              : <LuPlay size={13} />
                        }
                        {st === "ok" ? "Enviado!" : st === "erro" ? "Erro" : "Testar"}
                      </button>
                    );
                  })()}

                  {cfg && (
                    <button
                      onClick={() => removerConfig(local.id)}
                      title="Remover impressora"
                      style={{ padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.red}33`, background: `${C.red}0a`, color: C.red, cursor: "pointer", lineHeight: 0 }}
                    >
                      <LuX size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => conectado ? setModal(local) : conectar()}
                    disabled={status === "conectando"}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: `1.5px solid ${conectado ? C.border : C.accent + "66"}`, background: conectado ? C.surface : `${C.accent}08`, color: conectado ? C.text : C.accent, cursor: status === "conectando" ? "not-allowed" : "pointer", fontWeight: 600, fontSize: sz.fontSm, fontFamily: "inherit", transition: "border-color 0.15s" }}
                    onMouseEnter={e => { if (conectado) e.currentTarget.style.borderColor = C.accent + "66"; }}
                    onMouseLeave={e => { if (conectado) e.currentTarget.style.borderColor = C.border; }}
                  >
                    <LuSettings size={14} />
                    {conectado ? (cfg ? "Trocar" : "Selecionar") : "Conectar QZ"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de seleção */}
      {modal && conectado && (
        <ModalSelecionarImpressora
          local={modal}
          impressoras={impressoras}
          sz={sz}
          onClose={handleFecharModal}
        />
      )}
    </div>
  );
}
