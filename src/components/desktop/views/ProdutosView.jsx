import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { logAction } from "@/lib/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { labelEstoque, getUnidadesCompra, fmtQtd } from "@/utils/conversaoUnidades";
import { LuTriangleAlert, LuTag, LuPencil, LuTrash2, LuCheck, LuX as LuXIcon, LuRuler } from "react-icons/lu";
import { FEATURE_BARCODE_SCANNER } from "@/constants/features";
import SubprodutosView from "./SubprodutosView";
import CombosView from "./CombosView";
import "./ProdutosView.css";

const EMPTY_COMPRA = { nome: "", unidade: "", fator: "" };

const EMPTY_FORM = {
  name: "", price: "", category: "", emoji: "",
  unidade_estoque: "",
  compras: [],
  unidade_consumo: "",
  fator_consumo: "",       // crítico 7 — quantas unidades de ESTOQUE 1 unidade de consumo gasta; vazio = 1
  codigo_barras: "",
  validade_dias: "",       // C1 — shelf life típico (dias); vazio = sem controle
  proxima_validade: "",    // C1 — próxima data a acompanhar (YYYY-MM-DD)
};

const CATS_VISIVEIS = 6; // quantas categorias mostrar antes do "Mais"

function CategoriasComBusca({ categorias, catFiltro, setCatFiltro, busca, setBusca, sz }) {
  const todas = ["Todos", ...categorias];
  const visiveis = todas.slice(0, CATS_VISIVEIS);
  const extras   = todas.slice(CATS_VISIVEIS);
  const [aberto, setAberto] = useState(false);
  const dropRef = useRef(null);

  // fecha dropdown ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  const btnCat = (cat, small = false) => {
    const ativo = catFiltro === cat;
    return (
      <button
        key={cat}
        onClick={() => { setCatFiltro(cat); setAberto(false); }}
        className="categorias-busca__cat"
        style={{
          padding: small ? "6px 14px" : "7px 18px",
          background: ativo ? varColor(C.accent) : varColor(C.surface),
          color: ativo ? "#fff" : varColor(C.muted),
          width: small ? "100%" : undefined,
        }}
      >
        {cat}
      </button>
    );
  };

  return (
    <div className="categorias-busca" style={{ padding: `12px ${sz.pad}px` }}>
      {/* Categorias visíveis */}
      <div className="categorias-busca__lista">
        {visiveis.map(cat => btnCat(cat))}

        {/* Botão "Mais categorias" */}
        {extras.length > 0 && (
          <div ref={dropRef} className="categorias-busca__mais-wrap">
            <button
              onClick={() => setAberto(v => !v)}
              className="categorias-busca__cat"
              style={{
                padding: "7px 18px",
                background: (aberto || extras.includes(catFiltro)) ? varColor(C.accent) : varColor(C.surface),
                color: (aberto || extras.includes(catFiltro)) ? "#fff" : varColor(C.muted),
              }}
            >
              {extras.includes(catFiltro) ? catFiltro : `+ ${extras.length} mais`} ▾
            </button>

            {aberto && (
              <div className="categorias-busca__mais-dropdown">
                {extras.map(cat => btnCat(cat, true))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campo de busca */}
      <input
        value={busca}
        onChange={e => setBusca(e.target.value)}
        placeholder="Buscar produto..."
        className="categorias-busca__input"
        style={{ padding: "9px 16px" }}
      />
    </div>
  );
}

export default function ProdutosView() {
  const { products, addProduct, updateProduct, removeProduct, currentUser } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [editId,    setEditId]    = useState(null);
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState("");
  const [deleteId,  setDeleteId]  = useState(null);
  const [deletando, setDeletando] = useState(false);
  const [catFiltro,    setCatFiltro]    = useState("Todos");
  const [busca,     setBusca]     = useState("");
  const [unidadesMedida, setUnidadesMedida] = useState([]);
  const [editingCompra, setEditingCompra] = useState(null);
  const [isInsumo, setIsInsumo] = useState(false);
  const [isProducao, setIsProducao] = useState(false);


  // ── Categorias ────────────────────────────────────────────────
  const [showCatModal,    setShowCatModal]    = useState(false);
  const [catExtra,        setCatExtra]        = useState([]);
  const [catEditando,     setCatEditando]     = useState(null);
  const [catNova,         setCatNova]         = useState("");
  const [catOpLoading,    setCatOpLoading]    = useState(false);
  const [catConfirmDelete, setCatConfirmDelete] = useState(null); // nome da categoria a excluir

  useEffect(() => {
    supabase.from("config").select("value").eq("key", "categorias_extra").single()
      .then(({ data }) => { if (data?.value && Array.isArray(data.value)) setCatExtra(data.value); });
    supabase.from("unidades_medida").select("*").order("ordem")
      .then(({ data }) => { if (data) setUnidadesMedida(data); });
  }, []);

  const salvarCatExtra = async (lista) => {
    setCatExtra(lista);
    await supabase.from("config").upsert({ key: "categorias_extra", value: lista });
  };

  const criarCategoria = async () => {
    const nome = catNova.trim();
    if (!nome || catOpLoading || categorias.includes(nome)) return;
    setCatOpLoading(true);
    await salvarCatExtra([...catExtra, nome]);
    setCatNova("");
    setCatOpLoading(false);
  };

  const renomearCategoria = async () => {
    if (!catEditando || catOpLoading) return;
    const novoNome   = catEditando.input.trim();
    const nomeAntigo = catEditando.name;
    if (!novoNome || novoNome === nomeAntigo) { setCatEditando(null); return; }
    setCatOpLoading(true);
    await salvarCatExtra(catExtra.map(c => c === nomeAntigo ? novoNome : c));
    await Promise.all(products.filter(p => p.category === nomeAntigo).map(p => updateProduct(p.id, { category: novoNome })));
    if (catFiltro === nomeAntigo) setCatFiltro(novoNome);
    setCatEditando(null);
    setCatOpLoading(false);
  };

  const excluirCategoria = async (nome) => {
    if (catOpLoading) return;
    setCatOpLoading(true);
    await salvarCatExtra(catExtra.filter(c => c !== nome));
    setCatOpLoading(false);
  };

  const CATS_FIXAS = ["Insumo", "Produção"];

  const categorias = useMemo(() => {
    const fromProducts = products.map(p => p.category).filter(Boolean);
    return [...new Set([...CATS_FIXAS, ...catExtra, ...fromProducts])].sort();
  }, [products, catExtra]);

  const produtosFiltrados = useMemo(() => {
    return products
      .filter(p => catFiltro === "Todos" || p.category === catFiltro)
      .filter(p => !busca || p.name.toLowerCase().includes(busca.toLowerCase()));
  }, [products, catFiltro, busca]);

  // ── Modal ─────────────────────────────────────────────────────

  const abrirNovo = (insumo = false, producao = false) => {
    setIsInsumo(insumo);
    setIsProducao(producao);
    setForm({ ...EMPTY_FORM, category: insumo ? "Insumo" : producao ? "Produção" : "" });
    setErro("");
    setEditId(null);
    setModal("novo");
  };

  const abrirEditar = (p) => {
    const insumo   = p.category === "Insumo";
    const producao = p.category === "Produção";
    setIsInsumo(insumo);
    setIsProducao(producao);
    let compras = [];
    if (Array.isArray(p.unidades_compra) && p.unidades_compra.length > 0) {
      compras = p.unidades_compra.map(u => ({
        nome:    u.nome ?? "",
        unidade: u.unidade ?? "",
        fator:   u.fator != null ? String(u.fator) : "",
      }));
    }

    setForm({
      name:            p.name,
      price:           String(p.price ?? "0"),
      category:        p.category ?? "",
      emoji:           p.emoji ?? "",
      unidade_estoque: p.unidade_estoque ?? p.unidade ?? "",
      compras,
      unidade_consumo: p.unidade_consumo ?? "",
      fator_consumo:   p.fator_consumo_estoque != null && Number(p.fator_consumo_estoque) !== 1 ? String(p.fator_consumo_estoque) : "",
      codigo_barras:   p.codigo_barras ?? "",
      validade_dias:    p.validade_dias != null ? String(p.validade_dias) : "",
      proxima_validade: p.proxima_validade ?? "",
    });
    setErro("");
    setEditId(p.id);
    setModal("editar");
  };

  const fecharModal = () => {
    setModal(null);
    setShowEmojiPicker(false);
    setEditingCompra(null);
    setErro("");
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addCompra = () => setForm(f => {
    const n = f.compras.length + 1;
    const nome = f.compras.filter(c => c.nome.startsWith("Fornecedor")).length > 0
      ? `Fornecedor ${n}` : "Fornecedor";
    return { ...f, compras: [...f.compras, { ...EMPTY_COMPRA, nome }] };
  });

  const setCompra = (idx, k, v) => setForm(f => ({
    ...f,
    compras: f.compras.map((c, i) => i === idx ? { ...c, [k]: v } : c),
  }));

  const removeCompra = (idx) => setForm(f => ({
    ...f,
    compras: f.compras.filter((_, i) => i !== idx),
  }));

  // ── Validação ─────────────────────────────────────────────────
  const validar = () => {
    if (!form.name.trim())            return "Informe o nome.";
    if (!isInsumo) {
      if (!form.price)                return "Informe o preço.";
      const p = parseFloat(String(form.price).replace(",", "."));
      if (isNaN(p) || p <= 0)        return "Preço deve ser maior que zero.";
    }
    if (!form.category.trim())        return "Informe a categoria.";
    if (!form.unidade_estoque.trim()) return "Selecione a unidade de estoque.";
    for (const c of form.compras) {
      if (c.unidade && !c.fator) return `Informe o fator de conversão do fornecedor "${c.nome || "sem nome"}".`;
    }
    if (form.fator_consumo !== "") {
      const f = parseFloat(String(form.fator_consumo).replace(",", "."));
      if (isNaN(f) || f <= 0) return "O fator de consumo deve ser um número maior que zero.";
    }
    return null;
  };

  const salvar = async () => {
    const err = validar();
    if (err) { setErro(err); return; }
    setSalvando(true);
    const ue = form.unidade_estoque.trim() || "un";
    const payload = {
      // O nome vai pro banco como o usuário digitou (só sem espaço sobrando).
      // Antes era forçado em CAIXA ALTA aqui, o que gritava no PDV, na comanda
      // impressa e na nota — e contradizia o importador de cardápio, que já
      // normaliza para Título (limparCategoria em lib/importacao/pdfCardapio.js).
      name:                  form.name.trim(),
      price:                 isInsumo ? 0 : parseFloat(String(form.price).replace(",", ".")),
      category:              isInsumo ? "Insumo" : isProducao ? "Produção" : form.category.trim(),
      emoji:                 form.emoji || null,
      unidade_estoque:       ue,
      unidade_consumo:       form.unidade_consumo.trim() || null,
      // crítico 7 — fator real informado no cadastro; sem unidade de
      // consumo (ou campo vazio) a conversão é 1:1.
      fator_consumo_estoque: (() => {
        if (!form.unidade_consumo.trim() || form.fator_consumo === "") return 1;
        const f = parseFloat(String(form.fator_consumo).replace(",", "."));
        return !isNaN(f) && f > 0 ? f : 1;
      })(),
      unidades_compra:       form.compras
        .filter(c => c.unidade && c.fator)
        .map(c => ({ nome: c.nome.trim() || null, unidade: c.unidade, fator: parseFloat(c.fator), unidade_destino: ue })),
      ...(FEATURE_BARCODE_SCANNER ? { codigo_barras: form.codigo_barras.trim() || null } : {}),
      // C1 — validade (ambos nullable). validade_dias: shelf life; proxima_validade: data a acompanhar
      validade_dias:    form.validade_dias !== "" && !isNaN(Number(form.validade_dias)) ? Math.max(0, parseInt(form.validade_dias, 10)) : null,
      proxima_validade: form.proxima_validade || null,
    };
    let dbError = null;
    if (modal === "novo") {
      const { error } = await addProduct({ id: crypto.randomUUID(), ...payload });
      dbError = error;
      const tipo = isInsumo ? "Insumo" : isProducao ? "Item de Produção" : "Produto";
      if (!error) logAction(currentUser?.username, isInsumo ? "insumo:criar" : isProducao ? "producao:criar" : "produto:criar", { msg: `${tipo} cadastrado: ${payload.name}`, name: currentUser?.name, role: currentUser?.role });
    } else {
      const tipo = isInsumo ? "Insumo" : isProducao ? "Item de Produção" : "Produto";
      const { error } = await updateProduct(editId, payload);
      dbError = error;
      if (!error) logAction(currentUser?.username, isInsumo ? "insumo:editar" : isProducao ? "producao:editar" : "produto:editar", { msg: `${tipo} editado: ${payload.name}`, name: currentUser?.name, role: currentUser?.role });
    }
    setSalvando(false);
    if (dbError) { setErro(dbError.message ?? "Erro ao salvar. Verifique o console."); return; }
    fecharModal();
  };

  const confirmarDelete = async () => {
    if (!deleteId || deletando) return;
    setDeletando(true);
    const p = products.find(x => x.id === deleteId);
    await removeProduct(deleteId);
    logAction(currentUser?.username, "produto:remover", { msg: `Produto removido: ${p?.name ?? deleteId}`, name: currentUser?.name, role: currentUser?.role });
    setDeletando(false);
    setDeleteId(null);
  };

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  const unidadesEstoque = unidadesMedida.filter(u => u.tipo === "estoque");
  const unidadesCompra  = unidadesMedida.filter(u => u.tipo === "compra");
  const unidadesConsumo = unidadesMedida.filter(u => u.tipo === "consumo");

  const [abaAtiva, setAbaAtiva] = useState("produtos");

  const ABAS = [
    { id: "produtos",    label: "Produtos" },
    { id: "subprodutos", label: "Subprodutos" },
    { id: "combos",      label: "Combos" },
  ];

  return (
    <div className="produtos-view" style={{ background: varColor(C.bg) }}>

      {/* Header */}
      <div className="produtos-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div className="produtos-view__titulo" style={{ fontWeight: 800 }}>Produtos</div>
          <div className="produtos-view__contagem">{products.length} cadastrado{products.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="produtos-view__acoes">
          {isAdmin && abaAtiva === "produtos" && (
            <>
              <button onClick={() => setShowCatModal(true)} className="produtos-view__btn-categorias" style={{ padding: `9px ${sz.pad - 8}px` }}>
                <LuTag size={15} /> Categorias
              </button>
              <button onClick={() => abrirNovo(true)} className="produtos-view__btn-insumo" style={{ padding: `9px ${sz.pad - 8}px`, borderColor: varColor(C.green), background: alfa(C.green, "12"), color: varColor(C.green) }}>
                + Novo Insumo
              </button>
              <button onClick={() => abrirNovo(false, true)} className="produtos-view__btn-producao" style={{ padding: `9px ${sz.pad - 8}px`, borderColor: varColor(C.blue), background: alfa(C.blue, "12"), color: varColor(C.blue) }}>
                + Item de Produção
              </button>
              <button onClick={() => abrirNovo(false)} className="produtos-view__btn-novo" style={{ padding: `9px ${sz.pad - 8}px` }}>
                + Novo Produto
              </button>
            </>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="produtos-view__abas" style={{ padding: `0 ${sz.pad}px` }}>
        {ABAS.map(aba => {
          const ativo = abaAtiva === aba.id;
          return (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              className="produtos-view__aba"
              style={{ borderBottom: ativo ? `2px solid var(${C.accent})` : "2px solid transparent", color: ativo ? varColor(C.accent) : varColor(C.muted), fontWeight: ativo ? 700 : 500 }}
            >
              {aba.label}
            </button>
          );
        })}
      </div>

      {/* Subprodutos */}
      {abaAtiva === "subprodutos" && <SubprodutosView sz={sz} />}

      {/* Combos */}
      {abaAtiva === "combos" && <CombosView sz={sz} />}

      {/* Produtos — Categorias + Busca + Tabela */}
      {abaAtiva === "produtos" && <>

      <CategoriasComBusca
        categorias={categorias}
        catFiltro={catFiltro}
        setCatFiltro={setCatFiltro}
        busca={busca}
        setBusca={setBusca}
        sz={sz}
      />

      {/* Tabela */}
      <div className="produtos-view__tabela-area">
        {produtosFiltrados.length === 0 ? (
          <div className="produtos-view__vazio">
            <div className="produtos-view__vazio-emoji" style={{ opacity: 0.3 }}>📦</div>
            <div className="produtos-view__vazio-titulo" style={{ fontWeight: 600 }}>{busca ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}</div>
            {isAdmin && !busca && <div className="produtos-view__vazio-texto">Clique em "+ Novo Produto" para adicionar</div>}
          </div>
        ) : (
          <table className="produtos-view__tabela">
            <thead>
              <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                {["", "Nome", "Categoria", "Unidade", "Preço", ""].map((h, i) => (
                  <th key={i} className="produtos-view__th" style={{ padding: `12px ${i === 0 ? sz.pad : 16}px`, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => {
                const units = getUnidadesCompra(p);
                return (
                  <tr key={p.id} className="produtos-view__tr" onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td className="produtos-view__td-emoji" style={{ padding: `14px ${sz.pad}px` }}>
                      <div className="produtos-view__emoji-box">{p.emoji || "📦"}</div>
                    </td>
                    <td className="produtos-view__td">
                      <div className="produtos-view__nome">{p.name}</div>
                      {(p.unidade_consumo || units.length > 0) && (
                        <div className="produtos-view__conversoes">
                          {p.unidade_consumo && <span>consumo: {p.unidade_consumo}</span>}
                          {units.length > 0 && <span>compra: {units.map(u => u.unidade).join(", ")}</span>}
                        </div>
                      )}
                    </td>
                    <td className="produtos-view__td">
                      <span className="produtos-view__tag-categoria">{p.category}</span>
                    </td>
                    <td className="produtos-view__td">
                      <span className="produtos-view__tag-unidade" style={{ background: alfa(C.accent, "12"), border: `1px solid ${alfa(C.accent, "33")}` }}>{labelEstoque(p)}</span>
                    </td>
                    <td className="produtos-view__td" style={{ textAlign: "right" }}>
                      <span className="produtos-view__preco">R$ {Number(p.price).toFixed(2)}</span>
                    </td>
                    <td className="produtos-view__td" style={{ paddingRight: 24, textAlign: "right", whiteSpace: "nowrap" }}>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => abrirEditar(p)} className="produtos-view__btn-editar">Editar</button>
                          <button onClick={() => setDeleteId(p.id)} className="produtos-view__btn-excluir" style={{ borderColor: alfa(C.red, "44"), background: alfa(C.red, "0f"), color: varColor(C.red) }}>Excluir</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>}

      {/* ── Modal Novo / Editar ── */}
      {modal && (
        <div {...fecharAoClicarFora(fecharModal)} className="produtos-view__modal-overlay">
          <div className="produtos-view__modal">
            <div className="produtos-view__modal-topo">
              <div className="produtos-view__modal-titulo" style={{ fontWeight: 800 }}>
                {modal === "novo"
                  ? isInsumo ? "Novo Insumo" : isProducao ? "Novo Item de Produção" : "Novo Produto"
                  : isInsumo ? "Editar Insumo" : isProducao ? "Editar Item de Produção" : "Editar Produto"}
              </div>
              <button onClick={fecharModal} className="produtos-view__modal-fechar"><LuXIcon size={16} /></button>
            </div>

            {/* Nome */}
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={v => setField("name", v)} placeholder="Ex: Cerveja 600ml" maxLength={60} />
            </div>

            {/* Código de barras — visível apenas quando FEATURE_BARCODE_SCANNER estiver ativo */}
            {FEATURE_BARCODE_SCANNER && (
              <div>
                <Label>Código de barras (EAN/QR)</Label>
                <Input value={form.codigo_barras} onChange={v => setField("codigo_barras", v)} placeholder="Ex: 7891234567890" maxLength={64} />
              </div>
            )}

            {/* Categoria — oculta para insumos e itens de produção (categoria fixa) */}
            {!isInsumo && !isProducao && (
              <div>
                <Label>Categoria *</Label>
                <div className="produtos-view__categorias-form">
                  {categorias.map(cat => (
                    <button key={cat} onClick={() => setField("category", cat)} className="produtos-view__categoria-chip" style={{ borderColor: form.category === cat ? varColor(C.accent) : varColor(C.border), background: form.category === cat ? "var(--gm-alow)" : varColor(C.surface), color: form.category === cat ? varColor(C.accent) : varColor(C.muted) }}>
                      {cat}
                    </button>
                  ))}
                </div>
                <Input value={form.category} onChange={v => setField("category", v)} placeholder="Ou digite uma nova categoria" maxLength={40} style={{ marginTop: 8 }} />
              </div>
            )}

            {/* Preço — oculto para insumos */}
            {!isInsumo && (
              <div>
                <Label>Preço (R$) *</Label>
                <div className="produtos-view__preco-wrap">
                  <span className="produtos-view__preco-prefixo">R$</span>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={e => setField("price", e.target.value)} placeholder="0,00" className="produtos-view__preco-input" />
                </div>
              </div>
            )}

            {/* ── Seção: Unidades de medida ── */}
            <div className="produtos-view__secao-unidades">
              <div className="produtos-view__secao-titulo">
                <LuRuler size={15} color={varColor(C.accent)} />
                <span>Unidades de medida</span>
              </div>

              {/* Bloco 1: Unidade de estoque */}
              <div className="produtos-view__bloco">
                <div className="produtos-view__bloco-label">
                  Eu estoco esse produto em
                </div>
                {unidadesEstoque.length === 0 ? (
                  <div className="produtos-view__bloco-vazio">Nenhuma unidade de estoque cadastrada.</div>
                ) : (
                  <div className="produtos-view__unidades-lista">
                    {unidadesEstoque.map(u => {
                      const sel = form.unidade_estoque === u.abreviacao;
                      return (
                        <button key={u.id} onClick={() => setField("unidade_estoque", u.abreviacao)} className="produtos-view__unidade-btn" style={{ borderColor: sel ? varColor(C.accent) : varColor(C.border), background: sel ? "var(--gm-alow)" : varColor(C.card), color: sel ? varColor(C.accent) : varColor(C.muted) }}>
                          {u.abreviacao}
                          <span className="produtos-view__unidade-nome">{u.nome !== u.abreviacao ? u.nome : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="produtos-view__divisor" />

              {/* Bloco 2: Unidades de compra (multi-fornecedor) */}
              <div className="produtos-view__bloco">
                <div className="produtos-view__bloco-label">Unidade de compra</div>

                {form.compras.length === 0 && (
                  <div className="produtos-view__bloco-vazio">Nenhum fornecedor adicionado.</div>
                )}

                {form.compras.map((c, idx) => {
                  const fator = parseFloat(c.fator) || 0;
                  const isEditing = editingCompra === idx;
                  return (
                    <div key={idx} className="produtos-view__fornecedor-card" style={{ borderColor: alfa(C.blue, "33") }}>
                      {/* Cabeçalho com nome do fornecedor */}
                      <div className="produtos-view__fornecedor-cabecalho">
                        {isEditing ? (
                          <input
                            autoFocus
                            value={c.nome}
                            onChange={e => setCompra(idx, "nome", e.target.value)}
                            onBlur={() => setEditingCompra(null)}
                            onKeyDown={e => e.key === "Enter" && setEditingCompra(null)}
                            maxLength={40}
                            className="produtos-view__fornecedor-input"
                            style={{ borderColor: alfa(C.blue, "66") }}
                          />
                        ) : (
                          <span className="produtos-view__fornecedor-nome" style={{ color: c.nome ? varColor(C.text) : varColor(C.muted) }}>
                            {c.nome || "Fornecedor"}
                          </span>
                        )}
                        <button onClick={() => setEditingCompra(isEditing ? null : idx)} title="Renomear" className="produtos-view__fornecedor-btn-icone" style={{ color: isEditing ? varColor(C.blue) : varColor(C.muted) }}>
                          <LuPencil size={12} />
                        </button>
                        <button onClick={() => removeCompra(idx)} className="produtos-view__fornecedor-btn-icone" style={{ color: varColor(C.muted) }}>
                          <LuXIcon size={13} />
                        </button>
                      </div>

                      {/* Frase de conversão */}
                      <div className="produtos-view__conversao-frase">
                        Uma{" "}
                        <span style={{ color: varColor(C.blue), fontWeight: 800 }}>{c.unidade || "…"}</span>
                        {" "}equivale a{" "}
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={c.fator}
                          onChange={e => setCompra(idx, "fator", e.target.value)}
                          placeholder="0"
                          className="produtos-view__conversao-fator"
                          style={{ borderColor: c.fator ? alfa(C.blue, "88") : varColor(C.border) }}
                        />
                        {" "}<span style={{ color: varColor(C.accent), fontWeight: 800 }}>{form.unidade_estoque || "…"}</span>{" "}de estoque
                      </div>

                      {/* Botões de unidade */}
                      {unidadesCompra.length === 0 ? (
                        <div className="produtos-view__bloco-vazio">Nenhuma unidade de compra cadastrada.</div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {unidadesCompra.map(u => {
                            const sel = c.unidade === u.abreviacao;
                            return (
                              <button key={u.id} onClick={() => setCompra(idx, "unidade", sel ? "" : u.abreviacao)} className="produtos-view__unidade-btn" style={{ padding: "6px 14px", borderRadius: 9, borderColor: sel ? varColor(C.blue) : varColor(C.border), background: sel ? alfa(C.blue, "15") : varColor(C.surface), color: sel ? varColor(C.blue) : varColor(C.muted) }}>
                                {u.abreviacao}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Preview */}
                      {c.unidade && fator > 0 && form.unidade_estoque && (
                        <div className="produtos-view__conversao-preview" style={{ background: alfa(C.blue, "10"), borderColor: alfa(C.blue, "33") }}>
                          ✓ 1 {c.unidade} → +{fmtQtd(fator)} {form.unidade_estoque} no estoque
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={addCompra}
                  className="produtos-view__btn-add-fornecedor"
                  style={{ borderColor: alfa(C.blue, "55"), background: alfa(C.blue, "07"), color: varColor(C.blue) }}
                >
                  <LuPencil size={13} /> + Adicionar fornecedor
                </button>
              </div>

              <div className="produtos-view__divisor" />

              {/* Bloco 3: Unidade de consumo */}
              <div className="produtos-view__bloco">
                <div className="produtos-view__bloco-label">
                  Eu consumo/vendo em
                </div>
                {unidadesConsumo.length === 0 ? (
                  <div className="produtos-view__bloco-vazio">Nenhuma unidade de consumo cadastrada.</div>
                ) : (
                  <div className="produtos-view__unidades-lista">
                    {unidadesConsumo.map(u => {
                      const sel = form.unidade_consumo === u.abreviacao;
                      return (
                        <button key={u.id} onClick={() => setField("unidade_consumo", sel ? "" : u.abreviacao)} className="produtos-view__unidade-btn" style={{ borderColor: sel ? varColor(C.green) : varColor(C.border), background: sel ? alfa(C.green, "15") : varColor(C.card), color: sel ? varColor(C.green) : varColor(C.muted) }}>
                          {u.abreviacao}
                          <span className="produtos-view__unidade-nome">{u.nome !== u.abreviacao ? u.nome : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* crítico 7 — fator consumo→estoque: só aparece quando a
                    unidade de consumo difere da de estoque (senão é 1:1) */}
                {form.unidade_consumo && form.unidade_estoque && form.unidade_consumo !== form.unidade_estoque && (
                  <>
                    <div className="produtos-view__conversao-frase">
                      Uma{" "}
                      <span style={{ color: varColor(C.green), fontWeight: 800 }}>{form.unidade_consumo}</span>
                      {" "}vendida gasta{" "}
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={form.fator_consumo}
                        onChange={e => setField("fator_consumo", e.target.value)}
                        placeholder="1"
                        className="produtos-view__conversao-fator"
                        style={{ borderColor: form.fator_consumo ? alfa(C.green, "88") : varColor(C.border) }}
                      />
                      {" "}<span style={{ color: varColor(C.accent), fontWeight: 800 }}>{form.unidade_estoque}</span>{" "}do estoque
                    </div>
                    {(() => {
                      const f = parseFloat(String(form.fator_consumo).replace(",", "."));
                      if (!(f > 0)) return null;
                      return (
                        <div className="produtos-view__conversao-preview" style={{ background: alfa(C.green, "10"), borderColor: alfa(C.green, "33") }}>
                          ✓ 1 {form.unidade_consumo} vendida → −{fmtQtd(f)} {form.unidade_estoque} no estoque
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div className="produtos-view__erro" style={{ background: alfa(C.red, "15"), border: `1px solid ${alfa(C.red, "44")}` }}>
                ⚠️ {erro}
              </div>
            )}

            {/* Botões */}
            <div className="produtos-view__modal-botoes">
              <button onClick={fecharModal} className="produtos-view__btn-cancelar">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="produtos-view__btn-salvar" style={{ background: salvando ? varColor(C.faint) : varColor(C.accent), cursor: salvando ? "not-allowed" : "pointer" }}>
                {salvando ? "Salvando..." : modal === "novo"
                  ? isInsumo ? "Cadastrar Insumo" : isProducao ? "Cadastrar Item" : "Cadastrar Produto"
                  : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Categorias */}
      {showCatModal && createPortal(
        <div {...fecharAoClicarFora(() => { setShowCatModal(false); setCatEditando(null); setCatNova(""); })} className="produtos-view__confirm-overlay" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="produtos-view__cat-modal">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="produtos-view__cat-modal-titulo" style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><LuTag size={18} color={varColor(C.accent)} /> Categorias</div>
                <div className="produtos-view__cat-modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>{categorias.length} categoria{categorias.length !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => { setShowCatModal(false); setCatEditando(null); setCatNova(""); }} style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", lineHeight: 0, padding: 4 }}><LuXIcon size={20} /></button>
            </div>
            <div className="produtos-view__cat-lista">
              {categorias.length === 0 && <div className="produtos-view__cat-vazio" style={{ color: varColor(C.muted), textAlign: "center", padding: 24 }}>Nenhuma categoria ainda.</div>}
              {categorias.map(cat => {
                const qtdProdutos = products.filter(p => p.category === cat).length;
                const emEdicao    = catEditando?.name === cat;
                const eCatFixa    = CATS_FIXAS.includes(cat);
                const podeExcluir = !eCatFixa;
                return (
                  <div key={cat} className="produtos-view__cat-item" style={{ background: emEdicao ? "var(--gm-alow)" : varColor(C.surface), borderColor: emEdicao ? alfa(C.accent, "66") : varColor(C.border) }}>
                    {emEdicao ? (
                      <>
                        <input autoFocus value={catEditando.input} onChange={e => setCatEditando(v => ({ ...v, input: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") renomearCategoria(); if (e.key === "Escape") setCatEditando(null); }} className="produtos-view__cat-input-edicao" />
                        <button onClick={renomearCategoria} disabled={catOpLoading} className="produtos-view__cat-btn-confirmar"><LuCheck size={15} /></button>
                        <button onClick={() => setCatEditando(null)} className="produtos-view__cat-btn-cancelar-edicao"><LuXIcon size={15} /></button>
                      </>
                    ) : (
                      <>
                        <span className="produtos-view__cat-nome">{cat}</span>
                        {eCatFixa && <span className="produtos-view__cat-badge-padrao" style={{ background: alfa(C.accent, "15"), border: `1px solid ${alfa(C.accent, "33")}` }}>padrão</span>}
                        <span className="produtos-view__cat-badge-qtd">{qtdProdutos} {qtdProdutos === 1 ? "produto" : "produtos"}</span>
                        {!eCatFixa && <button onClick={() => setCatEditando({ name: cat, input: cat })} className="produtos-view__cat-btn-editar" style={{ borderColor: varColor(C.border), color: varColor(C.muted) }}><LuPencil size={14} /></button>}
                        <button onClick={() => podeExcluir && setCatConfirmDelete(cat)} disabled={!podeExcluir || catOpLoading} className="produtos-view__cat-btn-excluir" style={{ borderColor: podeExcluir ? alfa(C.red, "55") : varColor(C.border), color: podeExcluir ? varColor(C.red) : varColor(C.border), cursor: podeExcluir ? "pointer" : "not-allowed", opacity: podeExcluir ? 1 : 0.4 }}><LuTrash2 size={14} /></button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="produtos-view__cat-nova-secao">
              <div className="produtos-view__cat-nova-titulo">Nova Categoria</div>
              <div className="produtos-view__cat-nova-linha">
                <input value={catNova} onChange={e => setCatNova(e.target.value)} onKeyDown={e => e.key === "Enter" && criarCategoria()} placeholder="Ex: Bebidas, Lanches..." maxLength={40} className="produtos-view__cat-nova-input" style={{ borderColor: catNova.trim() ? varColor(C.accent) : varColor(C.border) }} />
                <button onClick={criarCategoria} disabled={!catNova.trim() || catOpLoading || categorias.includes(catNova.trim())} className="produtos-view__cat-nova-btn" style={{ background: catNova.trim() && !categorias.includes(catNova.trim()) ? varColor(C.accent) : varColor(C.surface), color: catNova.trim() && !categorias.includes(catNova.trim()) ? "#fff" : varColor(C.muted), cursor: catNova.trim() && !categorias.includes(catNova.trim()) ? "pointer" : "not-allowed" }}>
                  {catOpLoading ? "..." : "Adicionar"}
                </button>
              </div>
              {catNova.trim() && categorias.includes(catNova.trim()) && <div className="produtos-view__cat-aviso-existe">Esta categoria já existe.</div>}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Confirmar Exclusão de Categoria */}
      {catConfirmDelete && createPortal(
        <div {...fecharAoClicarFora(() => setCatConfirmDelete(null))} className="produtos-view__confirm-overlay">
          <div className="produtos-view__confirm-modal">
            <div className="produtos-view__confirm-topo">
              <div className="produtos-view__confirm-icone" style={{ background: alfa(C.red, "18"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
                <LuTrash2 size={22} color={varColor(C.red)} />
              </div>
              <div>
                <div className="produtos-view__confirm-titulo">Excluir categoria?</div>
                <div className="produtos-view__confirm-sub">Categoria: <strong style={{ color: varColor(C.text) }}>{catConfirmDelete}</strong></div>
              </div>
            </div>
            <div className="produtos-view__confirm-aviso" style={{ background: alfa(C.red, "0d"), border: `1px solid ${alfa(C.red, "33")}` }}>
              Esta ação <strong style={{ color: varColor(C.red) }}>não pode ser desfeita</strong>. A categoria será removida permanentemente.
            </div>
            <div className="produtos-view__confirm-botoes">
              <button onClick={() => setCatConfirmDelete(null)} className="produtos-view__confirm-btn-cancelar">Cancelar</button>
              <button
                onClick={async () => { await excluirCategoria(catConfirmDelete); setCatConfirmDelete(null); }}
                disabled={catOpLoading}
                className="produtos-view__confirm-btn-excluir"
                style={{ background: catOpLoading ? varColor(C.faint) : varColor(C.red), cursor: catOpLoading ? "not-allowed" : "pointer" }}
              >
                {catOpLoading ? "Excluindo..." : "Sim, excluir"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Confirmar Exclusão */}
      {deleteId && createPortal(
        (() => {
          const p = products.find(x => x.id === deleteId);
          return (
            <div {...fecharAoClicarFora(() => setDeleteId(null))} className="produtos-view__confirm-overlay" style={{ background: "rgba(0,0,0,0.7)" }}>
              <div className="produtos-view__confirm-modal">
                <div className="produtos-view__confirm-topo">
                  <div className="produtos-view__confirm-icone" style={{ background: alfa(C.red, "18"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
                    <LuTriangleAlert size={22} color={varColor(C.red)} />
                  </div>
                  <div>
                    <div className="produtos-view__confirm-titulo">Excluir produto?</div>
                    <div className="produtos-view__confirm-sub">{p?.emoji} <strong style={{ color: varColor(C.text) }}>{p?.name}</strong></div>
                  </div>
                </div>
                <div className="produtos-view__confirm-aviso" style={{ background: alfa(C.red, "0d"), border: `1px solid ${alfa(C.red, "33")}` }}>
                  Esta ação <strong style={{ color: varColor(C.red) }}>não pode ser desfeita</strong>. O produto será removido permanentemente.
                </div>
                <div className="produtos-view__confirm-botoes">
                  <button onClick={() => setDeleteId(null)} className="produtos-view__confirm-btn-cancelar">Cancelar</button>
                  <button onClick={confirmarDelete} disabled={deletando} className="produtos-view__confirm-btn-excluir" style={{ background: deletando ? varColor(C.faint) : varColor(C.red), cursor: deletando ? "not-allowed" : "pointer" }}>{deletando ? "Excluindo..." : "Sim, excluir"}</button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}

function Label({ children }) {
  return <div className="produtos-view__label">{children}</div>;
}

function Input({ value, onChange, placeholder, maxLength, style, type }) {
  return (
    <input type={type ?? "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} className="produtos-view__input" style={style} />
  );
}

