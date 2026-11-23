import { useState, useEffect } from "react";
import { useSessao, useCatalogo } from "@/context/AppContext";
import { importarNotaFiscal, listarNotasEntrada, buscarNotaPorChave, listarItensDaNota } from "@/features/estoque/dados/notasEntrada";
import { emitirEvento } from "@/lib/jarvas";
import { parseNFe } from "@/utils/parseNFe";
// O dia UTC vira às 21h de Brasília: a nota lançada à noite nascia com a data
// de emissão de amanhã e a entrada de estoque caía no dia seguinte.
import { hojeLocalISO } from "@/utils/datas";
// A quantidade convertida vai direto para o saldo do estoque: sem arredondar,
// 3 × 0,35 grava 1.0499999999999998 e o saldo carrega a sujeira para sempre.
import { arredondarQtd } from "@/utils/conversaoUnidades";
// TD015: a linha da nota carrega estado próprio (busca do produto, dropdown
// aberto), então a chave de renderização não pode ser a posição na lista.
import { novoUid } from "@/lib/uidLista";
import { novoItemManual } from "@/components/desktop/views/notasFiscais/apoio";
import { useEstadoImportacaoXml } from "./useEstadoImportacaoXml";
import { useEstadoNotaManual } from "./useEstadoNotaManual";

