import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor, nomeExibicaoTenant } from "@/lib/tema";
import { useApp } from "@/context/AppContext";
import {
  estacaoIdAtual, definirEstacaoAtual, listarEstacoes, criarEstacao,
  salvarImpressorasEstacao, sincronizarBindingsEstacao,
} from "@/lib/estacao";
import { buscarConfigImpressao, salvarConfigImpressao } from "@/lib/impressao";
import {
  LuPrinter, LuRefreshCw, LuCircleAlert, LuX,
  LuSettings, LuWifi, LuWifiOff, LuShieldCheck, LuLoader,
  LuPlay, LuSquareCheckBig, LuMonitor, LuNetwork,
} from "react-icons/lu";
import "./ImpressorasConfig.css";

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

function ModalSelecionarImpressora({ local, impressoras, cfgAtual, onSalvar, onClose, sz }) {
  const [selecionada, setSelecionada] = useState(cfgAtual?.nome ?? "");
  const [salvando, setSalvando]       = useState(false);
  const [erro, setErro]               = useState("");

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    const { error } = await onSalvar(selecionada);
    setSalvando(false);
    if (error) {
      setErro(error.message ?? "Erro ao salvar a impressora.");
      return;
    }
    onClose(true);
  };

  return createPortal(
    <div
      {...fecharAoClicarFora(() => onClose(false))}
      style={{ position: "fixed", inset: 0, zIndex: 9200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div style={{ background: varColor(C.card), borderRadius: 20, width: "100%", maxWidth: 480, border: `1px solid var(${C.border})`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 20, padding: 28, maxHeight: "85vh" }}>

        {/* Título */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="impressoras-config__titulo-xl" style={{ fontWeight: 800 }}>Selecionar Impressora</div>
            <div className="impressoras-config__texto-sm" style={{ color: varColor(C.muted), marginTop: 2 }}>
              Local: <strong>{local.nome}</strong>
            </div>
          </div>
          <button onClick={() => onClose(false)} style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", lineHeight: 0, padding: 4 }}>
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
              border: `1.5px solid ${selecionada === "" ? varColor(C.red) + "66" : varColor(C.border)}`,
              background: selecionada === "" ? `${alfa(C.red, "08")}` : varColor(C.surface),
              textAlign: "left", fontFamily: "inherit",
            }}
          >
            <LuX size={18} color={selecionada === "" ? varColor(C.red) : varColor(C.muted)} />
            <div className="impressoras-config__titulo-lg" style={{ fontWeight: 600, color: selecionada === "" ? varColor(C.red) : varColor(C.muted) }}>
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
                  border: `1.5px solid ${ativo ? varColor(C.accent) : varColor(C.border)}`,
                  background: ativo ? `${alfa(C.accent, "10")}` : varColor(C.surface),
                  textAlign: "left", fontFamily: "inherit",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <LuPrinter size={18} color={ativo ? varColor(C.accent) : varColor(C.muted)} />
                <div className="impressoras-config__titulo-lg" style={{ flex: 1, fontWeight: ativo ? 700 : 500, color: ativo ? varColor(C.accent) : varColor(C.text), textAlign: "left" }}>
                  {nome}
                </div>
                {ativo && (
                  <LuShieldCheck size={16} color={varColor(C.accent)} />
                )}
              </button>
            );
          })}
        </div>

        {/* Erro ao salvar */}
        {erro && (
          <div className="impressoras-config__texto-sm" style={{ padding: "10px 14px", borderRadius: 10, background: `${alfa(C.red, "0e")}`, border: `1px solid ${alfa(C.red, "33")}`, color: varColor(C.red), display: "flex", alignItems: "center", gap: 8 }}>
            <LuCircleAlert size={14} style={{ flexShrink: 0 }} /> {erro}
          </div>
        )}

        {/* Ações */}
        <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: `1px solid var(${C.border})` }}>
          <button
            onClick={() => onClose(false)}
            disabled={salvando}
            className="impressoras-config__texto-base"
            style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: salvando ? "not-allowed" : "pointer", fontWeight: 600, fontFamily: "inherit" }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="impressoras-config__texto-base"
            style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: varColor(C.accent), color: "#fff", cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "inherit", opacity: salvando ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {salvando && <LuLoader size={14} style={{ animation: "spin 1s linear infinite" }} />}
            {salvando ? "Salvando…" : "Confirmar"}
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
  const { tenant } = useApp();
  const [locais, setLocais]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]       = useState(null); // local object
  const [testando, setTestando] = useState({}); // { [localId]: "idle"|"ok"|"erro" }

  // ── Estação (posto de trabalho) desta máquina ─────────────────────
  const [estacoes, setEstacoes]           = useState([]);
  const [estacaoId, setEstacaoId]         = useState(() => estacaoIdAtual());
  const [loadingEstacoes, setLoadingEstacoes] = useState(true);
  const [erroEstacoes, setErroEstacoes]   = useState("");
  const [trocandoEstacao, setTrocandoEstacao] = useState(false);
  const [criandoEstacao, setCriandoEstacao]   = useState(false);
  const [nomeNovaEstacao, setNomeNovaEstacao] = useState("");
  const [salvandoEstacao, setSalvandoEstacao] = useState(false);
  const [erroVinculo, setErroVinculo]     = useState("");

  // ── Impressão em rede (Fase 3 — fila `trabalhos_impressao`) ───────
  const [emRede, setEmRede]           = useState(false);
  const [salvandoRede, setSalvandoRede] = useState(false);
  const [erroRede, setErroRede]       = useState("");

  const estacaoAtual = estacoes.find(e => e.id === estacaoId) ?? null;

  useEffect(() => {
    supabase
      .from("locais_impressao")
      .select("id,nome,descricao,ativo")
      .order("created_at", { ascending: true })
      .then(({ data }) => { setLocais(data ?? []); setLoading(false); });
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoadingEstacoes(true);
      const { data, error } = await listarEstacoes();
      if (cancelado) return;
      if (error) {
        setErroEstacoes(error.message ?? "Não foi possível carregar as estações desta conta.");
        setLoadingEstacoes(false);
        return;
      }
      setEstacoes(data ?? []);
      setErroEstacoes("");
      setLoadingEstacoes(false);
      // Sincronização best-effort de vínculos pendentes (ex.: após limpar cache).
      sincronizarBindingsEstacao().catch(() => {});
    })();
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    buscarConfigImpressao().then(({ data }) => {
      if (!cancelado) setEmRede(Boolean(data?.impressaoEmRede));
    });
    return () => { cancelado = true; };
  }, []);

  // Liga/desliga a impressão em rede — otimista, com rollback se o banco recusar.
  const alternarImpressaoEmRede = async () => {
    if (salvandoRede) return;
    const anterior = emRede;
    const novo = !anterior;
    setEmRede(novo);
    setSalvandoRede(true);
    setErroRede("");
    const { data: cfg } = await buscarConfigImpressao();
    const { error } = await salvarConfigImpressao({ ...(cfg ?? {}), impressaoEmRede: novo });
    setSalvandoRede(false);
    if (error) {
      setEmRede(anterior); // rollback
      setErroRede(error.message ?? "Não foi possível salvar a impressão em rede.");
      setTimeout(() => setErroRede(""), 4000);
    }
  };

  const handleFecharModal = (_salvou) => {
    setModal(null);
  };

  // Persiste o mapa de vínculos da estação atual no banco e reflete no estado local.
  const handleSalvarLocal = async (localId, nomeOuVazio) => {
    if (!estacaoAtual) {
      return { error: new Error("Selecione uma estação para vincular impressoras.") };
    }
    const novoMapa = { ...(estacaoAtual.impressoras ?? {}) };
    if (nomeOuVazio) {
      novoMapa[localId] = { nome: nomeOuVazio };
    } else {
      delete novoMapa[localId];
    }
    const { error } = await salvarImpressorasEstacao(estacaoAtual.id, novoMapa);
    if (!error) {
      setEstacoes(prev => prev.map(e => (e.id === estacaoAtual.id ? { ...e, impressoras: novoMapa } : e)));
    }
    return { error };
  };

  const removerConfig = async (localId) => {
    const { error } = await handleSalvarLocal(localId, "");
    if (error) {
      setErroVinculo(error.message ?? "Erro ao remover a impressora deste local.");
      setTimeout(() => setErroVinculo(""), 4000);
    }
  };

  const trocarParaEstacao = (id) => {
    definirEstacaoAtual(id);
    setEstacaoId(id);
    setTrocandoEstacao(false);
  };

  const criarNovaEstacao = async () => {
    const nome = nomeNovaEstacao.trim();
    if (!nome) return;
    setSalvandoEstacao(true);
    const { data, error } = await criarEstacao(nome);
    setSalvandoEstacao(false);
    if (error) {
      setErroEstacoes(error.message ?? "Não foi possível criar a estação.");
      return;
    }
    definirEstacaoAtual(data.id);
    setEstacoes(prev => [...prev, data]);
    setEstacaoId(data.id);
    setNomeNovaEstacao("");
    setCriandoEstacao(false);
    setTrocandoEstacao(false);
    setErroEstacoes("");
  };

  const imprimirTeste = async (local, nomePrinter) => {
    setTestando(prev => ({ ...prev, [local.id]: "idle" }));
    try {
      const qz = (await import("qz-tray")).default;
      const config = qz.configs.create(nomePrinter);

      const agora = new Date().toLocaleString("pt-BR");
      const linha = (txt, tamanho = 32) => txt.padEnd(tamanho).slice(0, tamanho);
      // Identidade do tenant no teste (white-label); "by Kora" é a
      // assinatura da plataforma, igual pra todo estabelecimento.
      const nomeTenant = nomeExibicaoTenant(tenant?.tema).toUpperCase();

      const dados = [
        { type: "raw", format: "plain", data:
          "\x1B\x40"                          // inicializa impressora
          + "\x1B\x61\x01"                    // centraliza
          + "\x1B\x21\x30"                    // fonte dupla (grande)
          + `${nomeTenant}\n`
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

  // ── Seletor de estação desta máquina ──────────────────────────────

  const renderSeletorEstacao = () => {
    if (loadingEstacoes) {
      return (
        <div style={{ padding: "16px 20px", borderRadius: 14, background: varColor(C.surface), border: `1px solid var(${C.border})`, display: "flex", alignItems: "center", gap: 14 }}>
          <LuLoader size={20} color={varColor(C.muted)} style={{ animation: "spin 1s linear infinite" }} />
          <div className="impressoras-config__texto-base" style={{ color: varColor(C.muted) }}>Carregando estações…</div>
        </div>
      );
    }

    if (erroEstacoes) {
      return (
        <div style={{ padding: "16px 20px", borderRadius: 14, background: `${alfa(C.red, "08")}`, border: `1px solid ${alfa(C.red, "33")}`, display: "flex", alignItems: "flex-start", gap: 14 }}>
          <LuCircleAlert size={20} color={varColor(C.red)} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div className="impressoras-config__titulo-lg" style={{ fontWeight: 700, color: varColor(C.red) }}>Não foi possível carregar as estações</div>
            <div className="impressoras-config__texto-sm" style={{ color: varColor(C.muted), marginTop: 4 }}>{erroEstacoes}</div>
          </div>
        </div>
      );
    }

    // Sem estação escolhida nesta máquina, ou usuário pediu para trocar.
    if (!estacaoAtual || trocandoEstacao) {
      return (
        <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 14, padding: sz.pad, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LuMonitor size={20} color={varColor(C.accent)} />
            <div className="impressoras-config__titulo-lg" style={{ fontWeight: 800 }}>Qual é este computador?</div>
          </div>
          <div className="impressoras-config__texto-sm" style={{ color: varColor(C.muted) }}>
            Escolha a estação deste computador para vincular as impressoras. O vínculo fica salvo no sistema, não só neste navegador.
          </div>

          {estacoes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {estacoes.map(e => (
                <button
                  key={e.id}
                  onClick={() => trocarParaEstacao(e.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                    border: `1.5px solid ${e.id === estacaoId ? varColor(C.accent) : varColor(C.border)}`,
                    background: e.id === estacaoId ? `${alfa(C.accent, "10")}` : varColor(C.surface),
                    textAlign: "left", fontFamily: "inherit",
                  }}
                >
                  <LuMonitor size={18} color={e.id === estacaoId ? varColor(C.accent) : varColor(C.muted)} />
                  <div className="impressoras-config__titulo-lg" style={{ flex: 1, fontWeight: 600, color: e.id === estacaoId ? varColor(C.accent) : varColor(C.text) }}>
                    {e.nome}
                  </div>
                  {e.id === estacaoId && <LuShieldCheck size={16} color={varColor(C.accent)} />}
                </button>
              ))}
            </div>
          )}

          {criandoEstacao ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                autoFocus
                value={nomeNovaEstacao}
                onChange={e => setNomeNovaEstacao(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") criarNovaEstacao(); }}
                placeholder="Nome da estação (ex: Caixa 1, Cozinha)"
                className="impressoras-config__texto-base"
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), fontFamily: "inherit" }}
              />
              <button
                onClick={criarNovaEstacao}
                disabled={!nomeNovaEstacao.trim() || salvandoEstacao}
                className="impressoras-config__texto-sm"
                style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: varColor(C.accent), color: "#fff", fontWeight: 700, cursor: (!nomeNovaEstacao.trim() || salvandoEstacao) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (!nomeNovaEstacao.trim() || salvandoEstacao) ? 0.6 : 1, whiteSpace: "nowrap" }}
              >
                {salvandoEstacao ? "Criando…" : "Criar"}
              </button>
              <button
                onClick={() => { setCriandoEstacao(false); setNomeNovaEstacao(""); }}
                className="impressoras-config__texto-sm"
                style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setCriandoEstacao(true)}
                className="impressoras-config__texto-sm"
                style={{ padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${varColor(C.accent)}66`, background: `${alfa(C.accent, "08")}`, color: varColor(C.accent), fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                + Criar nova estação
              </button>
              {estacaoAtual && trocandoEstacao && (
                <button
                  onClick={() => setTrocandoEstacao(false)}
                  className="impressoras-config__texto-sm"
                  style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: "pointer", fontFamily: "inherit" }}
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    // Estação escolhida — banner compacto.
    return (
      <div style={{ padding: "12px 20px", borderRadius: 14, background: varColor(C.surface), border: `1px solid var(${C.border})`, display: "flex", alignItems: "center", gap: 12 }}>
        <LuMonitor size={18} color={varColor(C.accent)} />
        <div className="impressoras-config__texto-base" style={{ flex: 1 }}>
          Estação: <strong>{estacaoAtual.nome}</strong>
        </div>
        <button
          onClick={() => setTrocandoEstacao(true)}
          className="impressoras-config__texto-sm"
          style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
        >
          Trocar
        </button>
      </div>
    );
  };

  // ── Banner de conexão QZ Tray ────────────────────────────────────

  const renderBannerQZ = () => {
    if (status === "idle") {
      return (
        <div style={{ padding: "16px 20px", borderRadius: 14, background: varColor(C.surface), border: `1px solid var(${C.border})`, display: "flex", alignItems: "center", gap: 14 }}>
          <LuWifi size={22} color={varColor(C.muted)} />
          <div style={{ flex: 1 }}>
            <div className="impressoras-config__titulo-lg" style={{ fontWeight: 700 }}>Conectar ao QZ Tray</div>
            <div className="impressoras-config__texto-sm" style={{ color: varColor(C.muted), marginTop: 2 }}>
              O QZ Tray lê as impressoras instaladas no Windows e as disponibiliza para o sistema. Certifique-se de que ele está em execução neste computador.
            </div>
          </div>
          <button
            onClick={conectar}
            className="impressoras-config__texto-sm"
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: varColor(C.accent), color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
          >
            Conectar
          </button>
        </div>
      );
    }

    if (status === "conectando") {
      return (
        <div style={{ padding: "16px 20px", borderRadius: 14, background: `${alfa(C.accent, "08")}`, border: `1px solid ${alfa(C.accent, "33")}`, display: "flex", alignItems: "center", gap: 14 }}>
          <LuLoader size={20} color={varColor(C.accent)} style={{ animation: "spin 1s linear infinite" }} />
          <div className="impressoras-config__texto-base" style={{ color: varColor(C.accent), fontWeight: 600 }}>Conectando ao QZ Tray…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    if (status === "erro") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "16px 20px", borderRadius: 14, background: `${alfa(C.red, "08")}`, border: `1px solid ${alfa(C.red, "33")}`, display: "flex", alignItems: "flex-start", gap: 14 }}>
            <LuWifiOff size={22} color={varColor(C.red)} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div className="impressoras-config__titulo-lg" style={{ fontWeight: 700, color: varColor(C.red) }}>QZ Tray não encontrado</div>
              <div className="impressoras-config__texto-sm" style={{ color: varColor(C.muted), marginTop: 4 }}>{erroMsg}</div>
            </div>
            <button
              onClick={conectar}
              className="impressoras-config__texto-sm"
              style={{ padding: "8px 16px", borderRadius: 9, border: `1px solid ${alfa(C.red, "44")}`, background: `${alfa(C.red, "10")}`, color: varColor(C.red), fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
            >
              <LuRefreshCw size={13} /> Tentar novamente
            </button>
          </div>

          {/* Instruções de instalação */}
          <div className="impressoras-config__texto-sm" style={{ padding: "16px 20px", borderRadius: 14, background: varColor(C.surface), border: `1px solid var(${C.border})`, color: varColor(C.muted) }}>
            <div className="impressoras-config__titulo-lg" style={{ fontWeight: 700, color: varColor(C.text), marginBottom: 8 }}>Como instalar o QZ Tray</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Acesse <strong style={{ color: varColor(C.accent) }}>qz.io</strong> e baixe o instalador para Windows</li>
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
        <div style={{ padding: "12px 20px", borderRadius: 14, background: `${alfa(C.green, "08")}`, border: `1px solid ${alfa(C.green, "33")}`, display: "flex", alignItems: "center", gap: 12 }}>
          <LuWifi size={18} color={varColor(C.green)} />
          <div className="impressoras-config__texto-base" style={{ flex: 1, color: varColor(C.green), fontWeight: 600 }}>
            QZ Tray conectado · {impressoras.length} impressora{impressoras.length !== 1 ? "s" : ""} encontrada{impressoras.length !== 1 ? "s" : ""}
          </div>
          <button
            onClick={atualizar}
            title="Atualizar lista"
            style={{ background: "none", border: `1px solid ${alfa(C.green, "44")}`, borderRadius: 8, color: varColor(C.green), cursor: "pointer", padding: "6px 8px", lineHeight: 0 }}
          >
            <LuRefreshCw size={14} />
          </button>
        </div>
      );
    }
  };

  if (loading) {
    return <div className="impressoras-config__texto-base" style={{ color: varColor(C.muted), padding: 40, textAlign: "center" }}>Carregando…</div>;
  }

  const conectado = status === "conectado";
  const podeVincular = Boolean(estacaoAtual);

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: sz.pad }}>

      {/* Seletor de estação desta máquina */}
      {renderSeletorEstacao()}

      {/* Impressão em rede (Fase 3) */}
      <div style={{ background: varColor(C.card), border: `1px solid ${emRede ? alfa(C.accent, "44") : varColor(C.border)}`, borderRadius: 14, padding: sz.pad, display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: emRede ? `${alfa(C.accent, "18")}` : varColor(C.surface), border: `1px solid ${emRede ? varColor(C.accent) + "44" : varColor(C.border)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LuNetwork size={19} color={emRede ? varColor(C.accent) : varColor(C.muted)} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="impressoras-config__titulo-lg" style={{ fontWeight: 800 }}>Impressão em rede</div>
          <div className="impressoras-config__texto-sm" style={{ color: varColor(C.muted), marginTop: 4 }}>
            Quando ligado, cada computador imprime o que é dele: uma comanda do bar lançada no
            caixa sai sozinha na impressora do bar. Deixe desligado se só este computador imprime.
          </div>
          {erroRede && (
            <div className="impressoras-config__texto-sm" style={{ marginTop: 8, color: varColor(C.red), display: "flex", alignItems: "center", gap: 6 }}>
              <LuCircleAlert size={13} style={{ flexShrink: 0 }} /> {erroRede}
            </div>
          )}
        </div>
        {/* Switch */}
        <button
          role="switch"
          aria-checked={emRede}
          aria-label="Impressão em rede"
          onClick={alternarImpressaoEmRede}
          disabled={salvandoRede}
          style={{
            flexShrink: 0, width: 52, height: 30, borderRadius: 999, border: "none", padding: 3,
            background: emRede ? varColor(C.accent) : varColor(C.border),
            cursor: salvandoRede ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: emRede ? "flex-end" : "flex-start",
            transition: "background 0.18s", opacity: salvandoRede ? 0.7 : 1,
          }}
        >
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {salvandoRede && <LuLoader size={12} color={varColor(C.muted)} style={{ animation: "spin 1s linear infinite" }} />}
          </span>
        </button>
      </div>

      {/* Banner QZ Tray */}
      {renderBannerQZ()}

      {/* Aviso de configuração por estação */}
      {conectado && (
        <div className="impressoras-config__texto-sm" style={{ padding: "10px 16px", borderRadius: 10, background: `${alfa(C.blue, "0e")}`, border: `1px solid ${alfa(C.blue, "22")}`, color: varColor(C.muted) }}>
          <strong style={{ color: varColor(C.blue) }}>ℹ Vínculos por estação</strong> — Ficam salvos no sistema (não neste navegador): sobrevivem a limpar o cache ou trocar de computador. Cada estação tem suas próprias impressoras.
        </div>
      )}

      {/* Erro ao remover vínculo */}
      {erroVinculo && (
        <div className="impressoras-config__texto-sm" style={{ padding: "10px 16px", borderRadius: 10, background: `${alfa(C.red, "0e")}`, border: `1px solid ${alfa(C.red, "33")}`, color: varColor(C.red), display: "flex", alignItems: "center", gap: 8 }}>
          <LuCircleAlert size={14} style={{ flexShrink: 0 }} /> {erroVinculo}
        </div>
      )}

      {/* Locais sem QZ conectado — mostra config salva, sem interação */}
      {locais.length === 0 ? (
        <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 14, padding: "40px 24px", textAlign: "center", color: varColor(C.muted) }}>
          <LuPrinter size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div className="impressoras-config__titulo-lg" style={{ fontWeight: 700 }}>Nenhum local de impressão cadastrado</div>
          <div className="impressoras-config__texto-sm" style={{ marginTop: 4 }}>Crie locais na aba <strong>Locais de Impressão</strong> primeiro.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {locais.map(local => {
            const cfg = estacaoAtual?.impressoras?.[local.id] ?? null;
            return (
              <div
                key={local.id}
                style={{
                  background: varColor(C.card),
                  border: `1px solid ${cfg ? varColor(C.border) : varColor(C.border)}`,
                  borderRadius: 14,
                  padding: `${sz.padSm + 2}px ${sz.pad}px`,
                  display: "flex", alignItems: "center", gap: 14,
                  opacity: local.ativo ? 1 : 0.5,
                }}
              >
                {/* Ícone */}
                <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: cfg ? `${alfa(C.accent, "18")}` : varColor(C.surface), border: `1px solid ${cfg ? varColor(C.accent) + "44" : varColor(C.border)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LuPrinter size={19} color={cfg ? varColor(C.accent) : varColor(C.muted)} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="impressoras-config__titulo-lg" style={{ fontWeight: 700 }}>
                    {local.nome}
                    {!local.ativo && <span className="impressoras-config__texto-sm" style={{ color: varColor(C.muted), marginLeft: 8, fontWeight: 400 }}>· inativo</span>}
                  </div>
                  <div className="impressoras-config__texto-sm" style={{ color: varColor(C.muted), marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cfg
                      ? <span style={{ color: varColor(C.accent), fontWeight: 600 }}>{cfg.nome}</span>
                      : !podeVincular
                        ? "Escolha uma estação acima para configurar"
                        : "Sem impressora configurada"
                    }
                  </div>
                </div>

                {/* Badge */}
                {cfg ? (
                  <span className="impressoras-config__badge" style={{ fontWeight: 700, background: `${alfa(C.green, "15")}`, border: `1px solid ${alfa(C.green, "44")}`, color: varColor(C.green), padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    Configurada
                  </span>
                ) : (
                  <span className="impressoras-config__badge" style={{ fontWeight: 700, background: varColor(C.surface), border: `1px solid var(${C.border})`, color: varColor(C.muted), padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
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
                        className="impressoras-config__texto-sm"
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 13px", borderRadius: 9,
                          border: `1.5px solid ${st === "ok" ? varColor(C.green) + "66" : st === "erro" ? varColor(C.red) + "66" : varColor(C.border)}`,
                          background: st === "ok" ? `${alfa(C.green, "0f")}` : st === "erro" ? `${alfa(C.red, "0f")}` : varColor(C.surface),
                          color: st === "ok" ? varColor(C.green) : st === "erro" ? varColor(C.red) : varColor(C.muted),
                          cursor: ocupado ? "not-allowed" : "pointer",
                          fontWeight: 600, fontFamily: "inherit",
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
                      style={{ padding: "7px 9px", borderRadius: 8, border: `1px solid ${alfa(C.red, "33")}`, background: `${alfa(C.red, "0a")}`, color: varColor(C.red), cursor: "pointer", lineHeight: 0 }}
                    >
                      <LuX size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => { if (!conectado) { conectar(); return; } if (!podeVincular) return; setModal(local); }}
                    disabled={status === "conectando" || (conectado && !podeVincular)}
                    title={conectado && !podeVincular ? "Escolha uma estação para vincular impressoras" : undefined}
                    className="impressoras-config__texto-sm"
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9,
                      border: `1.5px solid ${conectado ? varColor(C.border) : varColor(C.accent) + "66"}`,
                      background: conectado ? varColor(C.surface) : `${alfa(C.accent, "08")}`,
                      color: conectado ? varColor(C.text) : varColor(C.accent),
                      cursor: (status === "conectando" || (conectado && !podeVincular)) ? "not-allowed" : "pointer",
                      opacity: (conectado && !podeVincular) ? 0.55 : 1,
                      fontWeight: 600, fontFamily: "inherit", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => { if (conectado && podeVincular) e.currentTarget.style.borderColor = varColor(C.accent) + "66"; }}
                    onMouseLeave={e => { if (conectado && podeVincular) e.currentTarget.style.borderColor = varColor(C.border); }}
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
      {modal && conectado && podeVincular && (
        <ModalSelecionarImpressora
          local={modal}
          impressoras={impressoras}
          cfgAtual={estacaoAtual?.impressoras?.[modal.id] ?? null}
          onSalvar={(nome) => handleSalvarLocal(modal.id, nome)}
          sz={sz}
          onClose={handleFecharModal}
        />
      )}
    </div>
  );
}
