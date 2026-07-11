import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { parseNFe } from "@/utils/parseNFe";
import "./NotasFiscaisTab.css";
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
    <div className="nf-tab__stepper">
      {steps.map((label, i) => {
        const n = i + 1;
        const done   = n < step;
        const active = n === step;
        const color  = done ? varColor(C.green) : active ? varColor(C.accent) : varColor(C.border);
        return (
          <div key={n} className="nf-tab__stepper-item" style={{ flex: i < steps.length - 1 ? 1 : 0 }}>
            <div className="nf-tab__stepper-col">
              <div className="nf-tab__stepper-bola" style={{
                background: done ? varColor(C.green) : active ? varColor(C.accent) : varColor(C.surface),
                border: `2px solid ${color}`,
                color: done || active ? "#fff" : varColor(C.muted),
              }}>
                {done ? <LuCheck size={14} /> : n}
              </div>
              <div className="nf-tab__stepper-label" style={{ fontWeight: active ? 700 : 500, color: active ? varColor(C.text) : varColor(C.muted) }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="nf-tab__stepper-linha" style={{ background: done ? varColor(C.green) : varColor(C.border) }} />
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
      className="nf-tab__tr"
      style={{ background: !linked ? alfa("#f59e0b", "0a") : "transparent" }}
      onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
      onMouseLeave={e => e.currentTarget.style.background = !linked ? alfa("#f59e0b", "0a") : "transparent"}
    >
      {/* # */}
      <td className="nf-tab__td" style={{ fontSize: 12, color: varColor(C.muted), fontWeight: 600, whiteSpace: "nowrap" }}>{item.numero}</td>

      {/* Descrição */}
      <td className="nf-tab__td" style={{ maxWidth: 180 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descricaoXml}</div>
        <div style={{ fontSize: 11, color: varColor(C.muted) }}>{item.codigoXml}</div>
      </td>

      {/* Qtd + Unid XML */}
      <td className="nf-tab__td" style={{ fontSize: 13, textAlign: "center", whiteSpace: "nowrap" }}>
        {item.quantidade} <span style={{ color: varColor(C.muted), fontSize: 11 }}>{item.unidadeXml}</span>
      </td>

      {/* Preço unit */}
      <td className="nf-tab__td" style={{ fontSize: 12, textAlign: "right", color: varColor(C.muted), whiteSpace: "nowrap" }}>
        {fmtR(item.precoUnitario)}
      </td>

      {/* Produto vinculado */}
      <td className="nf-tab__td" style={{ minWidth: 180 }}>
        <div ref={ref} style={{ position: "relative" }}>
          {linked ? (
            <div className="nf-tab__vinculado-chip" style={{ background: alfa(C.green, "12"), border: `1.5px solid ${alfa(C.green, "44")}` }}>
              <span style={{ fontSize: 16 }}>{item.produto.emoji || "📦"}</span>
              <span className="nf-tab__vinculado-nome" style={{ color: varColor(C.green) }}>
                {item.produto.name}
              </span>
              <button onClick={clearProduto} style={{ background: "none", border: "none", cursor: "pointer", color: varColor(C.muted), padding: 0, lineHeight: 1, display: "flex" }}>
                <LuX size={12} />
              </button>
            </div>
          ) : (
            <>
              <div style={{ position: "relative" }}>
                <LuSearch size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: varColor(C.muted), pointerEvents: "none" }} />
                <input
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setAberto(true); }}
                  onFocus={() => setAberto(true)}
                  placeholder="Buscar produto..."
                  style={{
                    width: "100%", padding: "7px 8px 7px 26px", borderRadius: 8,
                    border: `1.5px solid var(${C.border})`, background: varColor(C.surface),
                    color: varColor(C.text), fontSize: 13, fontFamily: "inherit",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {aberto && filtrados.length > 0 && (
                <div className="nf-tab__dropdown" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
                  {filtrados.map(p => (
                    <button
                      key={p.id}
                      onMouseDown={() => selectProduto(p)}
                      className="nf-tab__dropdown-item"
                      style={{ padding: "8px 12px" }}
                      onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span style={{ fontSize: 15 }}>{p.emoji || "📦"}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: varColor(C.muted) }}>{p.unidade_estoque}</div>
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
      <td className="nf-tab__td" style={{ fontSize: 12, textAlign: "center", color: varColor(C.muted) }}>
        {item.produto?.unidade_estoque || "—"}
      </td>

      {/* Fator */}
      <td className="nf-tab__td" style={{ textAlign: "center" }}>
        {item.produto ? (
          item.fatorAuto ? (
            <span style={{ fontSize: 12, color: varColor(C.muted), fontStyle: "italic" }}>1 (auto)</span>
          ) : (
            <input
              type="number"
              min="0"
              step="any"
              value={item.fator}
              onChange={e => setFator(e.target.value)}
              style={{
                width: 64, padding: "5px 6px", borderRadius: 7,
                border: `1.5px solid var(${C.border})`, background: varColor(C.surface),
                color: varColor(C.text), fontSize: 13, fontFamily: "inherit",
                outline: "none", textAlign: "center",
              }}
            />
          )
        ) : "—"}
      </td>

      {/* Qtd convertida */}
      <td className="nf-tab__td" style={{ fontSize: 14, fontWeight: 800, textAlign: "center", color: linked ? varColor(C.green) : varColor(C.muted) }}>
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
      border: `1.5px solid var(${C.border})`, background: varColor(C.surface),
      color: varColor(C.text), fontSize: sz.fontBase, fontFamily: "inherit",
      outline: "none", boxSizing: "border-box",
    };
    const label = (text) => (
      <div style={{ fontSize: 12, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{text}</div>
    );

    return (
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => setView("lista")}
            className="nf-tab__voltar-btn"
            style={{ fontSize: sz.fontSm + 1 }}
          >
            <LuArrowLeft size={14} /> Cancelar
          </button>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Nova nota manual</div>
        </div>

        {/* Cabeçalho da nota */}
        <div className="nf-tab__card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1, marginBottom: 20 }}>Dados do fornecedor e nota</div>

          {/* Seletor de fornecedor */}
          <div style={{ marginBottom: 16 }}>
            {label("Fornecedor *")}
            {fornecedorSelecionado ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: alfa(C.green, "10"), border: `1.5px solid ${alfa(C.green, "44")}`, borderRadius: 10, padding: "10px 14px" }}>
                <LuTruck size={16} color={varColor(C.green)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: varColor(C.green) }}>{fornecedorSelecionado.nome}</div>
                  {fornecedorSelecionado.cnpj && <div style={{ fontSize: 12, color: varColor(C.muted) }}>{fmtCnpj(fornecedorSelecionado.cnpj)}</div>}
                </div>
                <button
                  onClick={() => { setManualFornId(""); setManualFornBusca(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: varColor(C.muted), padding: 4, display: "flex" }}
                >
                  <LuX size={14} />
                </button>
              </div>
            ) : (
              <div ref={fornDDRef} style={{ position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <LuSearch size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: varColor(C.muted), pointerEvents: "none" }} />
                  <input
                    style={{ ...inpStyle, paddingLeft: 32 }}
                    placeholder="Buscar fornecedor cadastrado..."
                    value={manualFornBusca}
                    onChange={e => { setManualFornBusca(e.target.value); setShowFornDD(true); }}
                    onFocus={() => setShowFornDD(true)}
                  />
                </div>
                {showFornDD && (
                  <div className="nf-tab__dropdown" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                    {fornecedores
                      .filter(f => !manualFornBusca || f.nome.toLowerCase().includes(manualFornBusca.toLowerCase()))
                      .slice(0, 8)
                      .map(f => (
                        <button
                          key={f.id}
                          onMouseDown={() => { setManualFornId(f.id); setManualFornBusca(""); setShowFornDD(false); }}
                          className="nf-tab__dropdown-item"
                          onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                          <LuTruck size={14} color={varColor(C.muted)} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{f.nome}</div>
                            {f.cnpj && <div style={{ fontSize: 11, color: varColor(C.muted) }}>{fmtCnpj(f.cnpj)}</div>}
                          </div>
                        </button>
                      ))
                    }
                    <button
                      onMouseDown={() => { setShowFornDD(false); setShowNovoForn(true); setNovoFornForm({ nome: manualFornBusca, cnpj: "" }); setNovoFornErro(""); }}
                      style={{ width: "100%", padding: "10px 14px", border: "none", borderTop: `1px solid var(${C.border})`, background: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", color: varColor(C.accent), fontWeight: 600, fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.background = alfa(C.accent, "08")}
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
            <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 440 }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontLg, marginBottom: 6 }}>Cadastrar fornecedor</div>
              <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted), marginBottom: 20 }}>O fornecedor será salvo no cadastro e vinculado à nota.</div>
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
              {novoFornErro && <div style={{ color: varColor(C.red), fontSize: sz.fontSm + 1, marginBottom: 12, fontWeight: 600 }}>{novoFornErro}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowNovoForn(false); setNovoFornErro(""); }}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid var(${C.border})`, background: "none", color: varColor(C.text), cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}
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
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: varColor(C.accent), color: "#fff", cursor: fornSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit", opacity: fornSaving ? 0.6 : 1 }}
                >
                  {fornSaving ? "Salvando..." : "Cadastrar"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Itens */}
        <div className="nf-tab__card" style={{ overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid var(${C.border})`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1 }}>Itens da nota</div>
            <button
              onClick={addItem}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: varColor(C.accent), color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1, fontFamily: "inherit" }}
            >
              <LuPlus size={13} /> Adicionar item
            </button>
          </div>
          <div className="nf-tab__tabela-scroll">
            <table className="nf-tab__tabela" style={{ minWidth: 680 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid var(${C.border})`, background: varColor(C.surface) }}>
                  {["#", "Descrição *", "Qtd *", "Unidade", "Preço Unit. (R$)", ""].map((h, i) => (
                    <th key={i} className="nf-tab__th" style={{ textAlign: i >= 2 ? "center" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manualItens.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid var(${C.border})` }}>
                    <td style={{ padding: "8px 12px", fontSize: 13, color: varColor(C.muted), fontWeight: 600 }}>{idx + 1}</td>
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
                          style={{ background: "none", border: "none", cursor: "pointer", color: varColor(C.muted), padding: 4, display: "flex", alignItems: "center" }}
                          onMouseEnter={e => e.currentTarget.style.color = varColor(C.red)}
                          onMouseLeave={e => e.currentTarget.style.color = varColor(C.muted)}
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
          <div className="nf-tab__erro-box" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}`, fontSize: sz.fontBase }}>
            <LuTriangleAlert size={16} /> {manualErro}
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setView("lista")}
            className="nf-tab__btn-secundario"
            style={{ fontSize: sz.fontBase }}
          >
            Cancelar
          </button>
          <button
            onClick={confirmarManual}
            className="nf-tab__btn-primario"
            style={{ flex: 1, background: varColor(C.accent), fontSize: sz.fontBase, boxShadow: `0 4px 14px ${alfa(C.accent, "44")}` }}
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
          className="nf-tab__voltar-btn"
          style={{ fontSize: sz.fontSm + 1, marginBottom: 20 }}
        >
          <LuArrowLeft size={14} /> Voltar
        </button>

        <div className="nf-tab__card" style={{ padding: 24, marginBottom: 20 }}>
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
                <div className="nf-tab__label" style={{ marginBottom: 4 }}>{f.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="nf-tab__tabela-moldura">
          <div className="nf-tab__tabela-scroll">
          <table className="nf-tab__tabela" style={{ minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid var(${C.border})`, background: varColor(C.surface) }}>
                {["#", "Descrição XML", "Cód.", "Qtd", "Unid.", "Preço Unit.", "Produto", "Qtd Estoque"].map((h, i) => (
                  <th key={i} className="nf-tab__th" style={{ textAlign: i >= 3 ? "center" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notaItens.map((it, i) => (
                <tr key={it.id} className="nf-tab__tr"
                  onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td className="nf-tab__td" style={{ fontSize: 12, color: varColor(C.muted) }}>{i + 1}</td>
                  <td className="nf-tab__td" style={{ fontSize: 13, fontWeight: 600, maxWidth: 200 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao_xml}</div>
                  </td>
                  <td className="nf-tab__td" style={{ fontSize: 12, color: varColor(C.muted) }}>{it.codigo_xml}</td>
                  <td className="nf-tab__td" style={{ fontSize: 13, textAlign: "center" }}>{it.quantidade}</td>
                  <td className="nf-tab__td" style={{ fontSize: 12, textAlign: "center", color: varColor(C.muted) }}>{it.unidade_xml}</td>
                  <td className="nf-tab__td" style={{ fontSize: 12, textAlign: "center", color: varColor(C.muted) }}>{fmtR(it.preco_unitario)}</td>
                  <td className="nf-tab__td" style={{ fontSize: 13 }}>
                    {it.products ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{it.products.emoji || "📦"}</span>
                        <span style={{ fontWeight: 600, color: varColor(C.green) }}>{it.products.name}</span>
                      </span>
                    ) : (
                      <span style={{ color: varColor(C.muted), fontSize: 12, fontStyle: "italic" }}>Não vinculado</span>
                    )}
                  </td>
                  <td className="nf-tab__td" style={{ fontSize: 13, fontWeight: 700, textAlign: "center", color: it.quantidade_estoque ? varColor(C.green) : varColor(C.muted) }}>
                    {it.quantidade_estoque != null ? `${Number(it.quantidade_estoque).toFixed(3)} ${it.products?.unidade_estoque || ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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
            className="nf-tab__voltar-btn"
            style={{ fontSize: sz.fontSm + 1 }}
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
              className="nf-tab__dropzone"
              style={{
                borderColor: dragOver ? varColor(C.accent) : xmlErro ? varColor(C.red) : varColor(C.border),
                background: dragOver ? alfa(C.accent, "08") : xmlErro ? alfa(C.red, "08") : varColor(C.card),
              }}
            >
              <div className="nf-tab__dropzone-icone" style={{ background: dragOver ? alfa(C.accent, "18") : varColor(C.surface) }}>
                <LuUpload size={28} color={dragOver ? varColor(C.accent) : varColor(C.muted)} />
              </div>
              <div>
                <div className="nf-tab__dropzone-titulo" style={{ fontSize: sz.fontLg - 1 }}>
                  {dragOver ? "Solte o arquivo aqui" : "Arraste o XML ou clique para selecionar"}
                </div>
                <div className="nf-tab__dropzone-ajuda" style={{ fontSize: sz.fontSm + 1 }}>Apenas arquivos .xml de NF-e</div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".xml" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
            {xmlErro && (
              <div className="nf-tab__erro-box" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}`, maxWidth: 560, width: "100%" }}>
                <LuTriangleAlert size={18} color={varColor(C.red)} />
                <span style={{ fontSize: sz.fontBase, color: varColor(C.red), fontWeight: 600 }}>{xmlErro}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Cabeçalho ── */}
        {step === 2 && cab && (
          <div style={{ maxWidth: 640 }}>
            <div className="nf-tab__card" style={{ padding: 28, marginBottom: 20 }}>
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
                    <div className="nf-tab__label">{f.label}</div>
                    <div style={{ fontSize: sz.fontBase, fontWeight: 700 }}>{f.value}</div>
                  </div>
                ))}
              </div>
              {cab.chaveAcesso && (
                <div style={{ marginTop: 16, padding: "10px 14px", background: varColor(C.surface), borderRadius: 10, fontSize: 12, color: varColor(C.muted), wordBreak: "break-all", fontFamily: "monospace" }}>
                  Chave: {cab.chaveAcesso}
                </div>
              )}
            </div>

            {showFornPopup && (
              <div className="nf-tab__aviso" style={{ background: alfa("#f59e0b", "12"), border: `1.5px solid ${alfa("#f59e0b", "55")}` }}>
                <div className="nf-tab__aviso-linha">
                  <LuTriangleAlert size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div className="nf-tab__aviso-titulo" style={{ fontSize: sz.fontBase }}>
                      Fornecedor não cadastrado
                    </div>
                    <div className="nf-tab__aviso-desc" style={{ fontSize: sz.fontSm + 1 }}>
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
                        style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid var(${C.border})`, background: "none", color: varColor(C.text), cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1, fontFamily: "inherit" }}
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {duplicadaEm && (
              <div className="nf-tab__aviso" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                <LuTriangleAlert size={20} color={varColor(C.red)} />
                <div>
                  <div style={{ fontWeight: 700, color: varColor(C.red) }}>Nota já importada</div>
                  <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted) }}>Esta nota foi importada em {duplicadaEm}. Não é possível importar novamente.</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStep(1)} className="nf-tab__btn-secundario" style={{ fontSize: sz.fontBase }}>
                ← Voltar
              </button>
              <button
                onClick={avancarStep2}
                disabled={!!duplicadaEm || checkingDup}
                className="nf-tab__btn-primario"
                style={{ flex: 1, background: duplicadaEm ? varColor(C.faint) : varColor(C.accent), cursor: duplicadaEm ? "not-allowed" : "pointer", fontSize: sz.fontBase }}
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
                <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted), marginTop: 2 }}>
                  {vinculados.length} de {itensVinc.length} itens vinculados
                  {naoVinculados.length > 0 && <span style={{ color: "#f59e0b", marginLeft: 8 }}>· {naoVinculados.length} sem vínculo serão ignorados</span>}
                </div>
              </div>
            </div>

            <div className="nf-tab__card" style={{ overflow: "hidden", marginBottom: 20 }}>
              <div className="nf-tab__tabela-scroll">
                <table className="nf-tab__tabela" style={{ minWidth: 760 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid var(${C.border})`, background: varColor(C.surface) }}>
                      {["#", "Descrição XML", "Qtd / Unid", "Preço Unit.", "Produto", "Unid. Estoque", "Fator", "Qtd Convertida"].map((h, i) => (
                        <th key={i} className="nf-tab__th" style={{ textAlign: i >= 2 ? "center" : "left" }}>{h}</th>
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
                className="nf-tab__btn-secundario"
                style={{ fontSize: sz.fontBase }}
              >
                ← Voltar
              </button>
              <button
                onClick={() => setStep(4)}
                className="nf-tab__btn-primario"
                style={{ flex: 1, background: varColor(C.accent), fontSize: sz.fontBase }}
              >
                Ver Preview →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === 4 && cab && (
          <div style={{ maxWidth: 640 }}>
            <div className="nf-tab__card" style={{ padding: 24, marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontLg, marginBottom: 4 }}>
                Nota nº {cab.numero} — {cab.fornecedorNome}
              </div>
              <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted), marginBottom: 20 }}>
                Emitida em {fmtDt(cab.dataEmissao)} · {fmtR(cab.valorTotal)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total de itens", value: itensVinc.length, color: varColor(C.text) },
                  { label: "Vinculados",     value: vinculados.length, color: varColor(C.green) },
                  { label: "Ignorados",      value: naoVinculados.length, color: naoVinculados.length > 0 ? "#f59e0b" : varColor(C.muted) },
                ].map(k => (
                  <div key={k.label} className="nf-tab__kpi-card">
                    <div className="nf-tab__kpi-valor" style={{ color: k.color }}>{k.value}</div>
                    <div className="nf-tab__kpi-label">{k.label}</div>
                  </div>
                ))}
              </div>

              {vinculados.length > 0 && (
                <div>
                  <div className="nf-tab__label" style={{ marginBottom: 10 }}>Entradas que serão criadas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vinculados.map((item, i) => (
                      <div key={i} className="nf-tab__entrada-linha" style={{ background: alfa(C.green, "0c"), border: `1px solid ${alfa(C.green, "22")}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18 }}>{item.produto.emoji || "📦"}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{item.produto.name}</div>
                            <div style={{ fontSize: 11, color: varColor(C.muted) }}>{item.descricaoXml}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: varColor(C.green) }}>+{item.qtdEstoque.toFixed(3)}</div>
                          <div style={{ fontSize: 11, color: varColor(C.muted) }}>{item.produto.unidade_estoque}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {naoVinculados.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="nf-tab__label" style={{ marginBottom: 8 }}>Itens ignorados</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {naoVinculados.map((item, i) => (
                      <div key={i} style={{ fontSize: 13, color: varColor(C.muted), padding: "6px 0", borderBottom: `1px solid var(${C.border})` }}>
                        {item.descricaoXml} <span style={{ fontSize: 11 }}>({item.quantidade} {item.unidadeXml})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {saveErro && (
              <div className="nf-tab__erro-box" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}`, fontSize: sz.fontBase }}>
                {saveErro}
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStep(3)} disabled={saving} className="nf-tab__btn-secundario" style={{ fontSize: sz.fontBase, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
                ← Voltar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={saving}
                className="nf-tab__btn-primario"
                style={{ flex: 1, background: saving ? varColor(C.faint) : varColor(C.green), cursor: saving ? "not-allowed" : "pointer", fontSize: sz.fontBase, boxShadow: saving ? "none" : `0 4px 16px ${alfa(C.green, "44")}`, transition: "background 0.15s" }}
              >
                {saving ? "Salvando..." : "✓ Confirmar Importação"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Sucesso ── */}
        {step === 5 && importOk && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 20 }}>
            <div className="nf-tab__sucesso-icone" style={{ background: alfa(C.green, "18"), borderColor: alfa(C.green, "44") }}>
              <LuCheck size={32} color={varColor(C.green)} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontXl, marginBottom: 6 }}>Nota importada com sucesso!</div>
              <div style={{ fontSize: sz.fontBase, color: varColor(C.muted) }}>
                Nota nº {importOk.numero} · {importOk.fornecedor}
              </div>
              <div style={{ fontSize: sz.fontBase, color: varColor(C.green), fontWeight: 700, marginTop: 4 }}>
                {importOk.count} {importOk.count === 1 ? "produto atualizado" : "produtos atualizados"} no estoque
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setView("lista")} className="nf-tab__btn-secundario" style={{ fontSize: sz.fontBase }}>
                Ver notas importadas
              </button>
              <button
                onClick={fromManual ? startManual : startWizard}
                className="nf-tab__btn-primario"
                style={{ background: varColor(C.accent), fontSize: sz.fontBase }}
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
      <div className="nf-tab__lista-header">
        <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted) }}>
          {loadingList ? "Carregando..." : `${notas.length} ${notas.length === 1 ? "nota importada" : "notas importadas"}`}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={startManual}
            className="nf-tab__btn-secundario"
            style={{ padding: "10px 18px", borderRadius: 10, fontSize: sz.fontBase }}
          >
            Nova nota manual
          </button>
          <button
            onClick={startWizard}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "none", background: varColor(C.accent), color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit", boxShadow: `0 4px 14px ${alfa(C.accent, "44")}` }}
          >
            <LuUpload size={15} /> Importar XML
          </button>
        </div>
      </div>

      {loadingList ? (
        <div style={{ textAlign: "center", padding: 60, color: varColor(C.muted) }}>Carregando...</div>
      ) : notas.length === 0 ? (
        <div className="nf-tab__vazio">
          <LuFileText size={48} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhuma nota importada</div>
          <div style={{ fontSize: sz.fontSm + 1 }}>Clique em "Importar XML" para começar</div>
        </div>
      ) : (
        <div className="nf-tab__tabela-moldura">
          <div className="nf-tab__tabela-scroll">
          <table className="nf-tab__tabela" style={{ minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid var(${C.border})`, background: varColor(C.surface) }}>
                {["Data", "Fornecedor", "Nº Nota", "Série", "Valor Total", "Itens", "Status", ""].map((h, i) => (
                  <th key={i} className="nf-tab__th" style={{ textAlign: i >= 4 ? "center" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notas.map(nota => (
                <tr
                  key={nota.id}
                  className="nf-tab__tr"
                  style={{ cursor: "pointer" }}
                  onClick={() => openDetalhe(nota)}
                  onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td className="nf-tab__td" style={{ fontSize: 13, color: varColor(C.muted) }}>{fmtDt(nota.data_emissao)}</td>
                  <td className="nf-tab__td" style={{ fontWeight: 700, fontSize: 14, maxWidth: 200 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nota.fornecedor_nome}</div>
                    <div style={{ fontSize: 11, color: varColor(C.muted) }}>{fmtCnpj(nota.fornecedor_cnpj)}</div>
                  </td>
                  <td className="nf-tab__td" style={{ fontSize: 13, fontWeight: 600 }}>{nota.numero}</td>
                  <td className="nf-tab__td" style={{ fontSize: 13, color: varColor(C.muted) }}>{nota.serie || "—"}</td>
                  <td className="nf-tab__td" style={{ fontSize: 14, fontWeight: 700, textAlign: "center" }}>{fmtR(nota.valor_total)}</td>
                  <td className="nf-tab__td" style={{ fontSize: 13, textAlign: "center", color: varColor(C.muted) }}>
                    {nota.notas_fiscais_itens?.length ?? 0}
                  </td>
                  <td className="nf-tab__td" style={{ textAlign: "center" }}>
                    <span className="nf-tab__badge-status" style={{ background: alfa(C.green, "18"), color: varColor(C.green), border: `1px solid ${alfa(C.green, "44")}` }}>
                      {nota.status || "importada"}
                    </span>
                  </td>
                  <td className="nf-tab__td" style={{ textAlign: "center" }}>
                    <LuChevronRight size={16} color={varColor(C.muted)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
