import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { LuSearch, LuX, LuCheck, LuTriangleAlert, LuReceiptText } from "react-icons/lu";

const CATS_EXCLUIDAS = ["Produção", "Insumo"];

const EMPTY_FISCAL = {
  ncm: "", cest: "", cfop: "",
  origem_mercadoria: "0",
  csosn: "", cst_icms: "",
  aliquota_icms: "", reducao_base_icms: "",
  cst_ipi: "", aliquota_ipi: "",
  cst_pis: "", aliquota_pis: "",
  cst_cofins: "", aliquota_cofins: "",
  aliquota_ibs: "", aliquota_cbs: "", aliquota_is: "",
  regime_tributario: "simples",
  observacao_fiscal: "",
};

const ORIGENS = [
  { v: "0", l: "0 — Nacional" },
  { v: "1", l: "1 — Estrangeira (importação direta)" },
  { v: "2", l: "2 — Estrangeira (mercado interno)" },
  { v: "3", l: "3 — Nacional c/ + de 40% de conteúdo estrangeiro" },
  { v: "4", l: "4 — Nacional produção básica" },
  { v: "5", l: "5 — Nacional c/ até 40% de conteúdo estrangeiro" },
];

const REGIMES = [
  { v: "simples",   l: "Simples Nacional" },
  { v: "presumido", l: "Lucro Presumido" },
  { v: "real",      l: "Lucro Real" },
];

const CSOSN_OPTS = [
  { v: "101", l: "101 — Tributada com permissão de crédito" },
  { v: "102", l: "102 — Tributada sem permissão de crédito" },
  { v: "103", l: "103 — Isenção para faixa de receita bruta" },
  { v: "300", l: "300 — Imune" },
  { v: "400", l: "400 — Não tributada" },
  { v: "500", l: "500 — ICMS cobrado anteriormente por ST" },
  { v: "900", l: "900 — Outros" },
];

const CST_ICMS_OPTS = [
  { v: "00", l: "00 — Tributada integralmente" },
  { v: "10", l: "10 — Tributada e com cobrança por ST" },
  { v: "20", l: "20 — Com redução de base de cálculo" },
  { v: "40", l: "40 — Isenta" },
  { v: "41", l: "41 — Não tributada" },
  { v: "50", l: "50 — Suspensão" },
  { v: "60", l: "60 — ICMS cobrado anteriormente por ST" },
  { v: "70", l: "70 — Com red. de base de cálculo e cobrança por ST" },
  { v: "90", l: "90 — Outros" },
];

const CST_PIS_COFINS = [
  { v: "01", l: "01 — Operação tributável (alíquota normal)" },
  { v: "02", l: "02 — Operação tributável (alíquota diferenciada)" },
  { v: "04", l: "04 — Operação tributável (alíquota zero)" },
  { v: "06", l: "06 — Operação tributável (alíquota zero) — setor" },
  { v: "07", l: "07 — Operação isenta" },
  { v: "08", l: "08 — Operação sem incidência" },
  { v: "09", l: "09 — Operação com suspensão" },
  { v: "49", l: "49 — Outras saídas" },
  { v: "99", l: "99 — Outras operações" },
];

// ── helpers UI ───────────────────────────────────────────────────────

function FLabel({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
      {children}
    </div>
  );
}

function FInp({ value, onChange, placeholder, maxLength, disabled, type = "text" }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      style={{
        width: "100%", padding: "9px 12px", borderRadius: 9,
        border: `1.5px solid ${C.border}`, background: disabled ? C.faint : C.surface,
        color: disabled ? C.muted : C.text, fontSize: 15, fontFamily: "inherit",
        outline: "none", boxSizing: "border-box", opacity: disabled ? 0.7 : 1,
      }}
    />
  );
}

function FSel({ value, onChange, opts, placeholder }) {
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", padding: "9px 12px", borderRadius: 9,
        border: `1.5px solid ${C.border}`, background: C.surface,
        color: value ? C.text : C.muted, fontSize: 15, fontFamily: "inherit",
        outline: "none", boxSizing: "border-box", cursor: "pointer",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 32,
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function FPct({ value, onChange, placeholder = "0,00" }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "9px 36px 9px 12px", borderRadius: 9,
          border: `1.5px solid ${C.border}`, background: C.surface,
          color: C.text, fontSize: 15, fontFamily: "inherit",
          outline: "none", boxSizing: "border-box",
        }}
      />
      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 13, fontWeight: 700, pointerEvents: "none" }}>%</span>
    </div>
  );
}

