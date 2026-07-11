import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuSearch, LuX, LuCheck, LuTriangleAlert, LuReceiptText } from "react-icons/lu";
import "./ImpostosAdmin.css";

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
  return <div className="impostos-admin__label">{children}</div>;
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
      className={`impostos-admin__input${disabled ? " impostos-admin__input--disabled" : ""}`}
    />
  );
}

function FSel({ value, onChange, opts, placeholder }) {
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      className="impostos-admin__select"
      style={{ color: value ? varColor(C.text) : varColor(C.muted) }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function FPct({ value, onChange, placeholder = "0,00" }) {
  return (
    <div className="impostos-admin__pct-wrap">
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="impostos-admin__pct-input"
      />
      <span className="impostos-admin__pct-simbolo">%</span>
    </div>
  );
}

function Grid2({ children }) {
  return <div className="impostos-admin__grid2">{children}</div>;
}

function Divider({ label }) {
  return (
    <div className="impostos-admin__divider">
      <div className="impostos-admin__divider-linha" />
      <span className="impostos-admin__divider-label">{label}</span>
      <div className="impostos-admin__divider-linha" />
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
      className="impostos-admin__modal-overlay"
    >
      <div className="impostos-admin__modal">
        {/* Header */}
        <div className="impostos-admin__modal-header">
          <div className="impostos-admin__modal-topo">
            <div>
              <div className="impostos-admin__modal-titulo" style={{ fontSize: sz.fontLg }}>{item.name}</div>
              <div className="impostos-admin__modal-sub" style={{ fontSize: sz.fontSm }}>
                {item.category} · Configuração Fiscal
              </div>
            </div>
            <button onClick={onClose} disabled={salvando} className="impostos-admin__modal-fechar">
              <LuX size={20} />
            </button>
          </div>
          {/* Sub-tabs */}
          <div className="impostos-admin__abas">
            {ABAS_MODAL.map(a => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className="impostos-admin__aba"
                style={{
                  color: aba === a.id ? varColor(C.accent) : varColor(C.muted),
                  fontWeight: aba === a.id ? 700 : 500, fontSize: sz.fontSm + 1,
                  borderBottom: aba === a.id ? `2px solid var(${C.accent})` : "2px solid transparent",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo da aba */}
        <div className="impostos-admin__modal-corpo">

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
                  className="impostos-admin__textarea"
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

              <div className="impostos-admin__aviso" style={{ background: alfa(C.accent, "0d"), border: `1px solid ${alfa(C.accent, "22")}`, fontSize: sz.fontSm }}>
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
              <div className="impostos-admin__aviso impostos-admin__aviso--com-icone" style={{ background: alfa(C.blue, "0d"), border: `1px solid ${alfa(C.blue, "33")}`, fontSize: sz.fontSm }}>
                <LuReceiptText size={15} color={varColor(C.blue)} style={{ flexShrink: 0, marginTop: 1 }} />
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
                <div className="impostos-admin__aviso-ajuda" style={{ fontSize: 12 }}>Aplicável a bebidas alcoólicas, cigarros e similares.</div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="impostos-admin__modal-footer">
          {erro && (
            <div className="impostos-admin__erro" style={{ background: alfa(C.red, "12"), border: `1px solid ${alfa(C.red, "33")}`, fontSize: sz.fontSm }}>
              <LuTriangleAlert size={14} style={{ flexShrink: 0 }} /> {erro}
            </div>
          )}
          <div className="impostos-admin__modal-botoes">
            <button onClick={onClose} disabled={salvando} className="impostos-admin__btn-cancelar" style={{ fontSize: sz.fontBase }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando} className="impostos-admin__btn-salvar" style={{ background: salvando ? varColor(C.faint) : varColor(C.accent), cursor: salvando ? "not-allowed" : "pointer", fontSize: sz.fontBase }}>
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
    return <div style={{ color: varColor(C.muted), textAlign: "center", padding: 60, fontSize: sz.fontBase }}>Carregando configurações fiscais...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 20 }}>
        <div className="impostos-admin__cabecalho-titulo" style={{ fontSize: sz.fontLg }}>Configuração Fiscal dos Itens</div>
        <div className="impostos-admin__cabecalho-sub" style={{ fontSize: sz.fontSm }}>
          Sincronizado com Cadastros · Produção e Insumos excluídos automaticamente
        </div>
      </div>

      {/* Badges contador */}
      <div className="impostos-admin__badges">
        {[
          { label: `${itens.length} ite${itens.length !== 1 ? "ns" : "m"}`, color: varColor(C.text) },
          { label: `${totalConf} configurado${totalConf !== 1 ? "s" : ""}`, color: varColor(C.green) },
          { label: `${totalPend} pendente${totalPend !== 1 ? "s" : ""}`, color: "#f59e0b" },
        ].map((b, i) => (
          <span key={i} className="impostos-admin__badge" style={{ fontSize: sz.fontSm, background: alfa(b.color, "18"), color: b.color, border: `1px solid ${alfa(b.color, "33")}` }}>
            {b.label}
          </span>
        ))}
      </div>

      {/* Filtros */}
      <div className="impostos-admin__filtros">
        {/* Busca */}
        <div className="impostos-admin__busca-wrap">
          <LuSearch size={15} className="impostos-admin__busca-icone" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar item..."
            className="impostos-admin__busca-input"
            style={{ borderColor: busca ? varColor(C.accent) : varColor(C.border), fontSize: sz.fontSm + 1 }}
          />
          {busca && (
            <button onClick={() => setBusca("")} className="impostos-admin__busca-limpar">
              <LuX size={14} />
            </button>
          )}
        </div>

        {/* Categoria */}
        <select
          value={catFiltro}
          onChange={e => setCatFiltro(e.target.value)}
          className="impostos-admin__filtro-select"
          style={{ fontSize: sz.fontSm + 1 }}
        >
          <option value="Todos">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Status */}
        <select
          value={statusFiltro}
          onChange={e => setStatusFiltro(e.target.value)}
          className="impostos-admin__filtro-select"
          style={{ fontSize: sz.fontSm + 1 }}
        >
          <option value="Todos">Todos os status</option>
          <option value="Configurados">Configurados</option>
          <option value="Pendentes">Pendentes</option>
        </select>
      </div>

      {/* Lista agrupada */}
      {grupos.length === 0 ? (
        <div className="impostos-admin__vazio">
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>📋</div>
          <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>
            {itens.length === 0 ? "Nenhum item cadastrado (excluindo Produção e Insumos)" : "Nenhum item encontrado para os filtros selecionados"}
          </div>
        </div>
      ) : (
        <div className="impostos-admin__grupos">
          {grupos.map(([cat, itensCat]) => (
            <div key={cat}>
              {/* Header do grupo */}
              <div className="impostos-admin__grupo-header">
                <span className="impostos-admin__grupo-titulo" style={{ fontSize: sz.fontBase }}>{cat}</span>
                <span className="impostos-admin__grupo-contador">
                  {itensCat.length} {itensCat.length === 1 ? "item" : "itens"}
                </span>
                <div className="impostos-admin__grupo-linha" />
              </div>

              {/* Itens da categoria */}
              <div className="impostos-admin__grupo-lista">
                {itensCat.map((item, i) => {
                  const fiscal   = fiscalMap[item.id];
                  const conf     = !!fiscal;
                  return (
                    <div
                      key={item.id}
                      className="impostos-admin__item"
                      style={{ borderBottom: i < itensCat.length - 1 ? `1px solid var(${C.border})` : "none" }}
                    >
                      {/* Emoji / ícone */}
                      <div className="impostos-admin__item-icone">
                        {item.emoji || "📦"}
                      </div>

                      {/* Nome */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="impostos-admin__item-nome" style={{ fontSize: sz.fontBase }}>
                          {item.name}
                        </div>
                        {fiscal?.ncm && (
                          <div className="impostos-admin__item-ncm">NCM {fiscal.ncm}</div>
                        )}
                      </div>

                      {/* Badge status */}
                      <span className="impostos-admin__item-badge" style={{
                        background: conf ? alfa(C.green, "15") : alfa("#f59e0b", "15"),
                        color: conf ? varColor(C.green) : "#f59e0b",
                        border: `1px solid ${alfa(conf ? varColor(C.green) : "#f59e0b", "44")}`,
                      }}>
                        {conf ? "✓ Configurado" : "Pendente"}
                      </span>

                      {/* Botão */}
                      <button
                        onClick={() => setModalItem(item)}
                        className="impostos-admin__btn-configurar"
                        style={{
                          border: conf ? `1px solid var(${C.border})` : `1.5px solid var(${C.accent})`,
                          background: conf ? "none" : alfa(C.accent, "12"),
                          color: conf ? varColor(C.muted) : varColor(C.accent),
                          fontSize: sz.fontSm + 1,
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
