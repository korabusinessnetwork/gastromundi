import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CatalogoContext } from "./CatalogoContext";
import { useFuncaoEstavel } from "@/hooks/useFuncaoEstavel";
import { useOffline } from "./OfflineContext";
import { useSessao } from "./SessaoContext";
import {
  listarSaldos, garantirLinhaDeSaldo, gravarSaldo, gravarMinimo, baixarEstoqueNoBanco,
  entradaEstoqueNoBanco, baixarEstoqueSubprodutoNoBanco, assinarSaldos,
} from "@/features/estoque/dados/saldos";
import { listarProdutosAtivos, criarProduto, atualizarProduto, excluirProduto } from "@/features/cardapio/dados/produtos";
import { removerGrupoDaCategoria, definirGrupoDaCategoria } from "@/features/cardapio/dados/gruposCategoria";
import { emitirEvento } from "@/lib/jarvas";
import { processarBaixaEstoque, gerarAlertaBaixaFalhou, isRpcAusente } from "@/features/estoque/regras/estoque";
import { isErroDeRede } from "@/lib/offline/rede";
import { reportarFalha, reportarInconsistencia } from "@/lib/observabilidade";

/**
 * Dono do estado do catálogo (tarefa 2.9 do plano de refatoração): produtos,
 * saldos e mínimos de estoque, grupos de categoria, as ações que mexem neles e
 * o tempo real do estoque entre aparelhos.
 *
 * Quem lê ou age usa `useCatalogo()`. Quem CARREGA (a abertura do app, do
 * banco ou da cópia offline) usa o canal interno `useCatalogoCarga()`, que só
 * o `AppProvider` deve chamar.
 *
 * O usuário logado (para os eventos do Jarvas) vem do `SessaoProvider` e a fila
 * offline do `OfflineProvider`, os dois por fora deste.
 */
const CatalogoCargaContext = createContext(null);

export function useCatalogoCarga() {
  const ctx = useContext(CatalogoCargaContext);
  if (!ctx) throw new Error("useCatalogoCarga deve ser usado dentro de <CatalogoProvider>");
  return ctx;
}

/**
 * Aplica sobre um mapa local (`{ produtoId: número }`) um valor que chegou do
 * realtime. Valor que não é número finito é IGNORADO: devolve o mapa anterior
 * intacto, e o dispositivo continua com o que já tinha.
 *
 * Antes o código fazia `Number(payload.new.minimo)` cru, e `Number` não avisa
 * quando não tem número: `Number(null)` é 0 e `Number(undefined)` é NaN. Um
 * evento sem a coluna `minimo` zerava o mínimo em TODOS os outros aparelhos e
 * desligava o alerta de estoque baixo sem ninguém tocar em nada. Um NaN em
 * `quantidade` era pior: a tela mostrava saldo 0 pintado de verde e escrito
 * "OK", porque nenhuma comparação com NaN é verdadeira.
 */
export function aplicarNumeroRemoto(mapa, produtoId, valor) {
  // `numeric` do Postgres chega como número ou como string no JSON do evento.
  // Qualquer outra coisa é ruído: `Number(null)` é 0 e `Number([])` também.
  if (typeof valor !== "number" && typeof valor !== "string") return mapa;
  if (typeof valor === "string" && valor.trim() === "") return mapa;
  const n = Number(valor);
  if (!Number.isFinite(n)) return mapa;
  if (mapa[produtoId] === n) return mapa; // nada mudou: não re-renderiza
  return { ...mapa, [produtoId]: n };
}

