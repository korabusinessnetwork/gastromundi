import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import C from "@/constants/colors";
import {
  LuPrinter, LuWifi, LuUsb, LuMonitor, LuRefreshCw,
  LuShieldCheck, LuCircleAlert, LuX, LuSettings, LuPlay,
} from "react-icons/lu";

const LS_KEY = "gastromundi:impressoras_config";

const TIPOS = [
  { id: "sistema",  label: "Sistema",         Icon: LuMonitor, desc: "Usa o diálogo de impressão do Windows" },
  { id: "rede",     label: "Rede (IP)",        Icon: LuWifi,    desc: "Impressora térmica via TCP/IP" },
  { id: "usb",      label: "USB",              Icon: LuUsb,     desc: "Impressora conectada por USB (Chrome/Edge)" },
];

function lerConfig() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { return {}; }
}

function salvarConfig(cfg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch {}
}

// ── Modal de configuração de uma impressora ────────────────────────

function ModalConfig({ local, onClose, sz }) {
  const cfg = lerConfig();
  const inicial = cfg[local.id] ?? { tipo: "sistema", nome: "", ip: "", porta: "9100" };

  const [tipo,  setTipo]  = useState(inicial.tipo);
  const [nome,  setNome]  = useState(inicial.nome);
  const [ip,    setIp]    = useState(inicial.ip ?? "");
  const [porta, setPorta] = useState(inicial.porta ?? "9100");
  const [usbNome, setUsbNome] = useState(inicial.usbNome ?? "");
  const [usbIds,  setUsbIds]  = useState(inicial.usbIds ?? null); // { vendorId, productId }
  const [buscandoUsb, setBuscandoUsb] = useState(false);
  const [usbErro, setUsbErro] = useState("");
  const [testando, setTestando] = useState(false);
  const [testeStatus, setTesteStatus] = useState(null); // "ok" | "erro" | null

  const podeSlavar = tipo === "sistema"
    || (tipo === "rede" && ip.trim() && porta.trim())
    || (tipo === "usb" && usbIds);

  const buscarUsb = async () => {
    setUsbErro("");
    setBuscandoUsb(true);
    try {
      if (!navigator.usb) throw new Error("WebUSB não suportado neste navegador. Use Chrome ou Edge.");
      // Filtros comuns de impressoras ESC/POS (Epson, Star, Bixolon, etc.)
      const filtros = [
        { classCode: 7 },        // USB Printer class
        { vendorId: 0x04b8 },    // Epson
        { vendorId: 0x0519 },    // Star Micronics
        { vendorId: 0x154f },    // Seiko / SII
        { vendorId: 0x0dd4 },    // Custom (CUSTOM spa)
      ];
      const device = await navigator.usb.requestDevice({ filters: filtros });
      setUsbIds({ vendorId: device.vendorId, productId: device.productId });
      setUsbNome(device.productName || `${device.vendorId.toString(16)}:${device.productId.toString(16)}`);
      setUsbErro("");
    } catch (e) {
      if (e.name !== "NotFoundError") {
        setUsbErro(e.message ?? "Erro ao acessar USB.");
      }
    } finally {
      setBuscandoUsb(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    setTesteStatus(null);
    try {
      if (tipo === "sistema") {
        window.print();
        setTesteStatus("ok");
      } else if (tipo === "rede") {
        // Tenta fetch para verificar alcance (sem CORS — só para detectar timeout)
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        try {
          await fetch(`http://${ip.trim()}:${porta.trim()}`, { signal: controller.signal, mode: "no-cors" });
          setTesteStatus("ok");
        } catch (e) {
          // "Failed to fetch" com no-cors pode ser CORS mas significa que o host respondeu
          if (e.name === "AbortError") setTesteStatus("erro");
          else setTesteStatus("ok"); // respondeu mas bloqueado por CORS = está online
        } finally {
          clearTimeout(timer);
        }
      } else if (tipo === "usb") {
        if (!usbIds) { setTesteStatus("erro"); return; }
        const devices = await navigator.usb.getDevices();
        const found = devices.some(d => d.vendorId === usbIds.vendorId && d.productId === usbIds.productId);
        setTesteStatus(found ? "ok" : "erro");
      }
    } catch {
      setTesteStatus("erro");
    } finally {
      setTestando(false);
    }
  };

  const salvar = () => {
    const cfg = lerConfig();
    cfg[local.id] = { tipo, nome: nome.trim(), ip: ip.trim(), porta: porta.trim(), usbNome, usbIds };
    salvarConfig(cfg);
    onClose(cfg[local.id]);
  };

  const remover = () => {
    const cfg = lerConfig();
    delete cfg[local.id];
    salvarConfig(cfg);
    onClose(null);
  };

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(undefined); }}
      style={{ position: "fixed", inset: 0, zIndex: 9200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div style={{ background: C.card, borderRadius: 20, width: "100%", maxWidth: 480, border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 20, padding: 28, maxHeight: "90vh", overflowY: "auto" }}>

        {/* Título */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>Configurar Impressora</div>
            <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>Local: <strong>{local.nome}</strong></div>
          </div>
          <button onClick={() => onClose(undefined)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0, padding: 4 }}>
            <LuX size={20} />
          </button>
        </div>

        {/* Apelido opcional */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Apelido <span style={{ fontWeight: 400, textTransform: "none" }}>(opcional)</span>
          </div>
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder={`Ex: Impressora ${local.nome}`}
            maxLength={60}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Tipo de conexão */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Tipo de conexão</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TIPOS.map(t => {
              const ativo = tipo === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTipo(t.id); setTesteStatus(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                    border: `1.5px solid ${ativo ? C.accent : C.border}`,
                    background: ativo ? `${C.accent}10` : C.surface,
                    textAlign: "left", fontFamily: "inherit",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <t.Icon size={20} color={ativo ? C.accent : C.muted} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: ativo ? C.accent : C.text }}>{t.label}</div>
                    <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 1 }}>{t.desc}</div>
                  </div>
                  {ativo && <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: C.accent }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Campos por tipo */}
        {tipo === "rede" && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Endereço IP</div>
              <input
                value={ip}
                onChange={e => setIp(e.target.value)}
                placeholder="192.168.1.100"
                maxLength={45}
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ width: 100 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Porta</div>
              <input
                value={porta}
                onChange={e => setPorta(e.target.value)}
                placeholder="9100"
                maxLength={6}
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
        )}

        {tipo === "usb" && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Dispositivo USB</div>
            {usbIds ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: `${C.green}10`, border: `1.5px solid ${C.green}44`, marginBottom: 8 }}>
                <LuShieldCheck size={16} color={C.green} />
                <div style={{ flex: 1, fontSize: sz.fontBase, fontWeight: 600, color: C.green }}>{usbNome || "Dispositivo USB"}</div>
                <button
                  onClick={() => { setUsbIds(null); setUsbNome(""); }}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0 }}
                >
                  <LuX size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={buscarUsb}
                disabled={buscandoUsb}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: `1.5px dashed ${C.border}`, background: C.surface, color: C.muted, cursor: "pointer", fontFamily: "inherit", fontSize: sz.fontBase, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {buscandoUsb ? <LuRefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <LuUsb size={16} />}
                {buscandoUsb ? "Aguardando seleção…" : "Detectar impressora USB"}
              </button>
            )}
            {usbErro && (
              <div style={{ fontSize: sz.fontSm, color: C.red, marginTop: 6 }}>{usbErro}</div>
            )}
            {!navigator?.usb && (
              <div style={{ fontSize: sz.fontSm, color: "#f59e0b", marginTop: 6 }}>
                ⚠ WebUSB requer Chrome ou Edge. Firefox não é suportado.
              </div>
            )}
          </div>
        )}

        {tipo === "sistema" && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, fontSize: sz.fontSm, color: C.muted, lineHeight: 1.6 }}>
            Usa o diálogo de impressão padrão do Windows. A impressora padrão do sistema é usada automaticamente, ou você pode escolher outra no diálogo.
          </div>
        )}

        {/* Teste de conexão */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={testar}
            disabled={testando || !podeSlavar}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.surface, color: C.muted, cursor: podeSlavar && !testando ? "pointer" : "not-allowed", fontWeight: 600, fontSize: sz.fontSm, fontFamily: "inherit", opacity: podeSlavar ? 1 : 0.5 }}
          >
            {testando
              ? <LuRefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
              : <LuPlay size={14} />
            }
            {tipo === "sistema" ? "Abrir diálogo de teste" : "Testar conexão"}
          </button>
          {testeStatus === "ok" && (
            <span style={{ fontSize: sz.fontSm, color: C.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <LuShieldCheck size={14} /> Conexão OK
            </span>
          )}
          {testeStatus === "erro" && (
            <span style={{ fontSize: sz.fontSm, color: C.red, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <LuCircleAlert size={14} /> Sem resposta
            </span>
          )}
        </div>

        {/* Ações */}
        <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
          {inicial.tipo && (
            <button
              onClick={remover}
              style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.red}44`, background: `${C.red}0f`, color: C.red, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm, fontFamily: "inherit" }}
            >
              Remover
            </button>
          )}
          <button
            onClick={() => onClose(undefined)}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={!podeSlavar}
            style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: podeSlavar ? C.accent : C.faint, color: "#fff", cursor: podeSlavar ? "pointer" : "not-allowed", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit" }}
          >
            Salvar
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body
  );
}

// ── Tab principal ──────────────────────────────────────────────────

export default function ImpressorasConfig({ sz }) {
  const [locais, setLocais]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState(lerConfig());
  const [modal, setModal]     = useState(null); // local object

  useEffect(() => {
    supabase
      .from("locais_impressao")
      .select("id,nome,descricao,ativo")
      .order("created_at", { ascending: true })
      .then(({ data }) => { setLocais(data ?? []); setLoading(false); });
  }, []);

  const handleFechar = (localId, novaCfg) => {
    setModal(null);
    if (novaCfg === undefined) return; // cancelou
    setConfigs(lerConfig()); // relê do LS
  };

  const tipoLabel = (cfg) => {
    if (!cfg) return null;
    const t = TIPOS.find(t => t.id === cfg.tipo);
    return t?.label ?? cfg.tipo;
  };

  const tipoColor = (tipo) => {
    if (tipo === "rede")    return C.blue;
    if (tipo === "usb")     return "#a855f7";
    return C.green;
  };

  if (loading) {
    return <div style={{ color: C.muted, fontSize: sz.fontBase, padding: 40, textAlign: "center" }}>Carregando…</div>;
  }

  if (locais.length === 0) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "40px 24px", textAlign: "center", color: C.muted, maxWidth: 600 }}>
        <LuPrinter size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
        <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>Nenhum local de impressão cadastrado</div>
        <div style={{ fontSize: sz.fontSm, marginTop: 4 }}>
          Crie locais na aba <strong>Locais de Impressão</strong> primeiro.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: sz.pad }}>

      {/* Banner informativo */}
      <div style={{ padding: "12px 16px", borderRadius: 12, background: `${C.blue}0e`, border: `1px solid ${C.blue}33`, fontSize: sz.fontSm, color: C.muted, lineHeight: 1.6 }}>
        <strong style={{ color: C.blue }}>ℹ Configuração por dispositivo</strong> — As impressoras são configuradas localmente neste computador e não sincronizam com outros dispositivos. Cada máquina precisa configurar sua própria impressora.
      </div>

      {/* Lista de locais com configuração */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {locais.map(local => {
          const cfg = configs[local.id] ?? null;
          const labelTipo = tipoLabel(cfg);
          const cor = cfg ? tipoColor(cfg.tipo) : null;
          return (
            <div
              key={local.id}
              style={{
                background: C.card, border: `1px solid ${cfg ? C.border : C.border}`,
                borderRadius: 14, padding: `${sz.padSm + 2}px ${sz.pad}px`,
                display: "flex", alignItems: "center", gap: 14,
                opacity: local.ativo ? 1 : 0.5,
              }}
            >
              {/* Ícone local */}
              <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: cfg ? `${cor}18` : C.surface, border: `1px solid ${cfg ? cor + "44" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LuPrinter size={19} color={cfg ? cor : C.muted} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>
                  {local.nome}
                  {!local.ativo && <span style={{ fontSize: sz.fontSm, color: C.muted, marginLeft: 8, fontWeight: 500 }}>· inativo</span>}
                </div>
                {cfg ? (
                  <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>
                    <span style={{ color: cor, fontWeight: 600 }}>{labelTipo}</span>
                    {cfg.tipo === "rede" && cfg.ip && <span> · {cfg.ip}:{cfg.porta}</span>}
                    {cfg.tipo === "usb"  && cfg.usbNome && <span> · {cfg.usbNome}</span>}
                    {cfg.nome && <span> · "{cfg.nome}"</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>Sem impressora configurada</div>
                )}
              </div>

              {/* Status badge */}
              {cfg ? (
                <span style={{ fontSize: sz.fontSm - 1, fontWeight: 700, background: `${cor}18`, border: `1px solid ${cor}44`, color: cor, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                  Configurada
                </span>
              ) : (
                <span style={{ fontSize: sz.fontSm - 1, fontWeight: 700, background: `${C.faint}`, border: `1px solid ${C.border}`, color: C.muted, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                  Pendente
                </span>
              )}

              {/* Botão configurar */}
              <button
                onClick={() => setModal(local)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm, fontFamily: "inherit", flexShrink: 0, transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "66"}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <LuSettings size={14} /> {cfg ? "Editar" : "Configurar"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modal && (
        <ModalConfig
          local={modal}
          sz={sz}
          onClose={(novaCfg) => {
            handleFechar(modal.id, novaCfg);
          }}
        />
      )}
    </div>
  );
}
