import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useSessao, useConfig, useCatalogo, useComandas, useCaixa } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { useResponsive, useMesas } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { FEATURE_BARCODE_SCANNER } from "@/constants/features";
import { useBarcodeScanner } from "@/utils/useBarcodeScanner";
import { listarCombosParaVenda } from "@/features/cardapio/dados/combos";
import { resumoErro } from "@/lib/observabilidade";
import { mesmoItemDeVenda } from "@/lib/combos";
import { buscarClientePorId } from "@/lib/clientes";
import { imprimirLancamento } from "@/lib/impressao/despacho";
import { chaveLancamento, registroLancamentos } from "@/lib/impressao/lancamentos";
import { useEstadoTransferencia } from "@/features/pdv/hooks/useEstadoTransferencia";
import { acoesTransferencia } from "@/features/pdv/acoesTransferencia";
import { useFinalizarPagamento } from "@/components/desktop/views/PDVView/useFinalizarPagamento";
import { useTravaComanda } from "@/hooks/useTravaComanda";
import { travadaPorOutro, nomeTrava } from "@/lib/comandaLock";
import { totalItensAtivos } from "@/lib/comandaItens";
import { useCancelarComanda } from "@/components/desktop/views/PDVView/useCancelarComanda";
import { fmtComanda } from "@/components/desktop/views/PDVView/pdv/apoio";
import { useEstadoJanelasPdv } from "./useEstadoJanelasPdv";
import { useEstadoCancelamentoComanda } from "./useEstadoCancelamentoComanda";
import { useEstadoMesaCliente } from "./useEstadoMesaCliente";