// Estado e ações da aba Notas Fiscais: lista, detalhe, importação pelo XML e
// lançamento manual. As quatro telas da aba leem daqui.
export function useNotasFiscais({ fornecedores = [], onAddFornecedor }) {
  const { currentUser } = useSessao();
  const { products, recarregarEstoque } = useCatalogo();

  const [view,        setView]       = useState("lista");
  const [notas,       setNotas]      = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [notaDetalhe, setNotaDetalhe] = useState(null);
  const [notaItens,   setNotaItens]  = useState([]);

  const {
    step, setStep, xmlString, setXmlString, parsed, setParsed, xmlErro, setXmlErro, checkingDup, setCheckingDup, duplicadaEm, setDuplicadaEm, dupErro, setDupErro, itensVinc, setItensVinc, saving, setSaving, saveErro, setSaveErro, importOk, setImportOk, dragOver, setDragOver, fileRef,
  } = useEstadoImportacaoXml();

  const {
    manualForm, setManualForm, manualItens, setManualItens, manualErro, setManualErro, fromManual, setFromManual, pendingFornNome, setPendingFornNome, showFornPopup, setShowFornPopup, fornSaving, setFornSaving, manualFornId, setManualFornId, manualFornBusca, setManualFornBusca, showFornDD, setShowFornDD, showNovoForn, setShowNovoForn, novoFornForm, setNovoFornForm, novoFornErro, setNovoFornErro, fornDDRef,
  } = useEstadoNotaManual();

  useEffect(() => { loadNotas(); }, []);

  useEffect(() => {
    if (!pendingFornNome) return;
    const found = fornecedores.find(f => f.nome.trim().toLowerCase() === pendingFornNome.trim().toLowerCase());
    if (found) { setManualFornId(found.id); setPendingFornNome(null); setShowNovoForn(false); }
  }, [fornecedores, pendingFornNome, setManualFornId, setPendingFornNome, setShowNovoForn]);

  useEffect(() => {
    const h = (e) => { if (fornDDRef.current && !fornDDRef.current.contains(e.target)) setShowFornDD(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [fornDDRef, setShowFornDD]);

  const loadNotas = async () => {
    setLoadingList(true);
    // Sem xml_raw: a lista só precisa do cabeçalho (o XML inteiro de
    // cada nota deixaria a listagem pesada à toa).
    const { data } = await listarNotasEntrada();
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
    setDuplicadaEm(null); setDupErro(""); setItensVinc([]); setSaving(false);
    setSaveErro(""); setImportOk(null); setFromManual(false);
    setView("wizard");
  };

  const startManual = () => {
    setManualForm({ numero: "", serie: "", dataEmissao: hojeLocalISO() });
    setManualItens([novoItemManual()]);
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
      uid: it.uid,
      numero: idx + 1,
      descricaoXml: it.descricaoXml.trim(),
      codigoXml: null,
      unidadeXml: it.unidadeXml.trim() || "UN",
      quantidade: Number(it.quantidade) || 0,
      precoUnitario: parseFloat(String(it.precoUnitario).replace(",", ".")) || 0,
      precoTotal: (Number(it.quantidade) || 0) * (parseFloat(String(it.precoUnitario).replace(",", ".")) || 0),
      produto: null, fator: 1, fatorAuto: false,
      qtdEstoque: arredondarQtd(it.quantidade),
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
    setDupErro("");
    const { data, error } = await buscarNotaPorChave(parsed.cabecalho.chaveAcesso);
    setCheckingDup(false);
    if (error) {
      // Sem confirmar que a nota é inédita, não deixa avançar: se a
      // consulta falhou e a nota já existia, reimportar daria entrada
      // em dobro no estoque.
      setDupErro("Não foi possível verificar se esta nota já foi importada. Confira a conexão e tente de novo.");
      return;
    }
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
      ...item, uid: novoUid(), produto: null, fator: 1, fatorAuto: false, qtdEstoque: arredondarQtd(item.quantidade),
    })));
  };

  const updateItem = (i, updated) => setItensVinc(prev => prev.map((it, idx) => idx === i ? updated : it));

  const vinculados    = itensVinc.filter(i => !!i.produto);
  const naoVinculados = itensVinc.filter(i => !i.produto);
  // Item vinculado a um produto mas com quantidade 0 para o estoque: acontece
  // quando o operador apaga o campo de fator ou digita texto nele (o parse cai
  // para 0). Antes a importação seguia em frente — gravava uma entrada de 0 no
  // histórico, não somava saldo nenhum, e a tela de sucesso ainda contava esse
  // produto como "atualizado no estoque". Só se descobria conferindo o saldo.
  const semQuantidade = vinculados.filter(i => !(i.qtdEstoque > 0));

  const handleConfirmar = async () => {
    setSaving(true); setSaveErro("");
    try {
      const { cabecalho } = parsed;

      // Nota, itens, histórico de entradas e saldo numa transação só (tarefa
      // 1.2 do plano de refatoração). Antes eram quatro etapas soltas, e uma
      // falha depois da primeira deixava a nota gravada pela metade: sem
      // itens ou sem saldo, e a reimportação era recusada como duplicada.
      // O saldo continua somado pelo banco (`entrada_estoque`), só os
      // produtos da nota, nunca o mapa inteiro deste navegador.
      await importarNotaFiscal({ cabecalho, xmlString, itens: itensVinc, dataEntrada: hojeLocalISO() });

      // O banco já confirmou os saldos; a tela relê para mostrar o número dele.
      recarregarEstoque();
      for (const item of vinculados) {
        emitirEvento("estoque.entrada", "estoque", { produto_id: item.produto.id, quantidade: item.qtdEstoque }, currentUser?.username);
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
    const { data } = await listarItensDaNota(nota.id);
    setNotaItens(data || []);
    setView("detalhe");
  };

  return {
    view,
    setView,
    notas,
    setNotas,
    loadingList,
    setLoadingList,
    notaDetalhe,
    setNotaDetalhe,
    notaItens,
    setNotaItens,
    currentUser,
    products,
    recarregarEstoque,
    step,
    setStep,
    xmlString,
    setXmlString,
    parsed,
    setParsed,
    xmlErro,
    setXmlErro,
    checkingDup,
    setCheckingDup,
    duplicadaEm,
    setDuplicadaEm,
    dupErro,
    setDupErro,
    itensVinc,
    setItensVinc,
    saving,
    setSaving,
    saveErro,
    setSaveErro,
    importOk,
    setImportOk,
    dragOver,
    setDragOver,
    fileRef,
    manualForm,
    setManualForm,
    manualItens,
    setManualItens,
    manualErro,
    setManualErro,
    fromManual,
    setFromManual,
    pendingFornNome,
    setPendingFornNome,
    showFornPopup,
    setShowFornPopup,
    fornSaving,
    setFornSaving,
    manualFornId,
    setManualFornId,
    manualFornBusca,
    setManualFornBusca,
    showFornDD,
    setShowFornDD,
    showNovoForn,
    setShowNovoForn,
    novoFornForm,
    setNovoFornForm,
    novoFornErro,
    setNovoFornErro,
    fornDDRef,
    loadNotas,
    normCnpj,
    findFornecedor,
    salvarNovoFornecedor,
    fornecedorSelecionado,
    startWizard,
    startManual,
    confirmarManual,
    processFile,
    handleDrop,
    avancarStep2,
    initItens,
    updateItem,
    vinculados,
    naoVinculados,
    semQuantidade,
    handleConfirmar,
    openDetalhe,
    fornecedores,
    onAddFornecedor,
  };
}
