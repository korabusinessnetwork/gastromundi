import { useState, useMemo, useEffect } from "react";
import { carregarGruposDoProduto, salvarGrupos } from "@/features/cardapio/dados/gruposEscolha";
import { useSessao, useCatalogo } from "@/context/AppContext";
import { lerCategoriasExtra, salvarCategoriasExtra } from "@/features/cardapio/dados/categorias";
import { listarUnidadesMedida } from "@/features/estoque/dados/unidadesMedida";
import { logAction } from "@/features/auditoria/dados/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { CATS_FIXAS, chaveCategoria, ehCategoriaFixa } from "@/features/cardapio/regras/categoriasProduto";
import { FEATURE_BARCODE_SCANNER } from "@/constants/features";
import { novoUid } from "@/lib/uidLista";
import { EMPTY_COMPRA, EMPTY_FORM, CAT_SEM_CATEGORIA } from "@/features/cardapio/regras/produto";
import { useEstadoCategorias } from "./useEstadoCategorias";
import { nomeBateComBusca } from "@/lib/busca";
import { ehGerencia } from "@/constants/roles";

// Estado e ações da tela de Produtos: lista, filtros, cadastro e exclusão do
// produto e as categorias personalizadas.
export function useProdutos() {
  const { currentUser, loading } = useSessao();
  const { products, addProduct, updateProduct, removeProduct } = useCatalogo();
  const { width } = useResponsive();
  const sz = getSizes(width);

  // Logo depois do login o bootstrap ainda está em voo e a lista chega vazia.
  // A tela anunciava "0 cadastrados" e "Nenhum produto cadastrado" num
  // estabelecimento com 18 produtos — dá pra achar que o cadastro sumiu.
  // "Ainda não sei" e "não tem nada" precisam parecer coisas diferentes.
  const carregando = loading && products.length === 0;

  const [modal,     setModal]     = useState(null);
  // Grupos de escolha do produto (produto com seleção: qual refrigerante).
  const [grupos,    setGrupos]    = useState([]);
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


  const {
    showCatModal, setShowCatModal, catExtra, setCatExtra, catEditando, setCatEditando, catNova, setCatNova, catOpLoading, setCatOpLoading, catConfirmDelete, setCatConfirmDelete, catErro, setCatErro, catExtraCarregado, setCatExtraCarregado,
  } = useEstadoCategorias();

  useEffect(() => {
    lerCategoriasExtra()
      .then(({ data, error }) => {
        // Toda gravação de categoria é um upsert da lista inteira. Se a leitura
        // falhou e mesmo assim deixássemos gravar, o upsert seguinte apagaria
        // do banco todas as categorias que não conseguimos ler. Por isso a
        // falha bloqueia a edição em vez de só avisar depois do estrago.
        // PGRST116 é "nenhuma linha": tenant que ainda não criou extra nenhuma.
        if (error && error.code !== "PGRST116") {
          setCatErro("Não deu para carregar as categorias personalizadas. Recarregue a página antes de criar, renomear ou excluir categoria.");
          return;
        }
        setCatExtraCarregado(true);
        if (data?.value && Array.isArray(data.value)) setCatExtra(data.value);
      });
    listarUnidadesMedida()
      .then(({ data }) => { if (data) setUnidadesMedida(data); });
  }, [setCatErro, setCatExtra, setCatExtraCarregado]);

  // Otimista com desfazer: a lista volta ao que era quando o banco recusa.
  // Antes o upsert não era conferido, então a categoria aparecia criada na
  // tela, sumia no reload, e a gravação seguinte partia de uma lista errada.
  const salvarCatExtra = async (lista) => {
    const anterior = catExtra;
    setCatExtra(lista);
    const { error } = await salvarCategoriasExtra(lista);
    if (error) {
      setCatExtra(anterior);
      return { error };
    }
    return { error: null };
  };

  const criarCategoria = async () => {
    const nome = catNova.trim();
    if (!nome || catOpLoading || !catExtraCarregado || categorias.includes(nome)) return;
    setCatOpLoading(true);
    setCatErro("");
    const { error } = await salvarCatExtra([...catExtra, nome]);
    setCatOpLoading(false);
    if (error) {
      setCatErro(`Não deu para criar a categoria "${nome}". Tente de novo.`);
      return;
    }
    setCatNova("");
  };

  const renomearCategoria = async () => {
    if (!catEditando || catOpLoading || !catExtraCarregado) return;
    const novoNome   = catEditando.input.trim();
    const nomeAntigo = catEditando.name;
    if (!novoNome || novoNome === nomeAntigo) { setCatEditando(null); return; }
    setCatOpLoading(true);
    setCatErro("");
    const { error } = await salvarCatExtra(catExtra.map(c => c === nomeAntigo ? novoNome : c));
    if (error) {
      setCatOpLoading(false);
      setCatErro(`Não deu para renomear "${nomeAntigo}". Nada foi alterado, tente de novo.`);
      return;
    }
    const resultados = await Promise.all(products.filter(p => p.category === nomeAntigo).map(p => updateProduct(p.id, { category: novoNome })));
    const falhas = resultados.filter(r => r?.error).length;
    if (falhas > 0) setCatErro(`A categoria virou "${novoNome}", mas ${falhas} produto${falhas === 1 ? "" : "s"} continuou em "${nomeAntigo}". Abra o produto e corrija a categoria.`);
    if (catFiltro === nomeAntigo) setCatFiltro(novoNome);
    setCatEditando(null);
    setCatOpLoading(false);
  };

  const excluirCategoria = async (nome) => {
    if (catOpLoading || !catExtraCarregado || nome === CAT_SEM_CATEGORIA) return;
    setCatOpLoading(true);
    setCatErro("");
    // A lista sai primeiro: se essa gravação falhar, nada foi mexido. Na ordem
    // antiga (produtos primeiro) a mesma falha deixava todo mundo em "Sem
    // Categoria" com a categoria ainda de pé — perda silenciosa.
    const { error } = await salvarCatExtra(catExtra.filter(c => c !== nome));
    if (error) {
      setCatOpLoading(false);
      setCatErro(`Não deu para excluir "${nome}". Nada foi alterado, tente de novo.`);
      return;
    }
    // Produtos dentro da categoria não são excluídos: caem no balde "Sem
    // Categoria".
    const afetados = products.filter(p => p.category === nome);
    const resultados = await Promise.all(afetados.map(p => updateProduct(p.id, { category: CAT_SEM_CATEGORIA })));
    const falhas = resultados.filter(r => r?.error).length;
    if (falhas > 0) setCatErro(`${falhas} produto${falhas === 1 ? " continuou" : "s continuaram"} em "${nome}", então a categoria segue na lista. Tente de novo.`);
    if (catFiltro === nome) setCatFiltro(afetados.length > 0 ? CAT_SEM_CATEGORIA : "Todos");
    setCatOpLoading(false);
  };

  const categorias = useMemo(() => {
    const fromProducts = products.map(p => p.category).filter(Boolean);
    return [...new Set([...CATS_FIXAS, ...catExtra, ...fromProducts])].sort();
  }, [products, catExtra]);

  // O que o cadastro de PRODUTO pode escolher: tudo menos as categorias de
  // sistema. Quem quer cadastrar insumo ou item de produção usa o botão
  // próprio — não existe caminho torto até lá.
  const categoriasProduto = useMemo(
    () => categorias.filter(cat => !ehCategoriaFixa(cat)),
    [categorias],
  );

  const produtosFiltrados = useMemo(() => {
    return products
      .filter(p => catFiltro === "Todos" || p.category === catFiltro)
      .filter(p => !busca || nomeBateComBusca(p.name, busca.toLowerCase()));
  }, [products, catFiltro, busca]);

  // ── Modal ─────────────────────────────────────────────────────

  const abrirNovo = (insumo = false, producao = false) => {
    setIsInsumo(insumo);
    setIsProducao(producao);
    setForm({ ...EMPTY_FORM, category: insumo ? "Insumo" : producao ? "Produção" : "" });
    setErro("");
    setEditId(null);
    setGrupos([]);
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
        uid:     novoUid(),
        nome:    u.nome ?? "",
        unidade: u.unidade ?? "",
        fator:   u.fator != null ? String(u.fator) : "",
      }));
    }

    setForm({
      name:            p.name,
      price:           String(p.price ?? "0"),
      category:        p.category ?? "",
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
    setGrupos([]);
    setModal("editar");
    // Grupos de escolha só existem para produto comum (não insumo/produção).
    if (!insumo && !producao) {
      carregarGruposDoProduto(p.id).then(({ data, error }) => {
        if (!error && Array.isArray(data)) setGrupos(data);
      });
    }
  };

  const fecharModal = () => {
    setModal(null);
    setEditingCompra(null);
    setErro("");
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addCompra = () => setForm(f => {
    const n = f.compras.length + 1;
    const nome = f.compras.filter(c => c.nome.startsWith("Fornecedor")).length > 0
      ? `Fornecedor ${n}` : "Fornecedor";
    return { ...f, compras: [...f.compras, { ...EMPTY_COMPRA, uid: novoUid(), nome }] };
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
    // Rede de segurança do bloqueio acima: nem o chip nem o campo livre levam
    // um produto comum para as categorias de sistema. A porta é o botão certo.
    if (!isInsumo && !isProducao && ehCategoriaFixa(form.category)) {
      return chaveCategoria(form.category) === "insumo"
        ? 'Para cadastrar um insumo, use o botão "+ Novo Insumo".'
        : 'Para cadastrar um item de produção, use o botão "+ Item de Produção".';
    }
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

  // Ligar e desligar a venda de um produto sem abrir o cadastro. O produto
  // desabilitado continua na lista (é onde se religa); quem deixa de
  // oferecê-lo são as telas de venda.
  const [alternandoId, setAlternandoId] = useState(null);
  const [erroVenda, setErroVenda] = useState("");
  const alternarVenda = async (p) => {
    if (!isAdmin || alternandoId != null) return;
    const ligando = p.active === false;
    setAlternandoId(p.id);
    setErroVenda("");
    const { error } = await updateProduct(p.id, { active: ligando });
    setAlternandoId(null);
    if (error) {
      setErroVenda(
        `Não deu para ${ligando ? "voltar a vender" : "desabilitar"} "${p.name}". Nada foi alterado. Tente de novo.`,
      );
    }
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
    let produtoId = editId;
    if (modal === "novo") {
      const { data, error } = await addProduct({ id: crypto.randomUUID(), ...payload });
      dbError = error;
      const tipo = isInsumo ? "Insumo" : isProducao ? "Item de Produção" : "Produto";
      if (!error) {
        // A partir daqui é edição: se os grupos falharem, salvar de novo
        // atualiza este produto em vez de criar um segundo.
        produtoId = data?.id;
        setEditId(produtoId);
        setModal("editar");
      }
      if (!error) logAction(currentUser?.username, isInsumo ? "insumo:criar" : isProducao ? "producao:criar" : "produto:criar", { msg: `${tipo} cadastrado: ${payload.name}`, name: currentUser?.name, role: currentUser?.role });
    } else {
      const tipo = isInsumo ? "Insumo" : isProducao ? "Item de Produção" : "Produto";
      const { error } = await updateProduct(editId, payload);
      dbError = error;
      if (!error) logAction(currentUser?.username, isInsumo ? "insumo:editar" : isProducao ? "producao:editar" : "produto:editar", { msg: `${tipo} editado: ${payload.name}`, name: currentUser?.name, role: currentUser?.role });
    }
    if (dbError) { setSalvando(false); setErro(dbError.message ?? "Erro ao salvar. Verifique o console."); return; }

    if (!isInsumo && !isProducao && produtoId != null) {
      const { error: erroGrupos } = await salvarGrupos({ produtoId, grupos });
      if (erroGrupos) {
        setSalvando(false);
        setErro("O produto foi salvo, mas não deu para salvar as opções de escolha. Clique em salvar de novo.");
        return;
      }
    }
    setSalvando(false);
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

  const isAdmin = ehGerencia(currentUser);

  const unidadesEstoque = unidadesMedida.filter(u => u.tipo === "estoque");
  const unidadesCompra  = unidadesMedida.filter(u => u.tipo === "compra");
  const unidadesConsumo = unidadesMedida.filter(u => u.tipo === "consumo");

  const [abaAtiva, setAbaAtiva] = useState("produtos");

  const ABAS = [
    { id: "produtos",    label: "Produtos" },
    { id: "subprodutos", label: "Subprodutos" },
    { id: "combos",      label: "Combos" },
  ];

  return {
    modal,
    setModal,
    form,
    setForm,
    editId,
    setEditId,
    salvando,
    setSalvando,
    erro,
    setErro,
    deleteId,
    setDeleteId,
    deletando,
    setDeletando,
    catFiltro,
    setCatFiltro,
    busca,
    setBusca,
    unidadesMedida,
    setUnidadesMedida,
    editingCompra,
    setEditingCompra,
    isInsumo,
    setIsInsumo,
    isProducao,
    setIsProducao,
    abaAtiva,
    setAbaAtiva,
    currentUser,
    loading,
    products,
    addProduct,
    updateProduct,
    removeProduct,
    width,
    showCatModal,
    setShowCatModal,
    catExtra,
    setCatExtra,
    catEditando,
    setCatEditando,
    catNova,
    setCatNova,
    catOpLoading,
    setCatOpLoading,
    catConfirmDelete,
    setCatConfirmDelete,
    catErro,
    setCatErro,
    catExtraCarregado,
    setCatExtraCarregado,
    sz,
    carregando,
    salvarCatExtra,
    criarCategoria,
    renomearCategoria,
    excluirCategoria,
    categorias,
    categoriasProduto,
    produtosFiltrados,
    abrirNovo,
    abrirEditar,
    fecharModal,
    setField,
    addCompra,
    setCompra,
    removeCompra,
    validar,
    salvar,
    confirmarDelete,
    isAdmin,
    alternandoId,
    erroVenda,
    setErroVenda,
    alternarVenda,
    grupos,
    setGrupos,
    unidadesEstoque,
    unidadesCompra,
    unidadesConsumo,
    ABAS,
  };
}
