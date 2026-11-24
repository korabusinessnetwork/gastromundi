import { useState, useMemo } from "react";
import { useSessao, useCatalogo } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import {
  compraParaEstoque, getUnidadesCompra, fmtQtd
} from "@/utils/conversaoUnidades";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
import { normalizarTexto } from "@/lib/importacao/planilha";
import {
  classificarEstoque
} from "@/lib/estoqueSituacao";
import { MINIMO_FALLBACK, lerQuantidade } from "@/components/desktop/views/estoque/apoio";
import { useEstadoAutorizacaoEstoque } from "./useEstadoAutorizacaoEstoque";

// Estado e ações da tela de Estoque: filtros, ordenação, entradas, rascunhos dos campos
// e a autorização de entrada.
export function useEstoque() {
  const { loading } = useSessao();
  const { products, estoque, estoqueMinimos, updateEstoque, entradaEstoque, setMinimoEstoque } = useCatalogo();

  // O bootstrap ainda está em voo e nada chegou: a tela mostrava "0 Total em
  // estoque · 0 Sem estoque" e uma lista vazia, ou seja, anunciava um estoque
  // zerado que não existia. "Ainda não sei" e "não tem nada" são coisas
  // diferentes e precisam parecer diferentes.
  const carregando = loading && products.length === 0;
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [busca,     setBusca]     = useState("");
  const [categoria, setCategoria] = useState("Todos");
  const [salvando,  setSalvando]  = useState({});
  const [sortKey,   setSortKey]   = useState("name");
  const [sortDir,   setSortDir]   = useState("asc");

  // Por produto: modo de entrada ("estoque" | índice numérico da unidade de compra) e valor digitado
  const [modoEntrada, setModoEntrada] = useState({});
  const [qtdEntrada,  setQtdEntrada]  = useState({});

  // Rascunho dos campos digitáveis (saldo direto e mínimo). Enquanto o operador
  // digita, o valor fica só na tela; a gravação acontece quando ele sai do campo
  // ou aperta Enter. Antes cada tecla era uma gravação: digitar "25" gravava 2 e
  // depois 25, e apagar o campo gravava 0 — zerando o saldo do produto no banco
  // sem ninguém ter pedido isso.
  const [rascunhoSaldo,  setRascunhoSaldo]  = useState({});
  const [rascunhoMinimo, setRascunhoMinimo] = useState({});

  // Erro da última gravação. O AppContext desfaz o valor otimista quando a
  // gravação falha, então sem este aviso o número simplesmente voltava sozinho
  // e o operador achava que tinha salvo.
  const [erro, setErro] = useState(null);

  const {
    autorizado, setAutorizado, showAuth, setShowAuth, senha, setSenha, senhaErro, setSenhaErro,
    senhaVis, setSenhaVis, verificando, setVerificando,
  } = useEstadoAutorizacaoEstoque();

  const categorias = useMemo(() => {
    // Só entra chip de categoria que existe no catálogo deste estabelecimento.
    // Havia uma categoria fixa no código ("Insumo"): em quem não usa esse nome,
    // o chip aparecia do mesmo jeito e filtrava para uma tabela vazia — e
    // categoria escrita no código contraria o white-label (decisão 017).
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    return ["Todos", ...cats];
  }, [products]);

  const lista = useMemo(() => {
    let l = products;
    // Busca sem acento: quem digita "acai" no teclado do caixa tem de achar
    // "Açaí". Antes o filtro só baixava a caixa das letras e não encontrava nada.
    const termo = normalizarTexto(busca);
    if (termo)                l = l.filter(p => normalizarTexto(p.name).includes(termo));
    if (categoria !== "Todos") l = l.filter(p => p.category === categoria);
    l = [...l].sort((a, b) => {
      if (sortKey === "saldo" || sortKey === "price") {
        const va = sortKey === "saldo" ? (estoque[a.id] ?? 0) : (Number(a.price) || 0);
        const vb = sortKey === "saldo" ? (estoque[b.id] ?? 0) : (Number(b.price) || 0);
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      }
      // Ordem alfabética de verdade. Comparar com `<` e `>` usa a ordem dos
      // códigos Unicode, onde "ç" vem depois de "z": todo produto acentuado
      // caía para o fim da lista ("Açaí" depois de "Zebra").
      const dif = (a[sortKey] ?? "").toString()
        .localeCompare((b[sortKey] ?? "").toString(), "pt-BR", { sensitivity: "base", numeric: true });
      return sortDir === "asc" ? dif : -dif;
    });
    return l;
  }, [products, busca, categoria, sortKey, sortDir, estoque]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Soma dos saldos. Com fator fracionário (pacote de 0,35 kg) a soma acumula
  // dízima binária — 0,1 + 0,2 dá 0,30000000000000004 em JavaScript — e antes
  // esse número ia cru para a tela, com dezessete casas depois da vírgula. O
  // formato é o mesmo das linhas da tabela.
  const totalSaldo   = fmtQtd(products.reduce((s, p) => s + (estoque[p.id] ?? 0), 0));
  // Só conta ruptura em produto que controla estoque. Um prato do cardápio sem
  // linha de estoque não está "sem estoque" — ele não é contado.
  const situacao     = classificarEstoque(products, estoque, estoqueMinimos);
  const semEstoque   = situacao.semEstoque.length;
  const estoqueBaixo = situacao.baixos.length;

  const getModo = (p) => {
    const stored = modoEntrada[p.id];
    if (stored !== undefined) return stored;
    const units = getUnidadesCompra(p);
    return units.length > 0 ? 0 : "estoque";
  };

  const setModo = (id, modo) => setModoEntrada(prev => ({ ...prev, [id]: modo }));
  const getQtd  = (id) => qtdEntrada[id] ?? "";
  const setQtd  = (id, v) => setQtdEntrada(prev => ({ ...prev, [id]: v }));

  const limparRascunho = (setter, id) =>
    setter(prev => { const proximo = { ...prev }; delete proximo[id]; return proximo; });

  /** Grava e diz na tela o que aconteceu. Devolve true quando salvou de verdade. */
  const gravar = async (productId, oQue, escrever) => {
    setSalvando(prev => ({ ...prev, [productId]: true }));
    const { error } = (await escrever()) ?? {};
    setSalvando(prev => ({ ...prev, [productId]: false }));
    if (error) {
      setErro(`Não foi possível salvar ${oQue}. Confira a conexão e tente de novo.`);
      return false;
    }
    setErro(null);
    return true;
  };

  const handleDireto = async (p, novaQty) => {
    if (!Number.isFinite(novaQty) || novaQty < 0) return false;
    return gravar(p.id, `o saldo de ${p.name}`, () => updateEstoque(p.id, novaQty));
  };

  /** Operador saiu do campo de saldo (ou apertou Enter): grava o que ele digitou. */
  const confirmarSaldo = async (p) => {
    const digitado = rascunhoSaldo[p.id];
    if (digitado === undefined) return;         // nem mexeu no campo
    const nova  = lerQuantidade(digitado);
    const atual = estoque[p.id] ?? 0;
    if (nova === null || nova === atual) {      // vazio, inválido ou igual: só volta ao saldo atual
      limparRascunho(setRascunhoSaldo, p.id);
      return;
    }
    if (await handleDireto(p, nova)) limparRascunho(setRascunhoSaldo, p.id);
  };

  /** Idem para o mínimo. Campo vazio não vira mínimo 0 — isso desligaria o alerta do produto. */
  const confirmarMinimo = async (p) => {
    const digitado = rascunhoMinimo[p.id];
    if (digitado === undefined) return;
    const novo  = lerQuantidade(digitado);
    const atual = estoqueMinimos[p.id] ?? MINIMO_FALLBACK;
    if (novo === null || novo === atual) {
      limparRascunho(setRascunhoMinimo, p.id);
      return;
    }
    if (await gravar(p.id, `o mínimo de ${p.name}`, () => setMinimoEstoque(p.id, novo))) {
      limparRascunho(setRascunhoMinimo, p.id);
    }
  };

  const handleAdicionar = async (p) => {
    const raw = lerQuantidade(getQtd(p.id));
    if (!raw || raw <= 0) return;
    const modo  = getModo(p);
    const units = getUnidadesCompra(p);
    // Manda o QUANTO ENTROU, nunca o saldo total. Antes esta função lia o
    // saldo da memória da tela, somava e gravava o total: duas pessoas
    // conferindo a mesma nota ao mesmo tempo apagavam a entrada uma da
    // outra. Quem soma agora é o banco (entradaEstoque → RPC atômica).
    const delta = modo === "estoque" ? raw : compraParaEstoque(raw, units[modo]);
    // A conversão pode zerar o que o operador digitou: a unidade de compra que
    // estava selecionada deixou de existir (produto editado em outro aparelho),
    // o fator cadastrado não é um número, ou a quantidade é menor que a menor
    // fração que o saldo guarda. Antes seguia em frente com delta 0 — o campo
    // limpava, a tela não reclamava e o saldo não mexia.
    if (!(delta > 0)) {
      setErro(`A entrada de ${p.name} ficou em 0 depois da conversão. Confira a unidade de compra do produto e a quantidade digitada.`);
      return;
    }
    if (await gravar(p.id, `a entrada de ${p.name}`, () => entradaEstoque(p.id, delta))) setQtd(p.id, "");
  };

  const abrirAuth = () => {
    setSenha(""); setSenhaErro(""); setSenhaVis(false);
    setShowAuth(true);
  };

  const confirmarSenha = async () => {
    if (!senha || verificando) return;
    setVerificando(true);
    const { ok, erro } = await verificarSenhaAdmin(senha);
    setVerificando(false);
    if (ok) {
      setAutorizado(true);
      setShowAuth(false);
    } else {
      setSenhaErro(erro || "Senha incorreta. Apenas administrador ou gerente pode liberar.");
    }
  };

  const bloquear = () => {
    setAutorizado(false);
    setModoEntrada({});
    setQtdEntrada({});
  };

  return {
    busca, setBusca, categoria, setCategoria, salvando, setSalvando, sortKey, setSortKey,
    sortDir, setSortDir, modoEntrada, setModoEntrada, qtdEntrada, setQtdEntrada, rascunhoSaldo,
    setRascunhoSaldo, rascunhoMinimo, setRascunhoMinimo, erro, setErro, loading, products,
    estoque, estoqueMinimos, updateEstoque, entradaEstoque, setMinimoEstoque, width, autorizado,
    setAutorizado, showAuth, setShowAuth, senha, setSenha, senhaErro, setSenhaErro, senhaVis,
    setSenhaVis, verificando, setVerificando, carregando, sz, categorias, lista, toggleSort,
    totalSaldo, situacao, semEstoque, estoqueBaixo, getModo, setModo, getQtd, setQtd,
    limparRascunho, gravar, handleDireto, confirmarSaldo, confirmarMinimo, handleAdicionar,
    abrirAuth, confirmarSenha, bloquear,
  };
}
