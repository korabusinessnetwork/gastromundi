import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { parseNFe } from "@/utils/parseNFe";
import {
  LuUpload, LuFileText, LuCheck, LuX, LuSearch,
  LuArrowLeft, LuChevronRight, LuPackage, LuTriangleAlert,
  LuCalendar, LuBuilding2, LuHash, LuPlus, LuTruck,
} from "react-icons/lu";

const fmtDt  = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const fmtR   = (v) => "R$ " + Number(v ?? 0).toFixed(2);
const fmtCnpj = (v) => {
  if (!v) return "—";
  const s = String(v).replace(/\D/g, "");
  return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") || v;
};

// ── Stepper ───────────────────────────────────────────────────────

function Stepper({ step }) {
  const steps = ["Upload", "Cabeçalho", "Vínculos", "Confirmar"];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 32 }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done   = n < step;
        const active = n === step;
        const color  = done ? C.green : active ? C.accent : C.border;
        return (
          <div key={n} style={{ display: "flex", alignItems: "flex-start", flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: done ? C.green : active ? C.accent : C.surface,
                border: `2px solid ${color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: done || active ? "#fff" : C.muted,
                fontWeight: 800, fontSize: 14, transition: "all 0.2s",
              }}>
                {done ? <LuCheck size={14} /> : n}
              </div>
              <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? C.text : C.muted, whiteSpace: "nowrap" }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? C.green : C.border, margin: "16px 8px 0", transition: "background 0.2s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Linha de vínculo (Step 3) ─────────────────────────────────────

function VinculaRow({ item, products, onChange }) {
  const [busca,  setBusca]  = useState(item.produto?.name || "");
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  const filtrados = busca.length > 1
    ? products.filter(p => p.name.toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
    : [];

  const selectProduto = (p) => {
    setBusca(p.name);
    setAberto(false);
    const same = p.unidade_estoque && item.unidadeXml &&
      p.unidade_estoque.toLowerCase() === item.unidadeXml.toLowerCase();
    const fator = same ? 1 : 1;
    onChange({ ...item, produto: p, fator, fatorAuto: same, qtdEstoque: item.quantidade * fator });
  };

  const clearProduto = () => {
    setBusca("");
    onChange({ ...item, produto: null, fator: 1, fatorAuto: false, qtdEstoque: item.quantidade });
  };

  const setFator = (val) => {
    const f = parseFloat(String(val).replace(",", ".")) || 0;
    onChange({ ...item, fator: f, qtdEstoque: item.quantidade * f });
  };

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const linked = !!item.produto;

  return (
    <tr
      style={{ background: !linked ? `${"#f59e0b"}0a` : "transparent", borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
      onMouseEnter={e => e.currentTarget.style.background = C.surface}
      onMouseLeave={e => e.currentTarget.style.background = !linked ? `${"#f59e0b"}0a` : "transparent"}
    >
      {/* # */}
      <td style={{ padding: "10px 10px", fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{item.numero}</td>

      {/* Descrição */}
      <td style={{ padding: "10px 10px", maxWidth: 180 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descricaoXml}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{item.codigoXml}</div>
      </td>

      {/* Qtd + Unid XML */}
      <td style={{ padding: "10px 10px", fontSize: 13, textAlign: "center", whiteSpace: "nowrap" }}>
        {item.quantidade} <span style={{ color: C.muted, fontSize: 11 }}>{item.unidadeXml}</span>
      </td>

      {/* Preço unit */}
      <td style={{ padding: "10px 10px", fontSize: 12, textAlign: "right", color: C.muted, whiteSpace: "nowrap" }}>
        {fmtR(item.precoUnitario)}
      </td>

      {/* Produto vinculado */}
      <td style={{ padding: "10px 10px", minWidth: 180 }}>
        <div ref={ref} style={{ position: "relative" }}>
          {linked ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: `${C.green}12`, border: `1.5px solid ${C.green}44`,
              borderRadius: 8, padding: "6px 10px",
            }}>
              <span style={{ fontSize: 16 }}>{item.produto.emoji || "📦"}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.green, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.produto.name}
              </span>
              <button onClick={clearProduto} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, lineHeight: 1, display: "flex" }}>
                <LuX size={12} />
              </button>
            </div>
          ) : (
            <>
              <div style={{ position: "relative" }}>
                <LuSearch size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
                <input
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setAberto(true); }}
                  onFocus={() => setAberto(true)}
                  placeholder="Buscar produto..."
                  style={{
                    width: "100%", padding: "7px 8px 7px 26px", borderRadius: 8,
                    border: `1.5px solid ${C.border}`, background: C.surface,
                    color: C.text, fontSize: 13, fontFamily: "inherit",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {aberto && filtrados.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, zIndex: 200, marginTop: 2,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.35)", overflow: "hidden",
                }}>
                  {filtrados.map(p => (
                    <button
                      key={p.id}
                      onMouseDown={() => selectProduto(p)}
                      style={{
                        width: "100%", padding: "8px 12px", border: "none",
                        background: "none", cursor: "pointer", textAlign: "left",
                        display: "flex", alignItems: "center", gap: 8,
                        fontFamily: "inherit", color: C.text,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surface}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span style={{ fontSize: 15 }}>{p.emoji || "📦"}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{p.unidade_estoque}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </td>

      {/* Unid estoque */}
      <td style={{ padding: "10px 10px", fontSize: 12, textAlign: "center", color: C.muted }}>
        {item.produto?.unidade_estoque || "—"}
      </td>

      {/* Fator */}
      <td style={{ padding: "10px 10px", textAlign: "center" }}>
        {item.produto ? (
          item.fatorAuto ? (
            <span style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>1 (auto)</span>
          ) : (
            <input
              type="number"
              min="0"
              step="any"
              value={item.fator}
              onChange={e => setFator(e.target.value)}
              style={{
                width: 64, padding: "5px 6px", borderRadius: 7,
                border: `1.5px solid ${C.border}`, background: C.surface,
                color: C.text, fontSize: 13, fontFamily: "inherit",
                outline: "none", textAlign: "center",
              }}
            />
          )
        ) : "—"}
      </td>

      {/* Qtd convertida */}
      <td style={{ padding: "10px 10px", fontSize: 14, fontWeight: 800, textAlign: "center", color: linked ? C.green : C.muted }}>
        {linked ? item.qtdEstoque.toFixed(3) : "—"}
      </td>
    </tr>
  );
}

// ── Componente principal ──────────────────────────────────────────

const ITEM_MANUAL_VAZIO = { descricaoXml: "", quantidade: "", unidadeXml: "", precoUnitario: "" };

export default function NotasFiscaisTab({ sz, fornecedores = [], onAddFornecedor }) {
  const { products, estoque, bulkSetEstoque } = useApp();

  const [view,        setView]       = useState("lista");
  const [notas,       setNotas]      = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [notaDetalhe, setNotaDetalhe] = useState(null);
  const [notaItens,   setNotaItens]  = useState([]);

  // Wizard (XML)
  const [step,         setStep]        = useState(1);
  const [xmlString,    setXmlString]   = useState("");
  const [parsed,       setParsed]      = useState(null);
  const [xmlErro,      setXmlErro]     = useState("");
  const [checkingDup,  setCheckingDup] = useState(false);
  const [duplicadaEm,  setDuplicadaEm] = useState(null);
  const [itensVinc,    setItensVinc]   = useState([]);
  const [saving,       setSaving]      = useState(false);
  const [saveErro,     setSaveErro]    = useState("");
  const [importOk,     setImportOk]    = useState(null);
  const [dragOver,     setDragOver]    = useState(false);
  const fileRef = useRef(null);

  // Formulário manual
  const [manualForm,  setManualForm]  = useState({
    numero: "", serie: "",
    dataEmissao: new Date().toISOString().split("T")[0],
  });
  const [manualItens, setManualItens] = useState([{ ...ITEM_MANUAL_VAZIO }]);
  const [manualErro,  setManualErro]  = useState("");
  const [fromManual,    setFromManual]    = useState(false);
  const [pendingFornNome, setPendingFornNome] = useState(null);

  // Fornecedor
  const [showFornPopup,  setShowFornPopup]  = useState(false); // popup XML
  const [fornSaving,     setFornSaving]     = useState(false);
  const [manualFornId,   setManualFornId]   = useState("");    // id selecionado no formulário manual
  const [manualFornBusca, setManualFornBusca] = useState("");
  const [showFornDD,     setShowFornDD]     = useState(false);
  const [showNovoForn,   setShowNovoForn]   = useState(false); // popup "cadastrar novo" no manual
  const [novoFornForm,   setNovoFornForm]   = useState({ nome: "", cnpj: "" });
  const [novoFornErro,   setNovoFornErro]   = useState("");
  const fornDDRef = useRef(null);

  useEffect(() => { loadNotas(); }, []);

  useEffect(() => {
    if (!pendingFornNome) return;
    const found = fornecedores.find(f => f.nome.trim().toLowerCase() === pendingFornNome.trim().toLowerCase());
    if (found) { setManualFornId(found.id); setPendingFornNome(null); setShowNovoForn(false); }
  }, [fornecedores, pendingFornNome]);

  useEffect(() => {
    const h = (e) => { if (fornDDRef.current && !fornDDRef.current.contains(e.target)) setShowFornDD(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const loadNotas = async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from("notas_fiscais")
      .select("*, notas_fiscais_itens(id)")
      .order("created_at", { ascending: false });
    setNotas(data || []);
    setLoadingList(false);
  };

  // ── Fornecedor helpers ─────────────────────────────────────────

  const normCnpj = (v) => String(v ?? "").replace(/\D/g, "");

  const findFornecedor = (nome, cnpj) => {
    const cnpjLimpo = normCnpj(cnpj);
    if (cnpjLimpo) {
      const byCnpj = fornecedores.find(f => normCnpj(f.cnpj) === cnpjLimpo);
      if (byCnpj) return byCnpj;
    }
    return fornecedores.find(f => f.nome.trim().toLowerCase() === (nome ?? "").trim().toLowerCase());
  };

  const salvarNovoFornecedor = async (nome, cnpj) => {
    if (!onAddFornecedor) return;
    setFornSaving(true);
    await onAddFornecedor({ nome: nome.trim(), cnpj: cnpj?.trim() || "" });
    setFornSaving(false);
  };

  // Seletor manual: fornecedor selecionado pelo id
  const fornecedorSelecionado = fornecedores.find(f => f.id === manualFornId) || null;

  // ── Wizard helpers ─────────────────────────────────────────────

  const startWizard = () => {
    setStep(1); setXmlString(""); setParsed(null); setXmlErro("");
    setDuplicadaEm(null); setItensVinc([]); setSaving(false);
    setSaveErro(""); setImportOk(null); setFromManual(false);
    setView("wizard");
  };

  const startManual = () => {
    setManualForm({ numero: "", serie: "", dataEmissao: new Date().toISOString().split("T")[0] });
    setManualItens([{ ...ITEM_MANUAL_VAZIO }]);
    setManualErro("");
    setManualFornId(""); setManualFornBusca(""); setShowFornDD(false);
    setShowNovoForn(false); setNovoFornForm({ nome: "", cnpj: "" }); setNovoFornErro("");
    setSaveErro(""); setSaving(false); setImportOk(null);
    setView("manual");
  };

  const confirmarManual = () => {
    if (!fornecedorSelecionado) { setManualErro("Selecione um fornecedor."); return; }
    if (!manualForm.numero.trim()) { setManualErro("Informe o número da nota."); return; }
    const itensValidos = manualItens.filter(i => i.descricaoXml.trim() && Number(i.quantidade) > 0);
    if (itensValidos.length === 0) { setManualErro("Adicione ao menos um item com descrição e quantidade."); return; }
    setManualErro("");
    const valorTotal = itensValidos.reduce((s, i) => s + (Number(i.quantidade) || 0) * (parseFloat(String(i.precoUnitario).replace(",", ".")) || 0), 0);
    setParsed({
      cabecalho: {
        chaveAcesso: null,
        numero: manualForm.numero.trim(),
        serie: manualForm.serie.trim() || null,
        dataEmissao: manualForm.dataEmissao || null,
        fornecedorNome: fornecedorSelecionado.nome,
        fornecedorCnpj: fornecedorSelecionado.cnpj || null,
        valorTotal,
      },
      itens: itensValidos.map((it, idx) => ({
        numero: idx + 1,
        descricaoXml: it.descricaoXml.trim(),
        codigoXml: null,
        unidadeXml: it.unidadeXml.trim() || "UN",
        quantidade: Number(it.quantidade) || 0,
        precoUnitario: parseFloat(String(it.precoUnitario).replace(",", ".")) || 0,
        precoTotal: (Number(it.quantidade) || 0) * (parseFloat(String(it.precoUnitario).replace(",", ".")) || 0),
      })),
    });
    setFromManual(true);
    setXmlString("");
    setItensVinc(itensValidos.map((it, idx) => ({
      numero: idx + 1,
      descricaoXml: it.descricaoXml.trim(),
      codigoXml: null,
      unidadeXml: it.unidadeXml.trim() || "UN",
      quantidade: Number(it.quantidade) || 0,
      precoUnitario: parseFloat(String(it.precoUnitario).replace(",", ".")) || 0,
      precoTotal: (Number(it.quantidade) || 0) * (parseFloat(String(it.precoUnitario).replace(",", ".")) || 0),
      produto: null, fator: 1, fatorAuto: false,
      qtdEstoque: Number(it.quantidade) || 0,
    })));
    setStep(3);
    setView("wizard");
  };

  const processFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      setXmlErro("Apenas arquivos .xml são aceitos."); return;
    }
    // Detecta encoding declarado no XML (NF-e v3.10 pode ser ISO-8859-1)
    const rawBuffer = await file.arrayBuffer();
    const sniff = new TextDecoder("utf-8").decode(rawBuffer.slice(0, 200));
    const encMatch = sniff.match(/encoding=["']([^"']+)["']/i);
    const charset = encMatch ? encMatch[1] : "utf-8";
    const text = new TextDecoder(charset).decode(rawBuffer);
    const result = parseNFe(text);
    if (!result.valido) { setXmlErro(result.erro); return; }
    setXmlErro("");
    setXmlString(text);
    setParsed(result);
    const cab = result.cabecalho;
    if (cab && !findFornecedor(cab.fornecedorNome, cab.fornecedorCnpj)) {
      setShowFornPopup(true);
    } else {
      setShowFornPopup(false);
    }
    setStep(2);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const avancarStep2 = async () => {
    if (!parsed?.cabecalho?.chaveAcesso) {
      initItens(); setStep(3); return;
    }
    setCheckingDup(true);
    const { data } = await supabase
      .from("notas_fiscais")
      .select("created_at")
      .eq("chave_acesso", parsed.cabecalho.chaveAcesso)
      .maybeSingle();
    setCheckingDup(false);
    if (data) {
      setDuplicadaEm(new Date(data.created_at).toLocaleDateString("pt-BR"));
    } else {
      setDuplicadaEm(null);
      initItens();
      setStep(3);
    }
  };

  const initItens = () => {
    setItensVinc((parsed?.itens || []).map(item => ({
      ...item, produto: null, fator: 1, fatorAuto: false, qtdEstoque: item.quantidade,
    })));
  };

  const updateItem = (i, updated) => setItensVinc(prev => prev.map((it, idx) => idx === i ? updated : it));

  const vinculados    = itensVinc.filter(i => !!i.produto);
  const naoVinculados = itensVinc.filter(i => !i.produto);

  const handleConfirmar = async () => {
    setSaving(true); setSaveErro("");
    try {
      const { cabecalho } = parsed;

      // 1. Nota fiscal
      const { data: notaData, error: notaErr } = await supabase
        .from("notas_fiscais")
        .insert({
          chave_acesso:    cabecalho.chaveAcesso || null,
          numero:          cabecalho.numero,
          serie:           cabecalho.serie,
          data_emissao:    cabecalho.dataEmissao || null,
          fornecedor_nome: cabecalho.fornecedorNome,
          fornecedor_cnpj: cabecalho.fornecedorCnpj,
          valor_total:     cabecalho.valorTotal,
          xml_raw:         xmlString,
        })
        .select()
        .single();
      if (notaErr) throw notaErr;

      // 2. Itens da nota
      await supabase.from("notas_fiscais_itens").insert(
        itensVinc.map(item => ({
          nota_fiscal_id:    notaData.id,
          product_id:        item.produto?.id || null,
          descricao_xml:     item.descricaoXml,
          codigo_xml:        item.codigoXml,
          unidade_xml:       item.unidadeXml,
          quantidade:        item.quantidade,
          preco_unitario:    item.precoUnitario,
          preco_total:       item.precoTotal,
          fator_conversao:   item.produto ? item.fator : null,
          quantidade_estoque: item.produto ? item.qtdEstoque : null,
        }))
      );

      // 3. Entradas de estoque (audit trail)
      if (vinculados.length > 0) {
        await supabase.from("estoque_entradas").insert(
          vinculados.map(item => ({
            product_id:     item.produto.id,
            nota_fiscal_id: notaData.id,
            quantidade:     item.qtdEstoque,
            preco_unitario: item.fator > 0 ? item.precoUnitario / item.fator : item.precoUnitario,
            data_entrada:   cabecalho.dataEmissao || new Date().toISOString().split("T")[0],
          }))
        );
      }

      // 4. Atualiza estoque no contexto (bulk para evitar race condition)
      if (vinculados.length > 0) {
        const novoEstoque = { ...estoque };
        for (const item of vinculados) {
          if (item.qtdEstoque > 0) {
            novoEstoque[item.produto.id] = (novoEstoque[item.produto.id] ?? 0) + item.qtdEstoque;
          }
        }
        await bulkSetEstoque(novoEstoque);
      }

      setImportOk({ numero: cabecalho.numero, fornecedor: cabecalho.fornecedorNome, count: vinculados.length });
      setStep(5);
      loadNotas();
    } catch (e) {
      setSaveErro("Erro ao salvar: " + (e.message || "tente novamente."));
    } finally {
      setSaving(false);
    }
  };

  const openDetalhe = async (nota) => {
    setNotaDetalhe(nota);
    const { data } = await supabase
      .from("notas_fiscais_itens")
      .select("*, products(name, emoji, unidade_estoque)")
      .eq("nota_fiscal_id", nota.id)
      .order("id");
    setNotaItens(data || []);
    setView("detalhe");
  };

  // ── Render: Manual ────────────────────────────────────────────

  if (view === "manual") {
    const setManualItem = (idx, patch) =>
      setManualItens(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
    const addItem = () => setManualItens(prev => [...prev, { ...ITEM_MANUAL_VAZIO }]);
    const removeItem = (idx) => setManualItens(prev => prev.filter((_, i) => i !== idx));

    const inpStyle = {
      width: "100%", padding: "9px 12px", borderRadius: 10,
      border: `1.5px solid ${C.border}`, background: C.surface,
      color: C.text, fontSize: sz.fontBase, fontFamily: "inherit",
      outline: "none", boxSizing: "border-box",
    };
    const label = (text) => (
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{text}</div>
    );

    return (
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => setView("lista")}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: C.text, display: "flex", alignItems: "center", gap: 6, fontSize: sz.fontSm + 1, fontWeight: 600, fontFamily: "inherit" }}
          >
            <LuArrowLeft size={14} /> Cancelar
          </button>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Nova nota manual</div>
        </div>

        {/* Cabeçalho da nota */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1, marginBottom: 20 }}>Dados do fornecedor e nota</div>

          {/* Seletor de fornecedor */}
          <div style={{ marginBottom: 16 }}>
            {label("Fornecedor *")}
            {fornecedorSelecionado ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${C.green}10`, border: `1.5px solid ${C.green}44`, borderRadius: 10, padding: "10px 14px" }}>
                <LuTruck size={16} color={C.green} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: C.green }}>{fornecedorSelecionado.nome}</div>
                  {fornecedorSelecionado.cnpj && <div style={{ fontSize: 12, color: C.muted }}>{fmtCnpj(fornecedorSelecionado.cnpj)}</div>}
                </div>
                <button
                  onClick={() => { setManualFornId(""); setManualFornBusca(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex" }}
                >
                  <LuX size={14} />
                </button>
              </div>
            ) : (
              <div ref={fornDDRef} style={{ position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <LuSearch size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
                  <input
                    style={{ ...inpStyle, paddingLeft: 32 }}
                    placeholder="Buscar fornecedor cadastrado..."
                    value={manualFornBusca}
                    onChange={e => { setManualFornBusca(e.target.value); setShowFornDD(true); }}
                    onFocus={() => setShowFornDD(true)}
                  />
                </div>
                {showFornDD && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, zIndex: 200, marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", overflow: "hidden" }}>
                    {fornecedores
                      .filter(f => !manualFornBusca || f.nome.toLowerCase().includes(manualFornBusca.toLowerCase()))
                      .slice(0, 8)
                      .map(f => (
                        <button
                          key={f.id}
                          onMouseDown={() => { setManualFornId(f.id); setManualFornBusca(""); setShowFornDD(false); }}
                          style={{ width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10, fontFamily: "inherit", color: C.text }}
                          onMouseEnter={e => e.currentTarget.style.background = C.surface}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                          <LuTruck size={14} color={C.muted} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{f.nome}</div>
                            {f.cnpj && <div style={{ fontSize: 11, color: C.muted }}>{fmtCnpj(f.cnpj)}</div>}
                          </div>
                        </button>
                      ))
                    }
                    <button
                      onMouseDown={() => { setShowFornDD(false); setShowNovoForn(true); setNovoFornForm({ nome: manualFornBusca, cnpj: "" }); setNovoFornErro(""); }}
                      style={{ width: "100%", padding: "10px 14px", border: "none", borderTop: `1px solid ${C.border}`, background: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", color: C.accent, fontWeight: 600, fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.background = `${C.accent}08`}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <LuPlus size={14} /> Cadastrar novo fornecedor
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              {label("Data de emissão")}
              <input
                type="date"
                style={inpStyle}
                value={manualForm.dataEmissao}
                onChange={e => setManualForm(f => ({ ...f, dataEmissao: e.target.value }))}
              />
            </div>
            <div>
              {label("Número da nota *")}
              <input
                style={inpStyle}
                placeholder="000000"
                value={manualForm.numero}
                onChange={e => setManualForm(f => ({ ...f, numero: e.target.value }))}
              />
            </div>
            <div>
              {label("Série")}
              <input
                style={inpStyle}
                placeholder="1"
                value={manualForm.serie}
                onChange={e => setManualForm(f => ({ ...f, serie: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Popup: cadastrar novo fornecedor (manual) */}
        {showNovoForn && createPortal(
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 440 }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontLg, marginBottom: 6 }}>Cadastrar fornecedor</div>
              <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginBottom: 20 }}>O fornecedor será salvo no cadastro e vinculado à nota.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                <div>
                  {label("Nome *")}
                  <input style={inpStyle} placeholder="Nome do fornecedor" value={novoFornForm.nome} onChange={e => setNovoFornForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div>
                  {label("CNPJ")}
                  <input style={inpStyle} placeholder="00.000.000/0000-00" value={novoFornForm.cnpj} onChange={e => setNovoFornForm(f => ({ ...f, cnpj: e.target.value }))} />
                </div>
              </div>
              {novoFornErro && <div style={{ color: C.red, fontSize: sz.fontSm + 1, marginBottom: 12, fontWeight: 600 }}>{novoFornErro}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowNovoForn(false); setNovoFornErro(""); }}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "none", color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}
                >
                  Cancelar
                </button>
                <button
                  disabled={fornSaving}
                  onClick={async () => {
                    if (!novoFornForm.nome.trim()) { setNovoFornErro("Informe o nome do fornecedor."); return; }
                    setPendingFornNome(novoFornForm.nome.trim());
                    await salvarNovoFornecedor(novoFornForm.nome, novoFornForm.cnpj);
                  }}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", cursor: fornSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit", opacity: fornSaving ? 0.6 : 1 }}
                >
                  {fornSaving ? "Salvando..." : "Cadastrar"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Itens */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1 }}>Itens da nota</div>
            <button
              onClick={addItem}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1, fontFamily: "inherit" }}
            >
              <LuPlus size={13} /> Adicionar item
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                  {["#", "Descrição *", "Qtd *", "Unidade", "Preço Unit. (R$)", ""].map((h, i) => (
                    <th key={i} style={{ padding: "10px 12px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.7, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manualItens.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 12px", fontSize: 13, color: C.muted, fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <input
                        style={{ ...inpStyle, padding: "7px 10px" }}
                        placeholder="Ex: Farinha de trigo..."
                        value={it.descricaoXml}
                        onChange={e => setManualItem(idx, { descricaoXml: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", width: 90 }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        style={{ ...inpStyle, padding: "7px 10px", textAlign: "center" }}
                        placeholder="0"
                        value={it.quantidade}
                        onChange={e => setManualItem(idx, { quantidade: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", width: 90 }}>
                      <input
                        style={{ ...inpStyle, padding: "7px 10px", textAlign: "center" }}
                        placeholder="KG"
                        value={it.unidadeXml}
                        onChange={e => setManualItem(idx, { unidadeXml: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", width: 130 }}>
                      <input
                        style={{ ...inpStyle, padding: "7px 10px", textAlign: "right" }}
                        placeholder="0,00"
                        value={it.precoUnitario}
                        onChange={e => setManualItem(idx, { precoUnitario: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      {manualItens.length > 1 && (
                        <button
                          onClick={() => removeItem(idx)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex", alignItems: "center" }}
                          onMouseEnter={e => e.currentTarget.style.color = C.red}
                          onMouseLeave={e => e.currentTarget.style.color = C.muted}
                        >
                          <LuX size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {manualErro && (
          <div style={{ background: `${C.red}12`, border: `1.5px solid ${C.red}44`, borderRadius: 12, padding: "12px 18px", marginBottom: 16, color: C.red, fontWeight: 600, fontSize: sz.fontBase, display: "flex", alignItems: "center", gap: 10 }}>
            <LuTriangleAlert size={16} /> {manualErro}
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setView("lista")}
            style={{ padding: "12px 24px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "none", color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}
          >
            Cancelar
          </button>
          <button
            onClick={confirmarManual}
            style={{ flex: 1, padding: "12px 24px", borderRadius: 12, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit", boxShadow: `0 4px 14px ${C.accent}44` }}
          >
            Continuar → Vincular produtos
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Detalhe ───────────────────────────────────────────

  if (view === "detalhe" && notaDetalhe) {
    const cab = notaDetalhe;
    return (
      <div>
        <button
          onClick={() => setView("lista")}
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: C.text, display: "flex", alignItems: "center", gap: 6, fontSize: sz.fontSm + 1, fontWeight: 600, fontFamily: "inherit", marginBottom: 20 }}
        >
          <LuArrowLeft size={14} /> Voltar
        </button>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg, marginBottom: 16 }}>
            Nota nº {cab.numero} — {cab.fornecedor_nome}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
            {[
              { label: "Fornecedor",    value: cab.fornecedor_nome },
              { label: "CNPJ",          value: fmtCnpj(cab.fornecedor_cnpj) },
              { label: "Série",         value: cab.serie || "—" },
              { label: "Data Emissão",  value: fmtDt(cab.data_emissao) },
              { label: "Valor Total",   value: fmtR(cab.valor_total) },
              { label: "Importada em",  value: fmtDt(cab.created_at?.split("T")[0]) },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{f.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                {["#", "Descrição XML", "Cód.", "Qtd", "Unid.", "Preço Unit.", "Produto", "Qtd Estoque"].map((h, i) => (
                  <th key={i} style={{ padding: "10px 12px", textAlign: i >= 3 ? "center" : "left", fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notaItens.map((it, i) => (
                <tr key={it.id} style={{ borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surface}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "10px 12px", fontSize: 12, color: C.muted }}>{i + 1}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, maxWidth: 200 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao_xml}</div>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: C.muted }}>{it.codigo_xml}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "center" }}>{it.quantidade}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "center", color: C.muted }}>{it.unidade_xml}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "center", color: C.muted }}>{fmtR(it.preco_unitario)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    {it.products ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{it.products.emoji || "📦"}</span>
                        <span style={{ fontWeight: 600, color: C.green }}>{it.products.name}</span>
                      </span>
                    ) : (
                      <span style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Não vinculado</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, textAlign: "center", color: it.quantidade_estoque ? C.green : C.muted }}>
                    {it.quantidade_estoque != null ? `${Number(it.quantidade_estoque).toFixed(3)} ${it.products?.unidade_estoque || ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Render: Wizard ────────────────────────────────────────────

  if (view === "wizard") {
    const cab = parsed?.cabecalho;

    return (
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => setView("lista")}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: C.text, display: "flex", alignItems: "center", gap: 6, fontSize: sz.fontSm + 1, fontWeight: 600, fontFamily: "inherit" }}
          >
            <LuArrowLeft size={14} /> Cancelar
          </button>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Importar XML NF-e</div>
        </div>

        {step <= 4 && <Stepper step={step} />}

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", maxWidth: 560,
                border: `2px dashed ${dragOver ? C.accent : xmlErro ? C.red : C.border}`,
                borderRadius: 20, padding: "60px 40px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                cursor: "pointer", transition: "border-color 0.2s, background 0.2s",
                background: dragOver ? `${C.accent}08` : xmlErro ? `${C.red}08` : C.card,
              }}
            >
              <div style={{ width: 64, height: 64, borderRadius: 16, background: dragOver ? `${C.accent}18` : C.surface, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LuUpload size={28} color={dragOver ? C.accent : C.muted} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: sz.fontLg - 1, marginBottom: 6 }}>
                  {dragOver ? "Solte o arquivo aqui" : "Arraste o XML ou clique para selecionar"}
                </div>
                <div style={{ fontSize: sz.fontSm + 1, color: C.muted }}>Apenas arquivos .xml de NF-e</div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".xml" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
            {xmlErro && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${C.red}12`, border: `1.5px solid ${C.red}44`, borderRadius: 12, padding: "12px 18px", maxWidth: 560, width: "100%" }}>
                <LuTriangleAlert size={18} color={C.red} />
                <span style={{ fontSize: sz.fontBase, color: C.red, fontWeight: 600 }}>{xmlErro}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Cabeçalho ── */}
        {step === 2 && cab && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontLg, marginBottom: 20 }}>Informações da nota</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {[
                  { label: "Fornecedor",    value: cab.fornecedorNome, icon: LuBuilding2 },
                  { label: "CNPJ",          value: fmtCnpj(cab.fornecedorCnpj), icon: LuHash },
                  { label: "Nº da Nota",    value: cab.numero, icon: LuFileText },
                  { label: "Série",         value: cab.serie || "—", icon: LuHash },
                  { label: "Data Emissão",  value: fmtDt(cab.dataEmissao), icon: LuCalendar },
                  { label: "Valor Total",   value: fmtR(cab.valorTotal), icon: LuPackage },
                ].map(f => (
                  <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{f.label}</div>
                    <div style={{ fontSize: sz.fontBase, fontWeight: 700 }}>{f.value}</div>
                  </div>
                ))}
              </div>
              {cab.chaveAcesso && (
                <div style={{ marginTop: 16, padding: "10px 14px", background: C.surface, borderRadius: 10, fontSize: 12, color: C.muted, wordBreak: "break-all", fontFamily: "monospace" }}>
                  Chave: {cab.chaveAcesso}
                </div>
              )}
            </div>

            {showFornPopup && (
              <div style={{ background: `${"#f59e0b"}12`, border: `1.5px solid ${"#f59e0b"}55`, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <LuTriangleAlert size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: sz.fontBase, marginBottom: 4 }}>
                      Fornecedor não cadastrado
                    </div>
                    <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginBottom: 12 }}>
                      "<strong>{cab.fornecedorNome}</strong>" não foi encontrado no cadastro de fornecedores. Deseja cadastrá-lo automaticamente?
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        disabled={fornSaving}
                        onClick={async () => {
                          await salvarNovoFornecedor(cab.fornecedorNome, cab.fornecedorCnpj);
                          setShowFornPopup(false);
                        }}
                        style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#f59e0b", color: "#fff", cursor: fornSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: sz.fontSm + 1, fontFamily: "inherit", opacity: fornSaving ? 0.6 : 1 }}
                      >
                        {fornSaving ? "Cadastrando..." : `Sim, cadastrar "${cab.fornecedorNome}"`}
                      </button>
                      <button
                        onClick={() => setShowFornPopup(false)}
                        style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "none", color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1, fontFamily: "inherit" }}
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {duplicadaEm && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${C.red}12`, border: `1.5px solid ${C.red}44`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                <LuTriangleAlert size={20} color={C.red} />
                <div>
                  <div style={{ fontWeight: 700, color: C.red }}>Nota já importada</div>
                  <div style={{ fontSize: sz.fontSm + 1, color: C.muted }}>Esta nota foi importada em {duplicadaEm}. Não é possível importar novamente.</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStep(1)} style={{ padding: "12px 24px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "none", color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}>
                ← Voltar
              </button>
              <button
                onClick={avancarStep2}
                disabled={!!duplicadaEm || checkingDup}
                style={{ flex: 1, padding: "12px 24px", borderRadius: 12, border: "none", background: duplicadaEm ? C.faint : C.accent, color: "#fff", cursor: duplicadaEm ? "not-allowed" : "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit" }}
              >
                {checkingDup ? "Verificando..." : "Continuar →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Vínculos ── */}
        {step === 3 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Vincular itens a produtos</div>
                <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginTop: 2 }}>
                  {vinculados.length} de {itensVinc.length} itens vinculados
                  {naoVinculados.length > 0 && <span style={{ color: "#f59e0b", marginLeft: 8 }}>· {naoVinculados.length} sem vínculo serão ignorados</span>}
                </div>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                      {["#", "Descrição XML", "Qtd / Unid", "Preço Unit.", "Produto", "Unid. Estoque", "Fator", "Qtd Convertida"].map((h, i) => (
                        <th key={i} style={{ padding: "10px 10px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itensVinc.map((item, i) => (
                      <VinculaRow key={i} item={item} products={products} onChange={updated => updateItem(i, updated)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => fromManual ? setView("manual") : setStep(2)}
                style={{ padding: "12px 24px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "none", color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}
              >
                ← Voltar
              </button>
              <button
                onClick={() => setStep(4)}
                style={{ flex: 1, padding: "12px 24px", borderRadius: 12, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit" }}
              >
                Ver Preview →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === 4 && cab && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontLg, marginBottom: 4 }}>
                Nota nº {cab.numero} — {cab.fornecedorNome}
              </div>
              <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginBottom: 20 }}>
                Emitida em {fmtDt(cab.dataEmissao)} · {fmtR(cab.valorTotal)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total de itens", value: itensVinc.length, color: C.text },
                  { label: "Vinculados",     value: vinculados.length, color: C.green },
                  { label: "Ignorados",      value: naoVinculados.length, color: naoVinculados.length > 0 ? "#f59e0b" : C.muted },
                ].map(k => (
                  <div key={k.label} style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {vinculados.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Entradas que serão criadas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vinculados.map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: `${C.green}0c`, border: `1px solid ${C.green}22`, borderRadius: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18 }}>{item.produto.emoji || "📦"}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{item.produto.name}</div>
                            <div style={{ fontSize: 11, color: C.muted }}>{item.descricaoXml}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: C.green }}>+{item.qtdEstoque.toFixed(3)}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{item.produto.unidade_estoque}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {naoVinculados.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Itens ignorados</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {naoVinculados.map((item, i) => (
                      <div key={i} style={{ fontSize: 13, color: C.muted, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                        {item.descricaoXml} <span style={{ fontSize: 11 }}>({item.quantidade} {item.unidadeXml})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {saveErro && (
              <div style={{ background: `${C.red}12`, border: `1.5px solid ${C.red}44`, borderRadius: 12, padding: "12px 18px", marginBottom: 16, color: C.red, fontWeight: 600, fontSize: sz.fontBase }}>
                {saveErro}
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStep(3)} disabled={saving} style={{ padding: "14px 24px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "none", color: C.text, cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit", opacity: saving ? 0.5 : 1 }}>
                ← Voltar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={saving}
                style={{ flex: 1, padding: "14px 24px", borderRadius: 12, border: "none", background: saving ? C.faint : C.green, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: sz.fontBase, fontFamily: "inherit", boxShadow: saving ? "none" : `0 4px 16px ${C.green}44`, transition: "background 0.15s" }}
              >
                {saving ? "Salvando..." : "✓ Confirmar Importação"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Sucesso ── */}
        {step === 5 && importOk && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${C.green}18`, border: `2px solid ${C.green}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LuCheck size={32} color={C.green} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontXl, marginBottom: 6 }}>Nota importada com sucesso!</div>
              <div style={{ fontSize: sz.fontBase, color: C.muted }}>
                Nota nº {importOk.numero} · {importOk.fornecedor}
              </div>
              <div style={{ fontSize: sz.fontBase, color: C.green, fontWeight: 700, marginTop: 4 }}>
                {importOk.count} {importOk.count === 1 ? "produto atualizado" : "produtos atualizados"} no estoque
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setView("lista")} style={{ padding: "12px 24px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "none", color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}>
                Ver notas importadas
              </button>
              <button
                onClick={fromManual ? startManual : startWizard}
                style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit" }}
              >
                <LuPlus size={14} style={{ marginRight: 6 }} />
                {fromManual ? "Nova nota manual" : "Importar outra"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Lista ─────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ fontSize: sz.fontSm + 1, color: C.muted }}>
          {loadingList ? "Carregando..." : `${notas.length} ${notas.length === 1 ? "nota importada" : "notas importadas"}`}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={startManual}
            style={{ padding: "10px 18px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "none", color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}
          >
            Nova nota manual
          </button>
          <button
            onClick={startWizard}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit", boxShadow: `0 4px 14px ${C.accent}44` }}
          >
            <LuUpload size={15} /> Importar XML
          </button>
        </div>
      </div>

      {loadingList ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Carregando...</div>
      ) : notas.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 60, color: C.muted }}>
          <LuFileText size={48} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhuma nota importada</div>
          <div style={{ fontSize: sz.fontSm + 1 }}>Clique em "Importar XML" para começar</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                {["Data", "Fornecedor", "Nº Nota", "Série", "Valor Total", "Itens", "Status", ""].map((h, i) => (
                  <th key={i} style={{ padding: "12px 16px", textAlign: i >= 4 ? "center" : "left", fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notas.map(nota => (
                <tr
                  key={nota.id}
                  style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background 0.1s" }}
                  onClick={() => openDetalhe(nota)}
                  onMouseEnter={e => e.currentTarget.style.background = C.surface}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "14px 16px", fontSize: 13, color: C.muted }}>{fmtDt(nota.data_emissao)}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 700, fontSize: 14, maxWidth: 200 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nota.fornecedor_nome}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{fmtCnpj(nota.fornecedor_cnpj)}</div>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600 }}>{nota.numero}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: C.muted }}>{nota.serie || "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, textAlign: "center" }}>{fmtR(nota.valor_total)}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, textAlign: "center", color: C.muted }}>
                    {nota.notas_fiscais_itens?.length ?? 0}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: `${C.green}18`, color: C.green, border: `1px solid ${C.green}44` }}>
                      {nota.status || "importada"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <LuChevronRight size={16} color={C.muted} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