export function CatalogoProvider({ children }) {
  // O usuário logado mora no SessaoProvider, por fora deste (tarefa 2.9).
  const { currentUser } = useSessao();
  // A fila offline mora no OfflineProvider, por fora deste (tarefa 2.9).
  const { enfileirarOffline } = useOffline();
  const [products,        setProductsLocal]        = useState([]);
  const [estoque,         setEstoqueLocal]         = useState({});
  const [estoqueMinimos,  setEstoqueMinimosLocal]  = useState({});
  const [gruposCategoria, setGruposCategoriaLocal] = useState([]); // C3: grupos (comida/bebida/café)
  const [categoriaGrupos, setCategoriaGruposLocal] = useState([]); // C3: categoria para grupo_id (linhas cruas)

  // ── Actions: Products ─────────────────────────────────────────
  const addProduct = async (product) => {
    // omite o id gerado pelo app — o banco gera o uuid via default
    const { id: _ignored, ...payload } = product;
    const { data, error } = await criarProduto(payload);
    if (data) {
      setProductsLocal(prev => [...prev, data]);
      // Produto nasce com linha de estoque (saldo 0, mínimo padrão do banco).
      // Sem ela, a tela de Estoque mostrava "0" para um produto que na verdade
      // não era contado, e a venda não tinha o que descontar. A RPC de baixa
      // também cria a linha (migration 20260919); aqui é para a linha existir
      // ANTES da primeira venda, e não a partir dela.
      const { error: erroEstoque } = await garantirLinhaDeSaldo(data.id);
      // Falhar aqui não desfaz o produto: ele existe e é vendável. A RPC de
      // baixa cria a linha na primeira venda, então o furo não volta — mas
      // fica o rastro de que a linha não nasceu junto.
      if (erroEstoque) reportarFalha(erroEstoque, { acao: "addProduct:estoque", tabela: "estoque", produto_id: data.id });
      setEstoqueLocal(prev => (data.id in prev ? prev : { ...prev, [data.id]: 0 }));
    }
    return { data, error };
  };

  const updateProduct = async (id, changes) => {
    // .select() após o update: PostgREST devolve sucesso HTTP com 0 linhas
    // quando a RLS filtra tudo (ex.: gerente edita preço, mas a policy exige
    // admin) ou o id não bate. Sem checar as linhas, a UI fingiria sucesso
    // sem nada persistir (mesmo padrão do updateUser/cancelarVendaFechada).
    const { data, error } = await atualizarProduto(id, changes);
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "updateProduct", tabela: "products", id });
      return { error: { code: "no_rows_updated", message: "Nenhuma linha atualizada, sem permissão ou produto inexistente." } };
    }
    setProductsLocal(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    return { error: null };
  };

  const removeProduct = async (id) => {
    // .select() após o delete: 0 linhas removidas (RLS ou id inexistente)
    // resolve { error: null } no supabase-js — checagem evita sucesso falso.
    const { data, error } = await excluirProduto(id);
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "removeProduct", tabela: "products", id });
      return { error: { code: "no_rows_deleted", message: "Nenhuma linha removida, sem permissão ou produto inexistente." } };
    }
    setProductsLocal(prev => prev.filter(p => p.id !== id));
    return { error: null };
  };

  // Recarrega o cardápio inteiro do banco — usado após operações em lote
  // que gravam fora das actions acima (ex.: importação de planilha).
  const recarregarProdutos = async () => {
    const { data, error } = await listarProdutosAtivos();
    if (!error && data) setProductsLocal(data);
    return { error };
  };

  // Recarrega saldos/mínimos do banco — usado após importação em lote
  // (não depende do Realtime estar habilitado na tabela).
  const recarregarEstoque = async () => {
    const { data, error } = await listarSaldos();
    if (!error && data) {
      const qtds = {}, minimos = {};
      for (const row of data) {
        qtds[row.produto_id]    = Number(row.quantidade);
        minimos[row.produto_id] = Number(row.minimo);
      }
      setEstoqueLocal(qtds);
      setEstoqueMinimosLocal(minimos);
    }
    return { error };
  };

  // ── Actions: Estoque ──────────────────────────────────────────
  const updateEstoque = async (productId, qty) => {
    // Quantidade não numérica virava NaN aqui (`Math.max(0, undefined)` é NaN):
    // a tela passava a mostrar "NaN" no saldo e o banco recusava a gravação com
    // um erro que ninguém lia. Recusa antes de encostar no estado.
    // E `Number(null)` e `Number("")` são 0: um valor perdido no caminho zerava
    // o saldo do produto em silêncio. Zerar é operação legítima, mas só quando
    // alguém manda o número 0.
    const vazio = qty === null || qty === undefined || (typeof qty === "string" && qty.trim() === "");
    const numero = vazio ? NaN : Number(qty);
    if (!Number.isFinite(numero)) {
      return { error: { message: "Quantidade inválida." } };
    }
    const novaQtd = Math.max(0, numero);
    const tinhaLinha = estoque[productId] !== undefined;
    const anterior = estoque[productId];
    setEstoqueLocal(prev => ({ ...prev, [productId]: novaQtd }));
    const { error } = await gravarSaldo(productId, novaQtd);
    if (error) {
      console.error("updateEstoque error:", error);
      reportarFalha(error, { acao: "updateEstoque", tabela: "estoque", produto_id: productId });
      setEstoqueLocal(prev => {
        const next = { ...prev };
        // Produto que ainda não tinha linha de estoque volta a NÃO ter. Deixar a
        // chave valendo 0 fazia a tela e o Jarvas tratarem como ruptura um
        // produto que simplesmente não controla estoque.
        if (tinhaLinha) next[productId] = anterior;
        else delete next[productId];
        return next;
      });
      return { error };
    }
    emitirEvento("estoque.ajustado", "estoque", { produto_id: productId, quantidade: novaQtd }, currentUser?.username);
    return { error: null };
  };

  // Baixa atômica no servidor (evita race condition entre dispositivos descontando ao mesmo tempo).
  // Decisão de alerta de mínimo delegada a processarBaixaEstoque (src/features/estoque/regras/estoque.js) — testável isoladamente.
  const baixarEstoque = async (productId, qty) => {
    const anterior = Number(estoque[productId] ?? 0);
    setEstoqueLocal(prev => ({ ...prev, [productId]: Math.max(0, anterior - qty) })); // otimista

    // Identidade desta baixa. Gerada UMA vez aqui e repetida no reenvio:
    // é o que faz a RPC reconhecer "já apliquei essa" quando a primeira
    // tentativa gravou mas a resposta se perdeu na queda de conexão.
    const opId = crypto.randomUUID();
    const produto = products.find(p => String(p.id) === String(productId));
    const nomeProduto = produto?.name ?? `Produto ${productId}`;
    const { quantidade, error } = await processarBaixaEstoque({
      produtoId: productId,
      qty,
      quantidadeAnterior: anterior,
      nomeProduto,
      minimoFallback: estoqueMinimos[productId] ?? 10,
      usuario: currentUser?.username,
      chamarRpc: (id, q) => baixarEstoqueNoBanco(id, q, opId),
    });
    if (error) {
      // Sem internet: mantém o desconto otimista e agenda a RPC para quando
      // a conexão voltar, carregando o MESMO opId — reenviar não desconta
      // duas vezes (migration 20260830_idempotencia_baixa_estoque.sql).
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "rpc_baixar_estoque", produtoId: productId, qtd: qty, opId });
        return { error: null, offline: true };
      }
      // Baixa não confirmada no servidor: desfaz o desconto otimista e deixa
      // rastro visível para o Jarvas/gestor (TD012 — antes falhava em silêncio).
      setEstoqueLocal(prev => ({ ...prev, [productId]: anterior }));
      reportarFalha(error, { acao: "baixarEstoque", tabela: "estoque", produto_id: productId, quantidade: qty });
      emitirEvento("estoque.baixa.falhou", "estoque", {
        produto_id: productId,
        quantidade: qty,
        erro: error?.message ?? error?.code ?? String(error),
      }, currentUser?.username);
      // Sentry, evento e log são para quem desenvolve. O alerta do Jarvas é o
      // único destes que o gestor abre — sem ele o furo de inventário só
      // aparece na contagem física (TD012).
      void gerarAlertaBaixaFalhou(
        { produtoId: productId, nome: nomeProduto, quantidade: qty, erro: error },
        currentUser?.username,
      );
      return { error };
    }

    setEstoqueLocal(prev => ({ ...prev, [productId]: quantidade }));
    emitirEvento("estoque.baixa", "estoque", { produto_id: productId, quantidade: qty }, currentUser?.username);
    return { error: null };
  };

  // Entrada de mercadoria atômica no servidor (Run 4, leva 4).
  //
  // Antes a tela somava no saldo que ELA tinha em memória e gravava o
  // TOTAL absoluto por upsert. Dois aparelhos conferindo a mesma nota ao
  // mesmo tempo perdiam mercadoria: saldo 40, um lança 5 e grava 45, o
  // outro (que ainda via 40) lança 3 e grava 43 — os 5 do primeiro somem
  // sem nenhum erro na tela. Agora quem soma é o banco
  // (migration 20260901_entrada_estoque_atomica.sql) e a tela manda só o
  // quanto entrou. O opId impede que um reenvio some duas vezes.
  const entradaEstoque = async (productId, delta) => {
    const quantoEntrou = Number(delta);
    if (!Number.isFinite(quantoEntrou) || quantoEntrou <= 0) {
      return { error: { message: "Quantidade de entrada inválida." } };
    }
    const tinhaLinha = estoque[productId] !== undefined;
    const anterior = Number(estoque[productId] ?? 0);
    setEstoqueLocal(prev => ({ ...prev, [productId]: anterior + quantoEntrou })); // otimista

    const opId = crypto.randomUUID();
    let data = null, error = null;
    try {
      ({ data, error } = await entradaEstoqueNoBanco(productId, quantoEntrou, opId));
    } catch (err) {
      error = { message: err?.message ?? String(err) };
    }

    // Banco ainda sem a função (app publicado antes da migration rodar):
    // usa o caminho antigo em vez de impedir o recebimento de mercadoria.
    // Volta a ser um read-modify-write nessa janela — é o comportamento
    // que já existia, não uma piora.
    if (error && isRpcAusente(error)) {
      return updateEstoque(productId, anterior + quantoEntrou);
    }
    if (error) {
      setEstoqueLocal(prev => {
        const next = { ...prev };
        // Produto que ainda não tinha linha de estoque volta a NÃO ter. Deixar
        // a chave valendo 0 faria a tela e o Jarvas tratarem como ruptura um
        // produto que simplesmente não controla estoque.
        if (tinhaLinha) next[productId] = anterior;
        else delete next[productId];
        return next;
      });
      reportarFalha(error, { acao: "entradaEstoque", tabela: "estoque", produto_id: productId, quantidade: quantoEntrou });
      emitirEvento("estoque.entrada.falhou", "estoque", {
        produto_id: productId,
        quantidade: quantoEntrou,
        erro: error?.message ?? error?.code ?? String(error),
      }, currentUser?.username);
      return { error };
    }

    // Saldo que o banco confirmou — pode diferir do otimista quando outro
    // aparelho mexeu no mesmo produto, e é ele que vale.
    const linha = Array.isArray(data) ? data[0] : data;
    if (linha?.quantidade != null) {
      setEstoqueLocal(prev => ({ ...prev, [productId]: Number(linha.quantidade) }));
    }
    if (linha?.minimo != null) {
      setEstoqueMinimosLocal(prev => ({ ...prev, [productId]: Number(linha.minimo) }));
    }
    emitirEvento("estoque.entrada", "estoque", { produto_id: productId, quantidade: quantoEntrou }, currentUser?.username);
    return { error: null };
  };

  // B4 — baixa atômica de subproduto (componentes de combo). Sem estado
  // otimista local: o saldo de subproduto não aparece no PDV, só no
  // cadastro (SubprodutosView recarrega do banco). Nunca deve travar a
  // venda: erro vira evento para o Jarvas, não bloqueio.
  const baixarEstoqueSubproduto = async (subprodutoId, qtd, nome) => {
    // Mesma chave de idempotência da baixa de produto (ver acima).
    const opId = crypto.randomUUID();
    let error = null;
    let data = null;
    try {
      ({ data, error } = await baixarEstoqueSubprodutoNoBanco(subprodutoId, qtd, opId));
    } catch (err) {
      error = { message: err?.message ?? String(err) };
    }
    // RPC sem erro e sem linha nenhuma de volta = o UPDATE não achou o
    // subproduto em `estoque_subprodutos`. Nada foi descontado, e até aqui isso
    // passava como sucesso — a venda fechava e o saldo não mexia, em silêncio.
    // Diferente da baixa de produto, aqui a linha NÃO é criada: em subproduto
    // ela nasce junto com o cadastro, então faltar é inconsistência de dados
    // que precisa aparecer, não ser remendada.
    if (!error && Array.isArray(data) && data.length === 0) {
      error = {
        code: "estoque_sem_linha",
        message: "Estoque não descontado: o subproduto não tem linha de estoque neste estabelecimento.",
      };
    }
    if (error) {
      if (isErroDeRede(error)) {
        // `nome` viaja junto: se esta op for recusada lá no dreno, o alerta
        // precisa dizer "Queijo mussarela" e não "Item 42" — o subproduto não
        // está no estado local do provider para ser resolvido depois.
        enfileirarOffline({ tipo: "rpc_baixar_estoque_subproduto", subprodutoId, qtd, nome: nome ?? null, opId });
        return { error: null, offline: true };
      }
      reportarFalha(error, { acao: "baixarEstoqueSubproduto", tabela: "estoque", subproduto_id: subprodutoId, quantidade: qtd });
      emitirEvento("estoque.baixa.falhou", "estoque", {
        subproduto_id: subprodutoId,
        nome: nome ?? null,
        quantidade: qtd,
        erro: error?.message ?? error?.code ?? String(error),
      }, currentUser?.username);
      void gerarAlertaBaixaFalhou(
        { subprodutoId, nome: nome ?? null, quantidade: qtd, erro: error },
        currentUser?.username,
      );
      return { error };
    }
    emitirEvento("estoque.baixa", "estoque", { subproduto_id: subprodutoId, nome: nome ?? null, quantidade: qtd }, currentUser?.username);
    return { error: null };
  };

  const setMinimoEstoque = async (productId, minimo) => {
    const novoMinimo = Math.max(0, Number(minimo) || 0);
    const anterior = estoqueMinimos[productId];
    setEstoqueMinimosLocal(prev => ({ ...prev, [productId]: novoMinimo }));
    const { error } = await gravarMinimo(productId, novoMinimo);
    if (error) {
      console.error("setMinimoEstoque error:", error);
      reportarFalha(error, { acao: "setMinimoEstoque", tabela: "estoque", produto_id: productId });
      setEstoqueMinimosLocal(prev => {
        const next = { ...prev };
        if (anterior === undefined) delete next[productId];
        else next[productId] = anterior;
        return next;
      });
      return { error };
    }
    return { error: null };
  };

  // config tem PK composta (tenant_id, key) — migração 20260738. O
  // tenant_id é resolvido pelo DEFAULT tenant_atual_id() no banco (não vai
  // no payload), mas o onConflict precisa nomear as duas colunas da PK.
  // Cada setter grava otimista, checa o .error do upsert (a RLS de config
  // exige gerente/admin — o papel caixa falhava em silêncio) e desfaz o
  // estado local quando a persistência falha, devolvendo { error }.
  // ── Actions: Grupos de categoria (C3) ─────────────────────────
  // Mapeia uma categoria (texto livre de products.category) a um grupo.
  // grupoId null/"" remove o mapeamento.
  const setCategoriaGrupo = async (category, grupoId) => {
    const cat = String(category ?? "").trim();
    if (!cat) return { error: { message: "Categoria inválida." } };
    // P8 — captura o estado anterior antes do otimista para reverter no erro
    // (senão a UI mantém o mapeamento aplicado enquanto o banco não gravou).
    const anterior = categoriaGrupos;
    if (grupoId == null || grupoId === "") {
      setCategoriaGruposLocal(prev => prev.filter(r => r.category !== cat));
      const { error } = await removerGrupoDaCategoria(cat);
      if (error) {
        reportarFalha(error, { acao: "setCategoriaGrupo", tabela: "categoria_grupo", operacao: "delete", category: cat });
        setCategoriaGruposLocal(anterior);
        return { error };
      }
      return { error: null };
    }
    const gid = Number(grupoId);
    setCategoriaGruposLocal(prev => {
      const outros = prev.filter(r => r.category !== cat);
      return [...outros, { category: cat, grupo_id: gid }];
    });
    const { error } = await definirGrupoDaCategoria(cat, gid);
    if (error) {
      reportarFalha(error, { acao: "setCategoriaGrupo", tabela: "categoria_grupo", operacao: "upsert", category: cat });
      setCategoriaGruposLocal(anterior);
      return { error };
    }
    return { error: null };
  };

  // ── Realtime: estoque (sincroniza saldo/mínimo entre dispositivos) ──
  // Requer Realtime habilitado na tabela `estoque` (Database → Replication).
  useEffect(() => {
    return assinarSaldos((payload) => {
        const produtoId = payload.new?.produto_id ?? payload.old?.produto_id;
        // Sem produto no evento não há o que aplicar. Antes entrava uma chave
        // "undefined" no mapa de estoque de todo mundo.
        if (produtoId === null || produtoId === undefined) return;
        if (payload.eventType === "DELETE") {
          setEstoqueLocal(prev => { const { [produtoId]: _omit, ...rest } = prev; return rest; });
          setEstoqueMinimosLocal(prev => { const { [produtoId]: _omit, ...rest } = prev; return rest; });
          return;
        }
        setEstoqueLocal(prev => aplicarNumeroRemoto(prev, produtoId, payload.new?.quantidade));
        setEstoqueMinimosLocal(prev => aplicarNumeroRemoto(prev, produtoId, payload.new?.minimo));
    });
  }, []);

  // ── Carga (só o AppProvider chama) ──────────────────────────────
  const valorCarga = useMemo(() => ({
    definirProdutos: setProductsLocal,
    definirSaldos: setEstoqueLocal,
    definirMinimos: setEstoqueMinimosLocal,
    definirGruposCategoria: setGruposCategoriaLocal,
    definirCategoriaGrupos: setCategoriaGruposLocal,
  }), []);

  // ── Valor memorizado (ver as tarefas 2.2 e 2.5) ─────────────────
  // Produtos, saldos de estoque e grupos de categoria. O mapa categoria para
  // grupo é recalculado só quando os grupos mudam: a versão da fachada é refeita
  // a cada render e quebraria a memorização.
  const categoriaGrupoMapMemo = useMemo(() => {
    const porId = {};
    for (const g of gruposCategoria) porId[g.id] = g.nome;
    const mapa = {};
    for (const r of categoriaGrupos) { const nome = porId[r.grupo_id]; if (nome) mapa[r.category] = nome; }
    return mapa;
  }, [gruposCategoria, categoriaGrupos]);
  const addProductEstavel             = useFuncaoEstavel(addProduct);
  const updateProductEstavel          = useFuncaoEstavel(updateProduct);
  const removeProductEstavel          = useFuncaoEstavel(removeProduct);
  const recarregarProdutosEstavel     = useFuncaoEstavel(recarregarProdutos);
  const updateEstoqueEstavel          = useFuncaoEstavel(updateEstoque);
  const baixarEstoqueEstavel          = useFuncaoEstavel(baixarEstoque);
  const entradaEstoqueEstavel         = useFuncaoEstavel(entradaEstoque);
  const baixarEstoqueSubprodutoEstavel = useFuncaoEstavel(baixarEstoqueSubproduto);
  const setMinimoEstoqueEstavel       = useFuncaoEstavel(setMinimoEstoque);
  const recarregarEstoqueEstavel      = useFuncaoEstavel(recarregarEstoque);
  const setCategoriaGrupoEstavel      = useFuncaoEstavel(setCategoriaGrupo);
  const valorCatalogo = useMemo(() => ({
    products, estoque, estoqueMinimos, gruposCategoria, categoriaGrupos,
    categoriaGrupoMap: categoriaGrupoMapMemo,
    addProduct: addProductEstavel, updateProduct: updateProductEstavel,
    removeProduct: removeProductEstavel, recarregarProdutos: recarregarProdutosEstavel,
    updateEstoque: updateEstoqueEstavel, baixarEstoque: baixarEstoqueEstavel,
    entradaEstoque: entradaEstoqueEstavel, baixarEstoqueSubproduto: baixarEstoqueSubprodutoEstavel,
    setMinimoEstoque: setMinimoEstoqueEstavel, recarregarEstoque: recarregarEstoqueEstavel,
    setCategoriaGrupo: setCategoriaGrupoEstavel,
  }), [products, estoque, estoqueMinimos, gruposCategoria, categoriaGrupos, categoriaGrupoMapMemo,
    addProductEstavel, updateProductEstavel, removeProductEstavel, recarregarProdutosEstavel,
    updateEstoqueEstavel, baixarEstoqueEstavel, entradaEstoqueEstavel, baixarEstoqueSubprodutoEstavel,
    setMinimoEstoqueEstavel, recarregarEstoqueEstavel, setCategoriaGrupoEstavel]);

  return (
    <CatalogoCargaContext.Provider value={valorCarga}>
      <CatalogoContext.Provider value={valorCatalogo}>
        {children}
      </CatalogoContext.Provider>
    </CatalogoCargaContext.Provider>
  );
}