function Grid2({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>{children}</div>;
}

function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

// ── Modal de configuração fiscal ─────────────────────────────────────

const ABAS_MODAL = [
  { id: "identificacao", label: "Identificação" },
  { id: "icms",          label: "ICMS" },
  { id: "pis_cofins",    label: "PIS / COFINS / IPI" },
  { id: "reforma",       label: "Reforma 2026" },
];

function ModalFiscal({ item, dadosSalvos, sz, onClose, onSaved }) {
  const [aba,      setAba]      = useState("identificacao");
  const [form,     setForm]     = useState({ ...EMPTY_FISCAL, ...dadosSalvos });
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.ncm.trim()) { setErro("NCM é obrigatório."); setAba("identificacao"); return; }
    setSalvando(true);
    setErro("");
    try {
      const payload = {
        item_id:               Number(item.id),
        ncm:                   form.ncm.trim() || null,
        cest:                  form.cest.trim() || null,
        cfop:                  form.cfop.trim() || null,
        origem_mercadoria:     form.origem_mercadoria || null,
        csosn:                 form.csosn || null,
        cst_icms:              form.cst_icms || null,
        aliquota_icms:         parseFloat(form.aliquota_icms) || 0,
        reducao_base_icms:     parseFloat(form.reducao_base_icms) || 0,
        cst_ipi:               form.cst_ipi || null,
        aliquota_ipi:          parseFloat(form.aliquota_ipi) || 0,
        cst_pis:               form.cst_pis || null,
        aliquota_pis:          parseFloat(form.aliquota_pis) || 0,
        cst_cofins:            form.cst_cofins || null,
        aliquota_cofins:       parseFloat(form.aliquota_cofins) || 0,
        aliquota_ibs:          parseFloat(form.aliquota_ibs) || 0,
        aliquota_cbs:          parseFloat(form.aliquota_cbs) || 0,
        aliquota_is:           parseFloat(form.aliquota_is) || 0,
        regime_tributario:     form.regime_tributario || "simples",
        observacao_fiscal:     form.observacao_fiscal.trim() || null,
        updated_at:            new Date().toISOString(),
      };
      const { error } = await supabase.from("itens_fiscal").upsert(payload, { onConflict: "item_id" });
      if (error) throw error;
      onSaved(item.id, payload);
      onClose();
    } catch (e) {
      setErro("Erro ao salvar configuração fiscal.");
    } finally {
      setSalvando(false);
    }
  };

  const isSimples = form.regime_tributario === "simples";

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div style={{ background: C.card, borderRadius: 20, width: "100%", maxWidth: 620, maxHeight: "92vh", border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: sz.fontLg, color: C.text }}>{item.name}</div>
              <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>
                {item.category} · Configuração Fiscal
              </div>
            </div>
            <button onClick={onClose} disabled={salvando} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, lineHeight: 0 }}>
              <LuX size={20} />
            </button>
          </div>
          {/* Sub-tabs */}
          <div style={{ display: "flex", gap: 2 }}>
            {ABAS_MODAL.map(a => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                style={{
                  padding: "8px 14px", border: "none", background: "transparent",
                  color: aba === a.id ? C.accent : C.muted,
                  fontWeight: aba === a.id ? 700 : 500, fontSize: sz.fontSm + 1,
                  cursor: "pointer", fontFamily: "inherit",
                  borderBottom: aba === a.id ? `2px solid ${C.accent}` : "2px solid transparent",
                  borderRadius: "8px 8px 0 0",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo da aba */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Aba 1: Identificação ── */}
          {aba === "identificacao" && (
            <>
              <Grid2>
                <div>
                  <FLabel>Nome do item</FLabel>
                  <FInp value={item.name} onChange={() => {}} disabled />
                </div>
                <div>
                  <FLabel>Categoria</FLabel>
                  <FInp value={item.category} onChange={() => {}} disabled />
                </div>
              </Grid2>

              <Grid2>
                <div>
                  <FLabel>NCM *</FLabel>
                  <FInp value={form.ncm} onChange={v => set("ncm", v)} placeholder="0000.00.00" maxLength={10} />
                </div>
                <div>
                  <FLabel>CEST</FLabel>
                  <FInp value={form.cest} onChange={v => set("cest", v)} placeholder="00.000.00" maxLength={9} />
                </div>
              </Grid2>

              <Grid2>
                <div>
                  <FLabel>CFOP</FLabel>
                  <FInp value={form.cfop} onChange={v => set("cfop", v)} placeholder="Ex: 5.102" maxLength={6} />
                </div>
                <div>
                  <FLabel>Origem da mercadoria</FLabel>
                  <FSel value={form.origem_mercadoria} onChange={v => set("origem_mercadoria", v)} opts={ORIGENS} />
                </div>
              </Grid2>

              <div>
                <FLabel>Regime tributário</FLabel>
                <FSel value={form.regime_tributario} onChange={v => set("regime_tributario", v)} opts={REGIMES} />
              </div>

              <div>
                <FLabel>Observação fiscal</FLabel>
                <textarea
                  value={form.observacao_fiscal}
                  onChange={e => set("observacao_fiscal", e.target.value)}
                  placeholder="Observações adicionais para NF-e..."
                  rows={3}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.5 }}
                />
              </div>
            </>
          )}

          {/* ── Aba 2: ICMS ── */}
          {aba === "icms" && (
            <>
              {isSimples ? (
                <div>
                  <FLabel>CSOSN — Simples Nacional</FLabel>
                  <FSel value={form.csosn} onChange={v => set("csosn", v)} opts={CSOSN_OPTS} placeholder="Selecione o CSOSN..." />
                </div>
              ) : (
                <div>
                  <FLabel>CST ICMS — Regime Normal</FLabel>
                  <FSel value={form.cst_icms} onChange={v => set("cst_icms", v)} opts={CST_ICMS_OPTS} placeholder="Selecione o CST..." />
                </div>
              )}

              <Grid2>
                <div>
                  <FLabel>Alíquota ICMS</FLabel>
                  <FPct value={form.aliquota_icms} onChange={v => set("aliquota_icms", v)} />
                </div>
                <div>
                  <FLabel>Redução base de cálculo</FLabel>
                  <FPct value={form.reducao_base_icms} onChange={v => set("reducao_base_icms", v)} placeholder="0,00" />
                </div>
              </Grid2>

              <div style={{ padding: "10px 14px", borderRadius: 10, background: `${C.accent}0d`, border: `1px solid ${C.accent}22`, fontSize: sz.fontSm, color: C.muted, lineHeight: 1.5 }}>
                {isSimples
                  ? "Empresas do Simples Nacional utilizam CSOSN. ICMS é recolhido pelo DAS — preencha a alíquota se houver ST."
                  : "Empresas de Lucro Presumido/Real utilizam CST. Preencha alíquota conforme tabela do estado."}
              </div>
            </>
          )}

          {/* ── Aba 3: PIS / COFINS / IPI ── */}
          {aba === "pis_cofins" && (
            <>
              <Divider label="PIS" />
              <Grid2>
                <div>
                  <FLabel>CST PIS</FLabel>
                  <FSel value={form.cst_pis} onChange={v => set("cst_pis", v)} opts={CST_PIS_COFINS} placeholder="Selecione..." />
                </div>
                <div>
                  <FLabel>Alíquota PIS</FLabel>
                  <FPct value={form.aliquota_pis} onChange={v => set("aliquota_pis", v)} />
                </div>
              </Grid2>

              <Divider label="COFINS" />
              <Grid2>
                <div>
                  <FLabel>CST COFINS</FLabel>
                  <FSel value={form.cst_cofins} onChange={v => set("cst_cofins", v)} opts={CST_PIS_COFINS} placeholder="Selecione..." />
                </div>
                <div>
                  <FLabel>Alíquota COFINS</FLabel>
                  <FPct value={form.aliquota_cofins} onChange={v => set("aliquota_cofins", v)} />
                </div>
              </Grid2>

              <Divider label="IPI — obrigatório para bebidas e produtos industrializados" />
              <Grid2>
                <div>
                  <FLabel>CST IPI</FLabel>
                  <FInp value={form.cst_ipi} onChange={v => set("cst_ipi", v)} placeholder="Ex: 50" maxLength={4} />
                </div>
                <div>
                  <FLabel>Alíquota IPI</FLabel>
                  <FPct value={form.aliquota_ipi} onChange={v => set("aliquota_ipi", v)} />
                </div>
              </Grid2>
            </>
          )}

          {/* ── Aba 4: Reforma 2026 ── */}
          {aba === "reforma" && (
            <>
              <div style={{ padding: "10px 14px", borderRadius: 10, background: `${C.blue}0d`, border: `1px solid ${C.blue}33`, fontSize: sz.fontSm, color: C.muted, lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <LuReceiptText size={15} color={C.blue} style={{ flexShrink: 0, marginTop: 1 }} />
                Campos obrigatórios desde jan/2026 no layout NFC-e conforme Reforma Tributária. IBS substitui ICMS, CBS substitui PIS/COFINS.
              </div>

              <div>
                <FLabel>Alíquota IBS — substitui ICMS</FLabel>
                <FPct value={form.aliquota_ibs} onChange={v => set("aliquota_ibs", v)} />
              </div>
              <div>
                <FLabel>Alíquota CBS — substitui PIS/COFINS</FLabel>
                <FPct value={form.aliquota_cbs} onChange={v => set("aliquota_cbs", v)} />
              </div>
              <div>
                <FLabel>Alíquota IS — Imposto Seletivo</FLabel>
                <FPct value={form.aliquota_is} onChange={v => set("aliquota_is", v)} />
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Aplicável a bebidas alcoólicas, cigarros e similares.</div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", paddingBottom: "calc(14px + env(safe-area-inset-bottom))", borderTop: `1px solid ${C.border}`, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {erro && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}33`, color: C.red, fontSize: sz.fontSm, display: "flex", gap: 6, alignItems: "center" }}>
              <LuTriangleAlert size={14} style={{ flexShrink: 0 }} /> {erro}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} disabled={salvando} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: salvando ? C.faint : C.accent, color: "#fff", cursor: salvando ? "not-allowed" : "pointer", fontWeight: 800, fontSize: sz.fontBase, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {salvando ? "Salvando..." : <><LuCheck size={15} /> Salvar configuração</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Componente principal ─────────────────────────────────────────────

export default function ImpostosAdmin({ sz }) {
  const { products } = useApp();

  const [fiscalMap,    setFiscalMap]    = useState({}); // { item_id: dados_fiscal }
  const [loading,      setLoading]      = useState(true);
  const [busca,        setBusca]        = useState("");
  const [catFiltro,    setCatFiltro]    = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState("Todos");
  const [modalItem,    setModalItem]    = useState(null);

  // Produtos elegíveis (excluindo Produção e Insumo)
  const itens = useMemo(() =>
    products.filter(p => !CATS_EXCLUIDAS.includes(p.category)),
    [products]
  );

  const categorias = useMemo(() =>
    [...new Set(itens.map(p => p.category).filter(Boolean))].sort(),
    [itens]
  );

  useEffect(() => {
    if (!itens.length) { setLoading(false); return; }
    const ids = itens.map(p => p.id);
    supabase
      .from("itens_fiscal")
      .select("*")
      .in("item_id", ids)
      .then(({ data }) => {
        const map = {};
        (data ?? []).forEach(d => { map[d.item_id] = d; });
        setFiscalMap(map);
        setLoading(false);
      });
  }, [itens.length]);

  const onSaved = (itemId, payload) => {
    setFiscalMap(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...payload } }));
  };

  // Filtragem
  const itensFiltrados = useMemo(() => {
    return itens.filter(p => {
      const temConf  = !!fiscalMap[p.id];
      if (catFiltro    !== "Todos" && p.category !== catFiltro) return false;
      if (statusFiltro === "Configurados" && !temConf)  return false;
      if (statusFiltro === "Pendentes"    &&  temConf)  return false;
      if (busca && !p.name.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [itens, fiscalMap, catFiltro, statusFiltro, busca]);

  // Agrupados por categoria
  const grupos = useMemo(() => {
    const m = {};
    itensFiltrados.forEach(p => {
      if (!m[p.category]) m[p.category] = [];
      m[p.category].push(p);
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [itensFiltrados]);

  const totalConf    = itens.filter(p => !!fiscalMap[p.id]).length;
  const totalPend    = itens.length - totalConf;

  if (loading) {
    return <div style={{ color: C.muted, textAlign: "center", padding: 60, fontSize: sz.fontBase }}>Carregando configurações fiscais...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: sz.fontLg, color: C.text }}>Configuração Fiscal dos Itens</div>
        <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 3 }}>
          Sincronizado com Cadastros · Produção e Insumos excluídos automaticamente
        </div>
      </div>

      {/* Badges contador */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { label: `${itens.length} ite${itens.length !== 1 ? "ns" : "m"}`, color: C.text },
          { label: `${totalConf} configurado${totalConf !== 1 ? "s" : ""}`, color: C.green },
          { label: `${totalPend} pendente${totalPend !== 1 ? "s" : ""}`, color: "#f59e0b" },
        ].map((b, i) => (
          <span key={i} style={{ fontSize: sz.fontSm, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: `${b.color}18`, color: b.color, border: `1px solid ${b.color}33` }}>
            {b.label}
          </span>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {/* Busca */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <LuSearch size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar item..."
            style={{ width: "100%", padding: "9px 32px 9px 34px", borderRadius: 10, border: `1.5px solid ${busca ? C.accent : C.border}`, background: C.surface, color: C.text, fontSize: sz.fontSm + 1, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          {busca && (
            <button onClick={() => setBusca("")} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0, padding: 2 }}>
              <LuX size={14} />
            </button>
          )}
        </div>

        {/* Categoria */}
        <select
          value={catFiltro}
          onChange={e => setCatFiltro(e.target.value)}
          style={{ padding: "9px 32px 9px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontSm + 1, fontFamily: "inherit", outline: "none", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
        >
          <option value="Todos">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Status */}
        <select
          value={statusFiltro}
          onChange={e => setStatusFiltro(e.target.value)}
          style={{ padding: "9px 32px 9px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontSm + 1, fontFamily: "inherit", outline: "none", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
        >
          <option value="Todos">Todos os status</option>
          <option value="Configurados">Configurados</option>
          <option value="Pendentes">Pendentes</option>
        </select>
      </div>

      {/* Lista agrupada */}
      {grupos.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>📋</div>
          <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>
            {itens.length === 0 ? "Nenhum item cadastrado (excluindo Produção e Insumos)" : "Nenhum item encontrado para os filtros selecionados"}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {grupos.map(([cat, itensCat]) => (
            <div key={cat}>
              {/* Header do grupo */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontWeight: 800, fontSize: sz.fontBase, color: C.text }}>{cat}</span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: C.surface, color: C.muted, border: `1px solid ${C.border}` }}>
                  {itensCat.length} {itensCat.length === 1 ? "item" : "itens"}
                </span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>

              {/* Itens da categoria */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
                {itensCat.map((item, i) => {
                  const fiscal   = fiscalMap[item.id];
                  const conf     = !!fiscal;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "13px 18px",
                        borderBottom: i < itensCat.length - 1 ? `1px solid ${C.border}` : "none",
                      }}
                    >
                      {/* Emoji / ícone */}
                      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: C.surface, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                        {item.emoji || "📦"}
                      </div>

                      {/* Nome */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.name}
                        </div>
                        {fiscal?.ncm && (
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>NCM {fiscal.ncm}</div>
                        )}
                      </div>

                      {/* Badge status */}
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                        background: conf ? `${C.green}15` : `#f59e0b15`,
                        color: conf ? C.green : "#f59e0b",
                        border: `1px solid ${conf ? C.green : "#f59e0b"}44`,
                        whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                        {conf ? "✓ Configurado" : "Pendente"}
                      </span>

                      {/* Botão */}
                      <button
                        onClick={() => setModalItem(item)}
                        style={{
                          padding: "7px 16px", borderRadius: 9,
                          border: conf ? `1px solid ${C.border}` : `1.5px solid ${C.accent}`,
                          background: conf ? "none" : `${C.accent}12`,
                          color: conf ? C.muted : C.accent,
                          cursor: "pointer", fontWeight: 700,
                          fontSize: sz.fontSm + 1, fontFamily: "inherit",
                          flexShrink: 0,
                        }}
                      >
                        {conf ? "Editar" : "Configurar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalItem && (
        <ModalFiscal
          item={modalItem}
          dadosSalvos={fiscalMap[modalItem.id] ?? {}}
          sz={sz}
          onClose={() => setModalItem(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