// Estado e ações da Frente de Caixa: comandas, carrinho, lançamento, finalização,
// cancelamento, mesa, cliente, leitor de código de barras e combos.
export function usePdv({ notify }) {
  const { currentUser, users, loading: bootstrapLoading } = useSessao();
  const { metodosCustom, diasAlertaValidade } = useConfig();
  const { products, estoque, estoqueMinimos } = useCatalogo();
  const { pending, addPending, updatePending, removePending, lancadas, addLancada } = useComandas();
  const { caixaAberto, sales } = useCaixa();
  const { finalizarPagamento } = useFinalizarPagamento();
  const { cancelarComanda } = useCancelarComanda();

  const { width } = useResponsive();
  const sz = getSizes(width);
  // isMob alinhado com CartPanel: mobile/tablet usam tabs (cartWidth===0)
  const isMob = sz.cartWidth === 0;
  // Celular estreito (<768): o header e as barras de ação empilham em coluna
  // em vez de usar o grid de 3 colunas do desktop, que espremia o título
  // ("Frente / de / Caixa") e cortava o botão "Nova Comanda" fora da tela.
  const isCel = width < 768;
  const { mesas, loading: mesasLoading, atualizarStatusMesa } = useMesas();
  const location = useLocation();

  // Reset to lista whenever the sidebar navigates to this page
  useEffect(() => {
    setMode("grid");
    setSelected(null);
    setCartItems([]);
  }, [location.key]);

  // "grid" (lista) | "mapa" | "abertas" (só comandas pendentes) | "pedido" | "checkout" — abre direto na lista
  const [mode,        setMode]        = useState("grid");
  // Modos de "painel" (com tab bar, alertas e ações de topo) — tudo que não é pedido/checkout
  const emPainel = mode === "grid" || mode === "mapa" || mode === "abertas" || mode === "reservas";
  // No celular a Frente de Caixa é só BUSCA + LISTA: cabeçalho, Saldo do Dia,
  // Nova Comanda, alertas e abas saem da tela. Antes, tudo isso empilhado
  // empurrava a primeira comanda para ~65% da altura — o operador abria o PDV
  // e não via comanda nenhuma. Abrir comanda continua a um toque: o slot vazio
  // da lista ("1 · Disponível") e o número digitado na busca chamam onOpenEmpty.
  const painelEnxuto = isCel && emPainel;
  // Sem abas no celular, "mapa"/"comandas abertas" viram becos sem saída (não há
  // como voltar pra lista). Se a janela encolher nesses modos, volta pra lista.
  useEffect(() => {
    if (isCel && (mode === "mapa" || mode === "abertas" || mode === "reservas")) setMode("grid");
  }, [isCel, mode]);

  const [selected,    setSelected]    = useState(null);
  const [cartItems,   setCartItems]   = useState([]);
  const [salvando,    setSalvando]    = useState(false);
  const [abaAtiva,    setAbaAtiva]    = useState("produtos"); // mobile tab

  const [toast,         setToast]         = useState(false);
  const [alertaAberto,  setAlertaAberto]  = useState(false);
  // Modal do cupom NFC-e (Leva 7): abre em 'emitindo' ao finalizar com o
  // add-on nfe ativo e se atualiza para 'concluido' quando a emissão resolve.
  const [cupomNfce,     setCupomNfce]     = useState({ aberta: false, estado: "emitindo", resultado: null, venda: null });
  const [alertaValidadeAberto, setAlertaValidadeAberto] = useState(false);
  const [buscaComanda,  setBuscaComanda]  = useState("");

  const {
    showNova, setShowNova, nomeComanda, setNomeComanda, criando, setCriando, confirmCancelar,
    setConfirmCancelar, confirmCancelarMotivo, setConfirmCancelarMotivo, showTransferir,
    setShowTransferir, showSaldo, setShowSaldo, saldoSenha, setSaldoSenha, saldoSenhaErro,
    setSaldoSenhaErro, saldoAutorizado, setSaldoAutorizado, saldoSenhaVis, setSaldoSenhaVis,
  } = useEstadoJanelasPdv();

  // Transferência de itens: estado aqui, ações mais abaixo.
  const {
    transQtds, setTransQtds, transDestino, setTransDestino, transMode, setTransMode, transNumero,
    setTransNumero, transNomeNova, setTransNomeNova, transNumeroErro, setTransNumeroErro,
    transferindo, setTransferindo,
  } = useEstadoTransferencia();
  const {
    showCancelarComanda, setShowCancelarComanda, cancelarSenha, setCancelarSenha,
    cancelarSenhaErro, setCancelarSenhaErro, cancelarSenhaVis, setCancelarSenhaVis,
    cancelarAutorizado, setCancelarAutorizado, cancelarMotivo, setCancelarMotivo,
    cancelandoComanda, setCancelandoComanda,
  } = useEstadoCancelamentoComanda();

  const {
    showMesa, setShowMesa, mesaInput, setMesaInput, apelidoInput, setApelidoInput,
    mesaPendingOrder, setMesaPendingOrder, salvandoMesa, setSalvandoMesa, showCliente,
    setShowCliente, clientePendingOrder, setClientePendingOrder, clienteSel, setClienteSel,
    salvandoCliente, setSalvandoCliente,
  } = useEstadoMesaCliente();

  // ── Barcode scanner (FEATURE_BARCODE_SCANNER) ─────────────────
  const [barcodeInputOpen,  setBarcodeInputOpen]  = useState(false);
  const [barcodeValue,      setBarcodeValue]      = useState("");
  const [barcodeFeedback,   setBarcodeFeedback]   = useState(null); // null | "ok" | "notfound"

  const abertas = pending.filter(o => o.status !== "closed");

  // ── Combos ativos (B4) — vendáveis no PDV ─────────────────────
  // Carrega uma vez por entrada na tela; a receita (subprodutos com
  // controla_estoque) viaja junto no item do carrinho para a baixa de
  // estoque dos componentes na finalização.
  const [combos, setCombos] = useState([]);
  useEffect(() => {
    let ativo = true;
    listarCombosParaVenda()
      .then(({ data, error }) => {
        if (error) { console.error("[pdv] erro ao carregar combos:", resumoErro(error)); return; }
        if (ativo) setCombos(data ?? []);
      });
    return () => { ativo = false; };
  }, []);

  // ── Ressincroniza a comanda aberta com o realtime ─────────────
  // Sem isto, `selected` fica congelado no snapshot de quando a comanda
  // foi aberta: itens lançados pelo Palm não entravam na conta e a
  // finalização apagava (sem cobrar) tudo que chegou depois.
  useEffect(() => {
    if (!selected || selected._virtual) return;
    const fresca = pending.find(o => o.id === selected.id);
    if (fresca) {
      if (fresca !== selected) setSelected(fresca);
      return;
    }
    // A comanda sumiu do banco. Fluxos locais (finalizar/cancelar/
    // transferir) navegam por conta própria — só reagimos quando foi
    // OUTRO dispositivo que encerrou, para não cobrar de novo.
    if (salvando || transferindo || cancelandoComanda) return;
    setSelected(null);
    setCartItems([]);
    setMode("grid");
    notify?.(`${fmtComanda(selected.comanda)} foi encerrada em outro dispositivo.`, "err");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, selected, salvando, transferindo, cancelandoComanda]);

  // ── Trava de edição (Leva 14) ─────────────────────────────────
  // Enquanto o caixa está com a comanda aberta (pedido/checkout), o Palm
  // não mexe nela — e vice-versa. A checagem síncrona (emUsoPorOutro)
  // previne a entrada; o hook adquire a trava de verdade no banco e, se
  // outro dispositivo ganhou a corrida, devolve `bloqueio`.
  const travaAtiva = (mode === "pedido" || mode === "checkout") && !!selected && !selected._virtual;
  const { bloqueio } = useTravaComanda(selected, travaAtiva);
  const emUsoPorOutro = (order) => travadaPorOutro(order, currentUser?.username);

  // Perdeu a corrida da trava (outro dispositivo abriu antes): sai da
  // comanda com aviso em vez de deixar editar às cegas.
  useEffect(() => {
    if (!bloqueio || !travaAtiva || salvando || transferindo || cancelandoComanda) return;
    notify?.(`${fmtComanda(selected.comanda)} está em uso por ${bloqueio.nome}.`, "err");
    setMode("grid");
    setSelected(null);
    setCartItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueio]);

  // ── Selecionar comanda → pede mesa antes de entrar ────────────
  const handleSelectComanda = (order) => {
    setBuscaComanda("");
    // Trava de edição (Leva 14): comanda aberta em outro aparelho → não entra.
    if (emUsoPorOutro(order)) {
      notify?.(`${fmtComanda(order.comanda)} está em uso por ${nomeTrava(order)}. Aguarde liberar.`, "err");
      return;
    }
    const temItens = Array.isArray(order.items) && order.items.length > 0;
    if (order.mesa || temItens) {
      // Tem mesa definida OU já tem itens (ex: lançado pelo Palm sem mesa) — entra direto
      setSelected(order);
      setCartItems([]);
      setAbaAtiva("produtos");
      setMode("pedido");
    } else {
      // Comanda vazia e sem mesa criada no PDV — pede mesa
      setMesaInput("");
      setApelidoInput(order.apelido || "");
      setMesaPendingOrder(order);
      setShowMesa(true);
    }
  };

  const abrirEditarMesa = () => {
    setMesaInput(selected?.mesa || "");
    setApelidoInput(selected?.apelido || "");
    setMesaPendingOrder(selected);
    setShowMesa(true);
  };

  const handleConfirmarMesa = async () => {
    if (!mesaPendingOrder || salvandoMesa) return;
    // Trava de edição (Leva 14): alguém abriu a comanda enquanto a modal estava na tela.
    if (!mesaPendingOrder._virtual) {
      const fresca = pending.find(o => o.id === mesaPendingOrder.id) ?? mesaPendingOrder;
      if (emUsoPorOutro(fresca)) {
        notify?.(`${fmtComanda(fresca.comanda)} está em uso por ${nomeTrava(fresca)}. Aguarde liberar.`, "err");
        setShowMesa(false);
        setMesaPendingOrder(null);
        return;
      }
    }
    const mesa    = mesaInput.trim();
    const apelido = apelidoInput.trim();
    setSalvandoMesa(true);
    try {
      let order = { ...mesaPendingOrder, mesa, apelido };
      if (!order._virtual) {
        // Comanda já existe — atualiza só se mudou
        const mudou = mesa !== (mesaPendingOrder.mesa || "") || apelido !== (mesaPendingOrder.apelido || "");
        if (mudou) {
          const { error } = await updatePending(order.id, { mesa, apelido });
          if (error) {
            notify?.("Não foi possível salvar a mesa. Tente novamente.", "err");
            return;
          }
        }
      }
      // Se virtual, mantém _virtual — será persistida ao lançar
      setSelected(order);
      if (mode !== "pedido") {
        setCartItems([]);
        setAbaAtiva("produtos");
        setMode("pedido");
      }
      setShowMesa(false);
      setMesaPendingOrder(null);
    } finally {
      setSalvandoMesa(false);
    }
  };

  // ── Vincular cliente à comanda ────────────────────────────────
  const abrirClienteComanda = async () => {
    setClientePendingOrder(selected);
    setShowCliente(true);
    // Pré-carrega o cliente já vinculado (se houver) para exibir na modal
    // e permitir trocar/remover. Fallback: só o nome guardado na comanda.
    if (selected?.cliente_id) {
      setClienteSel({ id: selected.cliente_id, nome: selected.cliente_nome || "Cliente" });
      const { data } = await buscarClientePorId(selected.cliente_id);
      if (data) setClienteSel(data);
    } else {
      setClienteSel(null);
    }
  };

  const handleConfirmarClienteComanda = async () => {
    if (!clientePendingOrder || salvandoCliente) return;
    // Trava de edição (Leva 14): alguém abriu a comanda enquanto a modal estava aberta.
    if (!clientePendingOrder._virtual) {
      const fresca = pending.find(o => o.id === clientePendingOrder.id) ?? clientePendingOrder;
      if (emUsoPorOutro(fresca)) {
        notify?.(`${fmtComanda(fresca.comanda)} está em uso por ${nomeTrava(fresca)}. Aguarde liberar.`, "err");
        setShowCliente(false);
        setClientePendingOrder(null);
        return;
      }
    }
    const cliente_id   = clienteSel?.id ?? null;
    const cliente_nome = clienteSel?.nome ?? null;
    setSalvandoCliente(true);
    try {
      const order = { ...clientePendingOrder, cliente_id, cliente_nome };
      if (!clientePendingOrder._virtual) {
        const mudou = cliente_id !== (clientePendingOrder.cliente_id ?? null);
        if (mudou) {
          const { error } = await updatePending(order.id, { cliente_id, cliente_nome });
          if (error) {
            notify?.("Não foi possível vincular o cliente. Tente novamente.", "err");
            return;
          }
        }
      }
      // Se virtual, mantém _virtual — o vínculo é persistido junto ao lançar (addPending).
      if (selected?.id === order.id || clientePendingOrder._virtual) setSelected(order);
      setShowCliente(false);
      setClientePendingOrder(null);
      notify?.(
        cliente_id ? `${cliente_nome} vinculado à comanda.` : "Cliente desvinculado da comanda.",
        "ok",
      );
    } finally {
      setSalvandoCliente(false);
    }
  };

  const handleBack = () => {
    setBuscaComanda("");
    setMode("grid");
    setSelected(null);
    setCartItems([]);
  };

  // ── Adicionar produto ao carrinho ──────────────────────────────
  const handleAddProduct = (product) => {
    setCartItems(prev => {
      // Combo e produto avulso do mesmo principal são linhas diferentes
      // (mesmoItemDeVenda compara id + comboId) — misturar cobraria errado.
      const idx = prev.findIndex(i => mesmoItemDeVenda(i, product));
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1, _key: Date.now() + Math.random() }];
    });
  };

  // ── Barcode scan handler ──────────────────────────────────────
  const handleBarcodeScan = useCallback((code) => {
    if (!FEATURE_BARCODE_SCANNER || mode !== "pedido") return;
    const found = products.find(p => p.codigo_barras && p.codigo_barras === code && p.active !== false);
    if (found) {
      handleAddProduct(found);
      setBarcodeFeedback("ok");
      setBarcodeValue("");
    } else {
      setBarcodeFeedback("notfound");
    }
    setTimeout(() => setBarcodeFeedback(null), 2500);
  }, [products, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useBarcodeScanner(handleBarcodeScan, FEATURE_BARCODE_SCANNER && mode === "pedido");

  const handleChangeQty = (index, newQty) => {
    if (newQty <= 0) setCartItems(prev => prev.filter((_, i) => i !== index));
    else             setCartItems(prev => prev.map((it, i) => i === index ? { ...it, qty: newQty } : it));
  };

  const handleChangeObs = (index, obs) => {
    // obs is now an array of strings
    setCartItems(prev => prev.map((it, i) => i === index ? { ...it, obs } : it));
  };

  // ── Lançar pedido → acumula itens no Supabase ────────────────
  const handleLancar = async () => {
    if (!selected || cartItems.length === 0 || salvando) return;
    if (bloqueio) { notify?.(`${fmtComanda(selected.comanda)} está em uso por ${bloqueio.nome}.`, "err"); return; }
    setSalvando(true);
    try {
      // Persiste comanda se ainda for virtual
      let ordem = selected;
      if (ordem._virtual) {
        ordem = await persistirVirtual(ordem);
        setSelected(ordem);
      }
      const anteriores = Array.isArray(ordem.items) ? ordem.items : [];
      // launched_at por item — mesmo padrão do Palm (MobilePage handleLancar):
      // é a fonte do horário de lançamento na via de produção (B1/F015).
      const agora      = new Date().toISOString();
      const novos      = cartItems.map(({ _key, ...rest }) => ({ ...rest, launched_at: agora }));
      const acumulados = [...anteriores, ...novos];
      // Item cancelado não entra: senão a cerveja cancelada volta ao total
      // gravado no próximo lançamento e a comanda passa a mostrar um valor
      // que o checkout não vai cobrar.
      const total      = totalItensAtivos(acumulados);
      // Este lançamento saiu daqui e é impresso logo abaixo: marca ANTES de
      // gravar para o vigia do realtime (ImpressaoLancamentosBridge) não
      // mandar o mesmo papel de novo ao ver a comanda mudar. Marcar um
      // lançamento que acabe falhando não custa nada — não há o que imprimir.
      registroLancamentos.marcar(chaveLancamento(ordem.id, agora));
      const { error } = await updatePending(ordem.id, { items: acumulados, total }, { baseItems: anteriores });
      if (error) throw error;
      addLancada(ordem.id);
      // Papel na produção sai sozinho ao lançar (se a chave estiver ligada
      // em Configurações → Impressão). Fire-and-forget de propósito: o
      // pedido JÁ está gravado, então impressora fora do ar não pode
      // travar a tela nem sugerir que o lançamento falhou — só avisa.
      imprimirLancamento({ ...ordem, items: novos })
        .then(({ error: erroImpressao }) => {
          if (erroImpressao) notify?.(`Pedido lançado, mas não saiu na produção: ${erroImpressao.message}`, "err");
        })
        .catch(() => {});
      logAction(currentUser?.username, "itens:lancar", { msg: `Itens lançados na ${fmtComanda(ordem.comanda)} · ${novos.length} tipo(s) · R$ ${total.toFixed(2)}`, name: currentUser?.name, role: currentUser?.role, comanda: ordem.comanda, tipos: novos.length, total });
      setToast(true);
      setTimeout(() => setToast(false), 6000);
      handleBack();
    } catch (err) {
      console.error("Erro ao lançar pedido:", resumoErro(err));
      notify?.("Erro ao lançar o pedido, nada foi salvo. Tente novamente.", "err");
    } finally {
      setSalvando(false);
    }
  };

  // ── Ir para checkout — acumula itens locais antes de finalizar ─
  const handleFinalizar = async () => {
    if (bloqueio) { notify?.(`${fmtComanda(selected?.comanda)} está em uso por ${bloqueio.nome}.`, "err"); return; }
    try {
      let ordem = selected;
      if (ordem._virtual) {
        if (cartItems.length === 0) return; // não faz sentido finalizar sem itens
        ordem = await persistirVirtual(ordem);
        setSelected(ordem);
      }
      if (cartItems.length > 0) {
        const anteriores = Array.isArray(ordem.items) ? ordem.items : [];
        const novos      = cartItems.map(({ _key, ...rest }) => rest);
        const acumulados = [...anteriores, ...novos];
        const novoTotal  = totalItensAtivos(acumulados);
        const { error } = await updatePending(ordem.id, { items: acumulados, total: novoTotal }, { baseItems: anteriores });
        if (error) throw error;
        setSelected(prev => ({ ...prev, items: acumulados, total: novoTotal }));
        setCartItems([]);
      }
      setMode("checkout");
    } catch (err) {
      // Mantém o carrinho e NÃO entra no checkout: cobrar itens que não
      // foram gravados geraria divergência entre a conta e a comanda.
      console.error("handleFinalizar error:", resumoErro(err));
      notify?.("Não foi possível salvar os itens antes de fechar a conta. Tente novamente.", "err");
    }
  };

  // ── Confirmar pagamento → grava venda e remove comanda ────────
  const handleConfirmPayment = async (payload) => {
    if (!selected) return;
    if (bloqueio) return { error: new Error(`Comanda em uso por ${bloqueio.nome}. Aguarde liberar.`) };
    setSalvando(true);
    try {
      await finalizarPagamento(selected, cartItems, payload, {
        // A modal abre já em 'emitindo' e se atualiza sozinha ao concluir —
        // nunca bloqueia a venda nem a volta à grade de comandas.
        onNfce: ({ estado, resultado, venda }) =>
          setCupomNfce({ aberta: true, estado, resultado, venda }),
      });
      handleBack();
      return { error: null };
    } catch (err) {
      // Só o resumo mascarado: o objeto cru leva o payload da cobrança
      // para o console de um terminal compartilhado. Ver resumoErro.
      console.error("handleConfirmPayment error:", resumoErro(err));
      // Devolve o erro para o CheckoutView exibir e reabilitar o botão —
      // engolir aqui deixava o checkout preso em "Processando...".
      return { error: err instanceof Error ? err : new Error("Não foi possível registrar o pagamento. Tente novamente.") };
    } finally {
      setSalvando(false);
    }
  };

  // ── Remover (cancelar) item na tela de finalizar — Leva 15.1 ──
  // Recebe o item agrupado do CheckoutView (name+price) e cancela a
  // quantidade pedida nos itens lançados correspondentes, dividindo o
  // último em ativo + cancelado quando a remoção é parcial.
  const handleRemoverItemCheckout = async (itemRef, qtyRemover, motivo) => {
    if (!selected) return { error: new Error("Comanda não encontrada.") };
    let restante = qtyRemover;
    const marcar = (it, qtd) => ({
      ...it, qty: qtd, cancelado: true,
      motivoCancelamento: motivo || "",
      canceladoPor: currentUser?.name || "",
    });
    const novos = (selected.items ?? []).map((it) => {
      if (restante <= 0 || it.cancelado || it.name !== itemRef.name || it.price !== itemRef.price) return it;
      const qtyIt = it.qty ?? 1;
      if (qtyIt <= restante) { restante -= qtyIt; return marcar(it, qtyIt); }
      const cancelar = restante;
      restante = 0;
      // O pedaço cancelado é uma LINHA NOVA na comanda e precisa de `uid`
      // próprio: herdando o uid do pedaço que continua ativo, os dois viravam
      // o mesmo item aos olhos da reconciliação multi-dispositivo. Como
      // `mesclarItensComanda` só preserva do banco os uids DESCONHECIDOS, o
      // pedaço cancelado era descartado no primeiro lançamento vindo do Palm —
      // o item voltava inteiro para a conta e o cliente pagava o que foi
      // cancelado. Com uid novo, o cancelamento sobrevive ao merge.
      return [{ ...it, qty: qtyIt - cancelar }, { ...marcar(it, cancelar), uid: crypto.randomUUID() }];
    }).flat();
    const novoTotal = totalItensAtivos(novos);
    const { error } = await updatePending(selected.id, { items: novos, total: novoTotal }, { baseItems: selected.items });
    if (error) return { error };
    setSelected(prev => ({ ...prev, items: novos, total: novoTotal }));
    logAction(currentUser?.username, "itens:cancelar", {
      msg: `Item cancelado no fechamento da ${fmtComanda(selected.comanda)} · ${qtyRemover}× ${itemRef.name} · ${motivo}`,
      name: currentUser?.name, role: currentUser?.role,
      comanda: selected.comanda, item: itemRef.name, qty: qtyRemover, motivo,
    });
    return { error: null };
  };

  // ── Abrir slot vazio — cria comanda virtual (só persiste ao lançar) ──
  const handleOpenEmpty = (nome, { mesa } = {}) => {
    if (!caixaAberto) return;
    const order = {
      id:         crypto.randomUUID(),
      comanda:    nome,
      mesa:       "",
      apelido:    "",
      items:      [],
      status:     "open",
      total:      0,
      garcom:     currentUser?.name     || "",
      created_by: currentUser?.username || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _virtual:   true, // não persistida ainda
    };
    setBuscaComanda("");
    setMesaInput(mesa ?? "");
    setApelidoInput("");
    setMesaPendingOrder(order);
    setShowMesa(true);
  };

  // ── Persiste comanda virtual no banco ─────────────────────────
  const persistirVirtual = async (order) => {
    const { _virtual, ...payload } = order;
    const { error } = await addPending(payload);
    if (error) throw error;
    logAction(currentUser?.username, "comanda:abrir", { msg: `Comanda aberta: ${order.comanda}`, name: currentUser?.name, role: currentUser?.role, comanda: order.comanda });
    return payload;
  };

  // ── Transferir itens entre comandas ──────────────────────────
  const { abrirTransferir, handleTransferir } = acoesTransferencia({
    abertas, addPending, bloqueio, currentUser, notify, removePending, selected, setMode,
    setSelected, setShowTransferir, updatePending, transQtds, setTransQtds, transDestino,
    setTransDestino, transMode, setTransMode, transNumero, setTransNumero, transNomeNova,
    setTransNomeNova, setTransNumeroErro, transferindo, setTransferindo,
  });

  // ── Nova comanda com nome personalizado ───────────────────────
  const handleNovaComanda = async () => {
    if (!nomeComanda.trim() || criando) return;
    setCriando(true);
    const order = {
      id:         crypto.randomUUID(),
      comanda:    nomeComanda.trim(),
      items:      [],
      status:     "open",
      total:      0,
      garcom:     currentUser?.name     || "",
      created_by: currentUser?.username || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await addPending(order);
    if (error) {
      notify?.("Não foi possível abrir a comanda. Tente novamente.", "err");
      setCriando(false);
      return;
    }
    logAction(currentUser?.username, "comanda:abrir", { msg: `Comanda aberta: ${order.comanda}`, name: currentUser?.name, role: currentUser?.role, comanda: order.comanda });
    setNomeComanda("");
    setShowNova(false);
    setCriando(false);
    setBuscaComanda("");
    setMesaInput("");
    setApelidoInput("");
    setMesaPendingOrder(order);
    setShowMesa(true);
  };

  // Enquanto o bootstrap não trouxe o estado real do caixa (o default
  // local é "aberto"), não deixar operar: evita registrar venda com o
  // caixa de fato fechado nos primeiros segundos após o login.

  return {
    mode, setMode, selected, setSelected, cartItems, setCartItems, salvando, setSalvando,
    abaAtiva, setAbaAtiva, toast, setToast, alertaAberto, setAlertaAberto, cupomNfce,
    setCupomNfce, alertaValidadeAberto, setAlertaValidadeAberto, buscaComanda, setBuscaComanda,
    barcodeInputOpen, setBarcodeInputOpen, barcodeValue, setBarcodeValue, barcodeFeedback,
    setBarcodeFeedback, combos, setCombos, currentUser, users, bootstrapLoading, metodosCustom,
    diasAlertaValidade, products, estoque, estoqueMinimos, pending, addPending, updatePending,
    removePending, lancadas, addLancada, caixaAberto, sales, finalizarPagamento, cancelarComanda,
    width, mesas, mesasLoading, atualizarStatusMesa, showNova, setShowNova, nomeComanda,
    setNomeComanda, criando, setCriando, confirmCancelar, setConfirmCancelar,
    confirmCancelarMotivo, setConfirmCancelarMotivo, showTransferir, setShowTransferir,
    showSaldo, setShowSaldo, saldoSenha, setSaldoSenha, saldoSenhaErro, setSaldoSenhaErro,
    saldoAutorizado, setSaldoAutorizado, saldoSenhaVis, setSaldoSenhaVis, transQtds,
    setTransQtds, transDestino, setTransDestino, transMode, setTransMode, transNumero,
    setTransNumero, transNomeNova, setTransNomeNova, transNumeroErro, setTransNumeroErro,
    transferindo, setTransferindo, showCancelarComanda, setShowCancelarComanda, cancelarSenha,
    setCancelarSenha, cancelarSenhaErro, setCancelarSenhaErro, cancelarSenhaVis,
    setCancelarSenhaVis, cancelarAutorizado, setCancelarAutorizado, cancelarMotivo,
    setCancelarMotivo, cancelandoComanda, setCancelandoComanda, showMesa, setShowMesa, mesaInput,
    setMesaInput, apelidoInput, setApelidoInput, mesaPendingOrder, setMesaPendingOrder,
    salvandoMesa, setSalvandoMesa, showCliente, setShowCliente, clientePendingOrder,
    setClientePendingOrder, clienteSel, setClienteSel, salvandoCliente, setSalvandoCliente,
    bloqueio, abrirTransferir, handleTransferir, sz, isMob, isCel, location, emPainel,
    painelEnxuto, abertas, travaAtiva, emUsoPorOutro, handleSelectComanda, abrirEditarMesa,
    handleConfirmarMesa, abrirClienteComanda, handleConfirmarClienteComanda, handleBack,
    handleAddProduct, handleBarcodeScan, handleChangeQty, handleChangeObs, handleLancar,
    handleFinalizar, handleConfirmPayment, handleRemoverItemCheckout, handleOpenEmpty,
    persistirVirtual, handleNovaComanda, notify,
  };
}
