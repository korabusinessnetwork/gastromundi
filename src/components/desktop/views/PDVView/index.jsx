import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";
import { useResponsive, useMesas } from "@/utils/hooks";
import { totalPorMetodo } from "@/utils/pagamentos";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuArrowLeft, LuArrowLeftRight, LuPlus, LuTriangleAlert, LuChevronDown, LuChevronUp, LuShoppingBag, LuShoppingCart, LuLock, LuSearch, LuX, LuChartBar, LuEye, LuEyeOff, LuPencil, LuScanBarcode, LuLayoutGrid, LuList } from "react-icons/lu";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
import { FEATURE_BARCODE_SCANNER } from "@/constants/features";
import { useBarcodeScanner } from "@/utils/useBarcodeScanner";
import { useFinalizarPagamento } from "./useFinalizarPagamento";
import { useCancelarComanda } from "./useCancelarComanda";
import ComandaGrid   from "./ComandaGrid";
import ProductGrid   from "./ProductGrid";
import CartPanel     from "./CartPanel";
import CheckoutView  from "./CheckoutView";
import MesaMapView   from "./MesaMapView";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

export default function PDVView() {
  const {
    pending, products, estoque,
    addPending, updatePending, removePending,
    caixaAberto, currentUser, sales, users, metodosCustom,
    lancadas, addLancada,
  } = useApp();
  const { finalizarPagamento } = useFinalizarPagamento();
  const { cancelarComanda } = useCancelarComanda();

  const { width } = useResponsive();
  const sz = getSizes(width);
  // isMob alinhado com CartPanel: mobile/tablet usam tabs (cartWidth===0)
  const isMob = sz.cartWidth === 0;
  const { mesas, loading: mesasLoading } = useMesas();
  const location = useLocation();

  // Reset to mapa whenever the sidebar navigates to this page
  useEffect(() => {
    setMode("mapa");
    setSelected(null);
    setCartItems([]);
  }, [location.key]);

  // "mapa" | "grid" | "pedido" | "checkout"
  const [mode,        setMode]        = useState("mapa");
  const [selected,    setSelected]    = useState(null);
  const [cartItems,   setCartItems]   = useState([]);
  const [salvando,    setSalvando]    = useState(false);
  const [abaAtiva,    setAbaAtiva]    = useState("produtos"); // mobile tab

  const [toast,         setToast]         = useState(false);
  const [alertaAberto,  setAlertaAberto]  = useState(false);
  const [buscaComanda,  setBuscaComanda]  = useState("");

  // modal nova comanda
  const [showNova,          setShowNova]          = useState(false);
  const [nomeComanda,       setNomeComanda]       = useState("");
  const [criando,           setCriando]           = useState(false);
  const [confirmCancelar,        setConfirmCancelar]        = useState(false);
  const [confirmCancelarMotivo,  setConfirmCancelarMotivo]  = useState("");
  const [showTransferir,    setShowTransferir]    = useState(false);
  const [showSaldo,         setShowSaldo]         = useState(false);
  const [saldoSenha,        setSaldoSenha]        = useState("");
  const [saldoSenhaErro,    setSaldoSenhaErro]    = useState(false);
  const [saldoAutorizado,   setSaldoAutorizado]   = useState(false);
  const [saldoSenhaVis,     setSaldoSenhaVis]     = useState(false);
  const [transQtds,         setTransQtds]         = useState({});         // { [itemIdx]: qty }
  const [transDestino,      setTransDestino]      = useState(null);       // order id destino (null = nova)
  const [transMode,         setTransMode]         = useState("lista");    // "lista" | "numero" | "nova"
  const [transNumero,       setTransNumero]       = useState("");         // número digitado manualmente
  const [transNomeNova,     setTransNomeNova]     = useState("");         // nome da nova comanda
  const [transNumeroErro,   setTransNumeroErro]   = useState("");
  const [transferindo,      setTransferindo]      = useState(false);
  const [showCancelarComanda,    setShowCancelarComanda]    = useState(false);
  const [cancelarSenha,          setCancelarSenha]          = useState("");
  const [cancelarSenhaErro,      setCancelarSenhaErro]      = useState(false);
  const [cancelarSenhaVis,       setCancelarSenhaVis]       = useState(false);
  const [cancelarAutorizado,     setCancelarAutorizado]     = useState(false);
  const [cancelarMotivo,         setCancelarMotivo]         = useState("");
  const [cancelandoComanda,      setCancelandoComanda]      = useState(false);
  const [showMesa,               setShowMesa]               = useState(false);
  const [mesaInput,         setMesaInput]         = useState("");
  const [apelidoInput,      setApelidoInput]      = useState("");
  const [mesaPendingOrder,  setMesaPendingOrder]  = useState(null);
  const [salvandoMesa,      setSalvandoMesa]      = useState(false);

  // ── Barcode scanner (FEATURE_BARCODE_SCANNER) ─────────────────
  const [barcodeInputOpen,  setBarcodeInputOpen]  = useState(false);
  const [barcodeValue,      setBarcodeValue]      = useState("");
  const [barcodeFeedback,   setBarcodeFeedback]   = useState(null); // null | "ok" | "notfound"

  const abertas = pending.filter(o => o.status !== "closed");

  // ── Selecionar comanda → pede mesa antes de entrar ────────────
  const handleSelectComanda = (order) => {
    setBuscaComanda("");
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
    const mesa    = mesaInput.trim();
    const apelido = apelidoInput.trim();
    setSalvandoMesa(true);
    try {
      let order = { ...mesaPendingOrder, mesa, apelido };
      if (!order._virtual) {
        // Comanda já existe — atualiza só se mudou
        const mudou = mesa !== (mesaPendingOrder.mesa || "") || apelido !== (mesaPendingOrder.apelido || "");
        if (mudou) await updatePending(order.id, { mesa, apelido });
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

  const handleBack = () => {
    setBuscaComanda("");
    setMode("mapa");
    setSelected(null);
    setCartItems([]);
  };

  // ── Adicionar produto ao carrinho ──────────────────────────────
  const handleAddProduct = (product) => {
    setCartItems(prev => {
      const idx = prev.findIndex(i => i.id === product.id);
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
    setSalvando(true);
    try {
      // Persiste comanda se ainda for virtual
      let ordem = selected;
      if (ordem._virtual) {
        ordem = await persistirVirtual(ordem);
        setSelected(ordem);
      }
      const anteriores = Array.isArray(ordem.items) ? ordem.items : [];
      const novos      = cartItems.map(({ _key, ...rest }) => rest);
      const acumulados = [...anteriores, ...novos];
      const total      = acumulados.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
      await updatePending(ordem.id, { items: acumulados, total });
      addLancada(ordem.id);
      logAction(currentUser?.username, "itens:lancar", { msg: `Itens lançados na ${fmtComanda(ordem.comanda)} · ${novos.length} tipo(s) · R$ ${total.toFixed(2)}`, name: currentUser?.name, role: currentUser?.role, comanda: ordem.comanda, tipos: novos.length, total });
      setToast(true);
      setTimeout(() => setToast(false), 6000);
      handleBack();
    } catch (err) {
      console.error("Erro ao lançar pedido:", err);
    } finally {
      setSalvando(false);
    }
  };

  // ── Ir para checkout — acumula itens locais antes de finalizar ─
  const handleFinalizar = async () => {
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
      const novoTotal  = acumulados.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
      await updatePending(ordem.id, { items: acumulados, total: novoTotal });
      setSelected(prev => ({ ...prev, items: acumulados, total: novoTotal }));
      setCartItems([]);
    }
    setMode("checkout");
  };

  // ── Confirmar pagamento → grava venda e remove comanda ────────
  const handleConfirmPayment = async (payload) => {
    if (!selected) return;
    setSalvando(true);
    try {
      await finalizarPagamento(selected, cartItems, payload);
      handleBack();
    } catch (err) {
      // não usar JSON.stringify: mascara Error como "{}"
      console.error("handleConfirmPayment error:", err?.message ?? err, err);
    } finally {
      setSalvando(false);
    }
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
    await addPending(payload);
    logAction(currentUser?.username, "comanda:abrir", { msg: `Comanda aberta: ${order.comanda}`, name: currentUser?.name, role: currentUser?.role, comanda: order.comanda });
    return payload;
  };

  // ── Transferir itens entre comandas ──────────────────────────
  const abrirTransferir = () => {
    const itens = Array.isArray(selected?.items) ? selected.items : [];
    const qtds = {};
    itens.forEach((_, idx) => { qtds[idx] = 0; });
    setTransQtds(qtds);
    setTransDestino(null);
    setTransMode("lista");
    setTransNumero("");
    setTransNomeNova("");
    setTransNumeroErro("");
    setShowTransferir(true);
  };

  const handleTransferir = async () => {
    const algumSelecionado = Object.values(transQtds).some(q => q > 0);
    if (!algumSelecionado || transferindo) return;

    const itens = Array.isArray(selected?.items) ? selected.items : [];

    // Resolve o destino dependendo do modo
    let destinoId   = transDestino;
    let nomeDestino = "";

    if (transMode === "numero") {
      const num = transNumero.trim();
      if (!num) { setTransNumeroErro("Digite o número da comanda."); return; }
      const encontrada = abertas.find(o => String(o.comanda).trim() === num && o.id !== selected?.id);
      if (!encontrada) { setTransNumeroErro(`Comanda ${num} não encontrada ou é a mesma de origem.`); return; }
      destinoId   = encontrada.id;
      nomeDestino = fmtComanda(encontrada.comanda);
    } else if (transMode === "nova") {
      const nomeNova = transNomeNova.trim();
      if (!nomeNova) { setTransNumeroErro("Digite o nome ou número da nova comanda."); return; }
      const jaExiste = abertas.find(o => String(o.comanda).trim() === nomeNova);
      if (jaExiste) { setTransNumeroErro(`Comanda "${nomeNova}" já existe.`); return; }
      destinoId   = null; // será criada
      nomeDestino = fmtComanda(nomeNova);
    } else {
      if (!destinoId) return;
      const d = abertas.find(o => o.id === destinoId);
      nomeDestino = d ? fmtComanda(d.comanda) : "";
    }

    setTransferindo(true);
    try {
      const aTransferir = itens
        .map((it, idx) => ({ it, qty: transQtds[idx] ?? 0 }))
        .filter(x => x.qty > 0);

      // Origem: subtrai ou remove
      const novosOrigem = itens.map((it, idx) => {
        const qRemover = transQtds[idx] ?? 0;
        if (!qRemover) return it;
        const novaQty = (it.qty ?? 1) - qRemover;
        return novaQty > 0 ? { ...it, qty: novaQty } : null;
      }).filter(Boolean);
      const totalOrigem = novosOrigem.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);

      if (transMode === "nova") {
        // Cria nova comanda com os itens transferidos
        const itensNova = aTransferir.map(({ it, qty }) => ({ ...it, qty }));
        const totalNova = itensNova.reduce((s, i) => s + i.price * i.qty, 0);
        const novaOrder = {
          id:         crypto.randomUUID(),
          comanda:    transNomeNova.trim(),
          garcom:     currentUser?.name || "",
          items:      itensNova,
          total:      totalNova,
          status:     "open",
          created_at: new Date().toISOString(),
          mesa:       selected?.mesa    || "",
          apelido:    selected?.apelido || "",
        };
        await Promise.all([
          updatePending(selected.id, { items: novosOrigem, total: totalOrigem }),
          addPending(novaOrder),
        ]);
      } else {
        // Destino existente
        const destino    = abertas.find(o => o.id === destinoId);
        const novosDestino = [...(Array.isArray(destino.items) ? destino.items : [])];
        aTransferir.forEach(({ it, qty }) => {
          const existIdx = novosDestino.findIndex(d => d.id === it.id && !d.cancelado);
          if (existIdx >= 0) {
            novosDestino[existIdx] = { ...novosDestino[existIdx], qty: (novosDestino[existIdx].qty ?? 1) + qty };
          } else {
            novosDestino.push({ ...it, qty });
          }
        });
        const totalDestino = novosDestino.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
        await Promise.all([
          updatePending(selected.id, { items: novosOrigem, total: totalOrigem }),
          updatePending(destinoId,   { items: novosDestino, total: totalDestino }),
        ]);
      }

      const qtdTransf = aTransferir.reduce((s, x) => s + x.qty, 0);
      logAction(currentUser?.username, "itens:transferir", { msg: `Transferência: ${qtdTransf} item(ns) de ${fmtComanda(selected.comanda)} → ${nomeDestino}`, name: currentUser?.name, role: currentUser?.role, de: selected.comanda, para: nomeDestino, qtd: qtdTransf });

      const itensAtivosRestantes = novosOrigem.filter(i => !i.cancelado);
      if (itensAtivosRestantes.length === 0) {
        await removePending(selected.id);
        setSelected(null);
        setMode("mapa");
      } else {
        setSelected(prev => ({ ...prev, items: novosOrigem, total: totalOrigem }));
      }
      setShowTransferir(false);
    } finally {
      setTransferindo(false);
    }
  };

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
    await addPending(order);
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

  if (!caixaAberto) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100vh", background: varColor(C.bg), gap: 16, fontFamily: "'Inter',system-ui,sans-serif",
        color: varColor(C.text), userSelect: "none",
      }}>
        <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 24, padding: "48px 56px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 420, textAlign: "center" }}>
          <div style={{ background: `${alfa(C.accent, "1a")}`, borderRadius: "50%", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LuLock size={36} color={varColor(C.accent)} />
          </div>
          <div style={{ fontWeight: 900, fontSize: sz.fontLg + 4 }}>Caixa Fechado</div>
          <div style={{ fontSize: sz.fontBase, color: varColor(C.muted), lineHeight: 1.6 }}>
            O caixa está fechado. Para realizar operações na frente de caixa, solicite ao responsável que abra o caixa.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: varColor(C.bg), flexDirection: "column" }}>

      {/* ── Header (oculto no checkout — ele tem o próprio) ─────── */}
      {mode !== "checkout" && (
        <div style={{
          padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid var(${C.border})`,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: sz.gap,
          flexShrink: 0,
        }}>
          {/* Esquerda: título / voltar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {mode === "pedido" && (
              <button
                onClick={handleBack}
                style={{
                  background: varColor(C.surface),
                  border: `1.5px solid var(${C.border})`,
                  borderRadius: 10, color: varColor(C.text),
                  cursor: "pointer",
                  padding: `${sz.padSm - 2}px ${sz.padSm + 2}px`,
                  fontWeight: 700, fontSize: sz.fontBase,
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "background 0.15s, border-color 0.15s", whiteSpace: "nowrap",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = varColor(C.accent);
                  e.currentTarget.style.borderColor = varColor(C.accent);
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = varColor(C.surface);
                  e.currentTarget.style.borderColor = varColor(C.border);
                  e.currentTarget.style.color = varColor(C.text);
                }}
              >
                <LuArrowLeft size={16} /> Voltar
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: sz.fontBase + 2 }}>
                  {mode === "pedido" ? fmtComanda(selected?.comanda) : "Frente de Caixa"}
                </div>
                <div style={{ color: varColor(C.muted), fontSize: sz.fontBase, marginTop: 2 }}>
                  {mode === "pedido"
                    ? <>
                        {selected?.mesa && <span style={{ marginRight: 6 }}>🪑 Mesa {selected.mesa}{selected?.apelido ? ` · ${selected.apelido}` : ""} ·</span>}
                        {cartItems.length} {cartItems.length === 1 ? "tipo de item" : "tipos de item"} no carrinho
                      </>
                    : `${abertas.length} comanda${abertas.length !== 1 ? "s" : ""} em aberto`}
                </div>
              </div>
              {(mode === "mapa" || mode === "grid") && (
                <button
                  onClick={() => { setShowSaldo(true); setSaldoSenha(""); setSaldoSenhaErro(false); setSaldoAutorizado(false); setSaldoSenhaVis(false); }}
                  title="Saldo do dia"
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: `${sz.padSm - 2}px ${sz.pad - 4}px`, borderRadius: 10,
                    border: `1px solid var(${C.border})`, background: varColor(C.surface),
                    color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase,
                    transition: "background 0.15s, color 0.15s, border-color 0.15s", whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = varColor(C.card); e.currentTarget.style.color = varColor(C.text); e.currentTarget.style.borderColor = varColor(C.accent) + "66"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = varColor(C.surface); e.currentTarget.style.color = varColor(C.muted); e.currentTarget.style.borderColor = varColor(C.border); }}
                >
                  <LuChartBar size={15} /> Saldo do Dia
                </button>
              )}
            </div>
          </div>

          {/* Centro: vazio */}
          <div />

          {/* Direita: ações */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: sz.gap, flexWrap: "wrap" }}>
          {/* Toast inline — visível no mapa/lista após lançar */}
          {(mode === "mapa" || mode === "grid") && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: `${alfa(C.green, "18")}`, border: `1px solid ${alfa(C.green, "44")}`,
              color: varColor(C.green), borderRadius: 10, padding: "9px 16px",
              fontWeight: 700, fontSize: 17,
              pointerEvents: "none",
              transition: "opacity 0.3s, transform 0.3s",
              opacity: toast ? 1 : 0,
              transform: toast ? "translateY(0)" : "translateY(-6px)",
            }}>
              ✓ Pedido lançado!
            </div>
          )}
          {(mode === "mapa" || mode === "grid") && (
            <button
              onClick={() => { setShowNova(true); setNomeComanda(""); }}
              disabled={!caixaAberto}
              style={{
                padding: `${sz.padSm - 2}px ${sz.pad}px`, borderRadius: 10, border: "none",
                background: caixaAberto ? varColor(C.accent) : varColor(C.faint),
                color: "#fff", fontWeight: 700, fontSize: sz.fontBase,
                cursor: caixaAberto ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              }}
            >
              <LuPlus size={sz.fontBase} /> Nova Comanda
            </button>
          )}

          {mode === "pedido" && (() => {
            const itensLancados = Array.isArray(selected?.items) ? selected.items : [];
            return (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

                {/* ── Barcode scanner UI (FEATURE_BARCODE_SCANNER) ── */}
                {FEATURE_BARCODE_SCANNER && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {/* Feedback inline */}
                      {barcodeFeedback && (
                        <span style={{
                          fontSize: 13, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                          background: barcodeFeedback === "ok" ? `${alfa(C.green, "18")}` : `${alfa(C.red, "18")}`,
                          color: barcodeFeedback === "ok" ? varColor(C.green) : varColor(C.red),
                          border: `1px solid ${barcodeFeedback === "ok" ? varColor(C.green) : varColor(C.red)}44`,
                          whiteSpace: "nowrap",
                        }}>
                          {barcodeFeedback === "ok" ? "✓ Item adicionado" : "Código não encontrado"}
                        </span>
                      )}
                      {/* Botão toggle scanner */}
                      <button
                        type="button"
                        onClick={() => { setBarcodeInputOpen(v => !v); setBarcodeValue(""); setBarcodeFeedback(null); }}
                        title="Scanner de código de barras"
                        style={{
                          padding: "10px 14px", borderRadius: 10,
                          border: `1.5px solid ${barcodeInputOpen ? varColor(C.accent) : varColor(C.border)}`,
                          background: barcodeInputOpen ? `${alfa(C.accent, "12")}` : varColor(C.surface),
                          color: barcodeInputOpen ? varColor(C.accent) : varColor(C.muted),
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                          fontWeight: 700, fontSize: 15, fontFamily: "inherit",
                          transition: "all 0.15s",
                        }}
                      >
                        <LuScanBarcode size={16} />
                        Scanner
                      </button>
                    </div>
                    {/* Campo de input manual — colapsável */}
                    {barcodeInputOpen && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          autoFocus
                          type="text"
                          value={barcodeValue}
                          onChange={e => setBarcodeValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { handleBarcodeScan(barcodeValue.trim()); } }}
                          placeholder="Digite ou escaneie o código..."
                          maxLength={64}
                          style={{
                            width: 220, padding: "8px 12px",
                            borderRadius: 9, border: `1.5px solid var(${C.border})`,
                            background: varColor(C.surface), color: varColor(C.text),
                            fontSize: 14, fontFamily: "inherit", outline: "none",
                            boxSizing: "border-box",
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = varColor(C.accent); }}
                          onBlur={e => { e.currentTarget.style.borderColor = varColor(C.border); }}
                        />
                        <button
                          type="button"
                          onClick={() => handleBarcodeScan(barcodeValue.trim())}
                          style={{
                            padding: "8px 14px", borderRadius: 9, border: "none",
                            background: barcodeValue.trim() ? varColor(C.accent) : varColor(C.faint),
                            color: "#fff", cursor: barcodeValue.trim() ? "pointer" : "not-allowed",
                            fontWeight: 700, fontSize: 14, fontFamily: "inherit",
                          }}
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Botão Editar Mesa — sempre visível no modo pedido */}
                <button
                  onClick={abrirEditarMesa}
                  title="Editar mesa e apelido"
                  style={{
                    padding: `${sz.padSm - 2}px ${sz.padSm}px`, borderRadius: 10,
                    border: `1px solid var(${C.border})`,
                    background: varColor(C.surface),
                    color: varColor(C.muted), fontWeight: 700, fontSize: sz.fontBase,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "background 0.15s, color 0.15s", whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = varColor(C.card); e.currentTarget.style.color = varColor(C.text); }}
                  onMouseLeave={e => { e.currentTarget.style.background = varColor(C.surface); e.currentTarget.style.color = varColor(C.muted); }}
                >
                  <LuPencil size={sz.fontBase - 2} />
                  {selected?.mesa ? `Mesa ${selected.mesa}` : "Mesa"}
                </button>

                {itensLancados.length > 0 ? (
                  <>
                  <button
                    onClick={abrirTransferir}
                    style={{
                      padding: `${sz.padSm - 2}px ${sz.padSm}px`, borderRadius: 10,
                      border: `1px solid var(${C.border})`,
                      background: varColor(C.surface),
                      color: varColor(C.muted), fontWeight: 700, fontSize: sz.fontBase,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "background 0.15s, color 0.15s", whiteSpace: "nowrap",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = varColor(C.card); e.currentTarget.style.color = varColor(C.text); }}
                    onMouseLeave={e => { e.currentTarget.style.background = varColor(C.surface); e.currentTarget.style.color = varColor(C.muted); }}
                  >
                    <LuArrowLeftRight size={sz.fontBase - 1} /> Transferir
                  </button>
                  <button
                    onClick={() => { setShowCancelarComanda(true); setCancelarSenha(""); setCancelarSenhaErro(false); setCancelarAutorizado(false); setCancelarMotivo(""); }}
                    style={{
                      padding: `${sz.padSm - 2}px ${sz.padSm}px`, borderRadius: 10,
                      border: `1px solid ${alfa(C.red, "55")}`,
                      background: `${alfa(C.red, "0f")}`,
                      color: varColor(C.red), fontWeight: 700, fontSize: sz.fontBase,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "background 0.15s", whiteSpace: "nowrap",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${alfa(C.red, "22")}`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${alfa(C.red, "0f")}`; }}
                  >
                    <LuX size={sz.fontBase - 1} /> Cancelar Comanda
                  </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setConfirmCancelar(true); setConfirmCancelarMotivo(""); }}
                    style={{
                      padding: `${sz.padSm - 2}px ${sz.padSm}px`, borderRadius: 10,
                      border: `1px solid ${alfa(C.red, "55")}`,
                      background: `${alfa(C.red, "0f")}`,
                      color: varColor(C.red), fontWeight: 700, fontSize: sz.fontBase,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "background 0.15s", whiteSpace: "nowrap",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = `${alfa(C.red, "1e")}`}
                    onMouseLeave={e => e.currentTarget.style.background = `${alfa(C.red, "0f")}`}
                  >
                    Cancelar Pedido
                  </button>
                )}
              </div>
            );
          })()}
          </div>
        </div>
      )}

      {/* ── Alerta de estoque (mapa + lista) ───────────────────── */}
      {(mode === "mapa" || mode === "grid") && (() => {
        const criticos = products.filter(p => {
          const q = estoque[p.id] ?? 0;
          return q === 0;
        });
        const baixos = products.filter(p => {
          const q = estoque[p.id] ?? 0;
          return q > 0 && q <= 10;
        });
        const total = criticos.length + baixos.length;
        if (total === 0) return null;
        return (
          <div style={{
            flexShrink: 0,
            borderBottom: `1px solid #f59e0b44`,
            background: "#f59e0b0c",
          }}>
            {/* Cabeçalho do alerta */}
            <button
              onClick={() => setAlertaAberto(v => !v)}
              style={{
                width: "100%", background: "none", border: "none",
                cursor: "pointer", padding: "10px 24px",
                display: "flex", alignItems: "center", gap: 10,
                textAlign: "left",
              }}
            >
              <LuTriangleAlert size={16} color="#f59e0b" />
              <span style={{ fontWeight: 700, fontSize: 16, color: "#f59e0b", flex: 1 }}>
                {criticos.length > 0 && `${criticos.length} produto${criticos.length !== 1 ? "s" : ""} sem estoque`}
                {criticos.length > 0 && baixos.length > 0 && " · "}
                {baixos.length > 0 && `${baixos.length} produtos com estoque baixo`}
              </span>
              <span style={{ fontSize: 18, color: "#f59e0b", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                {alertaAberto ? <><LuChevronUp size={14} /> Ocultar</> : <><LuChevronDown size={14} /> Ver</>}
              </span>
            </button>

            {/* Lista de itens */}
            {alertaAberto && (
              <div style={{
                padding: "0 24px 12px",
                display: "flex", gap: 8, flexWrap: "wrap",
              }}>
                {criticos.map(p => (
                  <span key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 12px", borderRadius: 20, fontSize: 18, fontWeight: 700,
                    background: `${alfa(C.red, "18")}`, border: `1px solid ${alfa(C.red, "44")}`, color: varColor(C.red),
                  }}>
                    {p.emoji} {p.name} · <span style={{ fontWeight: 900 }}>0</span>
                  </span>
                ))}
                {baixos.map(p => (
                  <span key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 12px", borderRadius: 20, fontSize: 18, fontWeight: 700,
                    background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b",
                  }}>
                    {p.emoji} {p.name} · <span style={{ fontWeight: 900 }}>{estoque[p.id]}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab Mapa / Lista ─────────────────────────────────────── */}
      {(mode === "mapa" || mode === "grid") && (
        <div style={{
          flexShrink: 0,
          display: "flex",
          borderBottom: `1px solid var(${C.border})`,
          padding: `0 ${sz.pad}px`,
        }}>
          {[
            { key: "mapa", label: "Mapa",  Icon: LuLayoutGrid },
            { key: "grid", label: "Lista", Icon: LuList },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              style={{
                padding: `10px 18px`,
                background: "none", border: "none",
                borderBottom: `2px solid ${mode === key ? varColor(C.accent) : "transparent"}`,
                color: mode === key ? varColor(C.accent) : varColor(C.muted),
                fontWeight: 700, fontSize: sz.fontBase,
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                transition: "color 0.15s, border-color 0.15s",
                marginBottom: -1,
                fontFamily: "inherit",
              }}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      )}

      {/* ── Busca de comandas (apenas na lista) ──────────────────── */}
      {mode === "grid" && (
        <div style={{
          flexShrink: 0,
          padding: "16px 24px",
          borderBottom: `1px solid var(${C.border})`,
          display: "flex", justifyContent: "center",
        }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 760 }}>
            <LuSearch
              size={20}
              color={buscaComanda ? varColor(C.accent) : varColor(C.muted)}
              style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.15s" }}
            />
            <input
              value={buscaComanda}
              onChange={e => { if (e.target.value === "" || /^\d+$/.test(e.target.value)) setBuscaComanda(e.target.value); }}
              placeholder="Buscar comanda..."
              inputMode="numeric"
              style={{
                width: "100%",
                padding: "16px 52px",
                borderRadius: 14,
                border: `1.5px solid ${buscaComanda ? varColor(C.accent) + "88" : varColor(C.border)}`,
                background: varColor(C.surface),
                color: varColor(C.text),
                fontSize: 18,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
            />
            {buscaComanda && (
              <button
                onClick={() => setBuscaComanda("")}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: varColor(C.muted), display: "flex", padding: 2 }}
              >
                <LuX size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {mode === "mapa" && (
          <MesaMapView
            mesas={mesas}
            loading={mesasLoading}
            abertas={abertas}
            onSelectComanda={handleSelectComanda}
            onOpenEmpty={handleOpenEmpty}
          />
        )}

        {mode === "grid" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <ComandaGrid
              abertas={abertas}
              visitadas={lancadas}
              selected={null}
              onSelect={handleSelectComanda}
              onOpenEmpty={handleOpenEmpty}
              busca={buscaComanda}
            />
          </div>
        )}

        {mode === "pedido" && (
          <>
            {/* Tab bar — só no mobile */}
            {isMob && (
              <div style={{
                display: "flex", flexShrink: 0,
                borderBottom: `1px solid var(${C.border})`,
              }}>
                {[
                  { key: "produtos",  label: "Produtos",  Icon: LuShoppingBag },
                  { key: "carrinho", label: `Carrinho${cartItems.length > 0 ? ` (${cartItems.length})` : ""}`, Icon: LuShoppingCart },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setAbaAtiva(key)}
                    style={{
                      flex: 1, padding: "13px 0",
                      background: abaAtiva === key ? varColor(C.alow) : "none",
                      border: "none",
                      borderBottom: `2px solid ${abaAtiva === key ? varColor(C.accent) : "transparent"}`,
                      color: abaAtiva === key ? varColor(C.accent) : varColor(C.muted),
                      fontWeight: 700, fontSize: 17, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <Icon size={15} />{label}
                  </button>
                ))}
              </div>
            )}

            {/* Produtos */}
            {(!isMob || abaAtiva === "produtos") && (
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <ProductGrid products={products} onAdd={handleAddProduct} />
              </div>
            )}

            {/* Carrinho */}
            {(!isMob || abaAtiva === "carrinho") && (
              <CartPanel
                comanda={selected}
                items={cartItems}
                onChangeQty={handleChangeQty}
                onChangeObs={handleChangeObs}
                onLancar={handleLancar}
                onFinalizar={handleFinalizar}
                salvando={salvando}
                onRemoveAcumulado={async (idx, qty, motivo) => {
                  const novos = selected.items.map((it, i) => {
                    if (i !== idx) return it;
                    const novaQty = (it.qty ?? 1) - qty;
                    if (novaQty > 0) {
                      // cancela parcialmente: divide em ativo + cancelado
                      return [
                        { ...it, qty: novaQty },
                        { ...it, qty, cancelado: true, motivoCancelamento: motivo || "", canceladoPor: currentUser?.name || "" },
                      ];
                    }
                    return { ...it, cancelado: true, motivoCancelamento: motivo || "", canceladoPor: currentUser?.name || "" };
                  }).flat();
                  const novoTotal = novos.filter(i => !i.cancelado).reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
                  await updatePending(selected.id, { items: novos, total: novoTotal });
                  setSelected(prev => ({ ...prev, items: novos, total: novoTotal }));
                }}
              />
            )}
          </>
        )}

        {mode === "checkout" && (
          <CheckoutView
            comanda={selected}
            items={[
              ...(Array.isArray(selected?.items) ? selected.items : []),
              ...cartItems.map(({ _key, ...r }) => r),
            ]}
            onConfirm={handleConfirmPayment}
            onBack={() => setMode("pedido")}
          />
        )}
      </div>

      {/* ── Modal: Nova Comanda ──────────────────────────────────── */}
      {showNova && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowNova(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200,
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 16, padding: 28,
            width: 340, border: `1px solid var(${C.border})`,
          }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Nova Comanda</div>
            <div style={{ fontSize: 16, color: varColor(C.muted), marginBottom: 20 }}>
              Informe o nome ou número da mesa
            </div>

            <label style={{ fontSize: 14, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>
              Nome / Número
            </label>
            <input
              autoFocus
              value={nomeComanda}
              onChange={e => setNomeComanda(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleNovaComanda()}
              placeholder="Ex: Mesa 1, Balcão, Delivery..."
              maxLength={30}
              style={{
                display: "block", width: "100%", marginTop: 8,
                padding: "12px 14px", borderRadius: 10,
                border: `1px solid var(${C.border})`,
                background: varColor(C.surface), color: varColor(C.text), fontSize: 18,
                boxSizing: "border-box", fontFamily: "inherit", outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowNova(false)}
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: 17,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleNovaComanda}
                disabled={!nomeComanda.trim() || criando}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, border: "none",
                  background: nomeComanda.trim() ? varColor(C.accent) : varColor(C.faint),
                  color: "#fff",
                  cursor: nomeComanda.trim() ? "pointer" : "not-allowed",
                  fontWeight: 700, fontSize: 17,
                }}
              >
                {criando ? "Abrindo..." : "Abrir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popup: Cancelar Comanda ─────────────────────────────── */}
      {showCancelarComanda && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowCancelarComanda(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, border: `1px solid var(${C.border})`,
            width: "100%", maxWidth: 420,
            display: "flex", flexDirection: "column",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}>
            {/* Header */}
            <div style={{ padding: "22px 28px 18px", borderBottom: `1px solid var(${C.border})`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 20, color: varColor(C.red) }}>Cancelar Comanda</div>
                <div style={{ fontSize: 15, color: varColor(C.muted), marginTop: 3 }}>{fmtComanda(selected?.comanda)}</div>
              </div>
              <button onClick={() => setShowCancelarComanda(false)} style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 6 }}>
                <LuX size={20} />
              </button>
            </div>

            <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
              {!cancelarAutorizado ? (
                <>
                  <div style={{ fontSize: 16, color: varColor(C.muted), lineHeight: 1.5 }}>
                    Esta ação cancelará <strong style={{ color: varColor(C.text) }}>todos os itens</strong> da comanda. Digite a senha de administrador ou gerente para continuar.
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      autoFocus
                      type={cancelarSenhaVis ? "text" : "password"}
                      value={cancelarSenha}
                      onChange={e => { setCancelarSenha(e.target.value); setCancelarSenhaErro(false); }}
                      onKeyDown={async e => {
                        if (e.key === "Enter") {
                          const ok = await verificarSenhaAdmin(cancelarSenha);
                          if (ok) { setCancelarAutorizado(true); setCancelarSenhaErro(false); }
                          else setCancelarSenhaErro(true);
                        }
                      }}
                      placeholder="Senha de admin ou gerente"
                      style={{
                        width: "100%", padding: "13px 44px 13px 16px", borderRadius: 10, boxSizing: "border-box",
                        border: `1.5px solid ${cancelarSenhaErro ? varColor(C.red) : varColor(C.border)}`,
                        background: varColor(C.surface), color: varColor(C.text), fontSize: 17, fontFamily: "inherit", outline: "none",
                      }}
                    />
                    <button
                      onClick={() => setCancelarSenhaVis(v => !v)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4 }}
                    >
                      {cancelarSenhaVis ? <LuEyeOff size={18} /> : <LuEye size={18} />}
                    </button>
                  </div>
                  {cancelarSenhaErro && <div style={{ fontSize: 15, color: varColor(C.red), fontWeight: 600 }}>Senha incorreta.</div>}
                  <button
                    onClick={async () => {
                      const ok = await verificarSenhaAdmin(cancelarSenha);
                      if (ok) { setCancelarAutorizado(true); setCancelarSenhaErro(false); }
                      else setCancelarSenhaErro(true);
                    }}
                    disabled={!cancelarSenha}
                    style={{
                      padding: "13px", borderRadius: 10, border: "none",
                      background: cancelarSenha ? varColor(C.accent) : varColor(C.faint),
                      color: "#fff", fontWeight: 700, fontSize: 17,
                      cursor: cancelarSenha ? "pointer" : "not-allowed", fontFamily: "inherit",
                    }}
                  >
                    Verificar Senha
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 16, color: varColor(C.muted), lineHeight: 1.5 }}>
                    Motivo do cancelamento <span style={{ color: varColor(C.red) }}>*</span>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={cancelarMotivo}
                    onChange={e => setCancelarMotivo(e.target.value)}
                    placeholder="Ex: cliente desistiu, erro no pedido..."
                    maxLength={120}
                    style={{
                      width: "100%", padding: "13px 16px", borderRadius: 10, boxSizing: "border-box",
                      border: `1.5px solid ${cancelarMotivo.trim() ? varColor(C.accent) + "88" : varColor(C.border)}`,
                      background: varColor(C.surface), color: varColor(C.text), fontSize: 17, fontFamily: "inherit", outline: "none",
                    }}
                  />
                  <div style={{ padding: "14px 16px", borderRadius: 10, background: `${alfa(C.red, "12")}`, border: `1px solid ${alfa(C.red, "44")}`, fontSize: 15, color: varColor(C.red), fontWeight: 600 }}>
                    ⚠️ {(selected?.items ?? []).filter(i => !i.cancelado).length} item(ns) serão cancelados e enviados para o relatório.
                  </div>
                  <button
                    onClick={async () => {
                      if (cancelandoComanda) return;
                      setCancelandoComanda(true);
                      try {
                        await cancelarComanda(selected, cancelarMotivo);
                        setShowCancelarComanda(false);
                        setSelected(null);
                        setMode("grid");
                      } finally {
                        setCancelandoComanda(false);
                      }
                    }}
                    disabled={cancelandoComanda || !cancelarMotivo.trim()}
                    style={{
                      padding: "13px", borderRadius: 10, border: "none",
                      background: (cancelandoComanda || !cancelarMotivo.trim()) ? varColor(C.faint) : varColor(C.red),
                      color: "#fff", fontWeight: 800, fontSize: 17,
                      cursor: (cancelandoComanda || !cancelarMotivo.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit",
                      boxShadow: cancelarMotivo.trim() ? `0 4px 16px ${alfa(C.red, "44")}` : "none",
                    }}
                  >
                    {cancelandoComanda ? "Cancelando..." : "✕ Confirmar Cancelamento"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Popup: Transferir Itens ─────────────────────────────── */}
      {showTransferir && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowTransferir(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20,
            width: "100%", maxWidth: 520,
            maxHeight: "85vh", display: "flex", flexDirection: "column",
            border: `1px solid var(${C.border})`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: varColor(C.text), overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px", borderBottom: `1px solid var(${C.border})`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
                  <LuArrowLeftRight size={18} /> Transferir itens
                </div>
                <div style={{ fontSize: 18, color: varColor(C.muted), marginTop: 2 }}>
                  De: {/^\d+$/.test(String(selected?.comanda ?? "").trim()) ? `Comanda ${selected?.comanda}` : selected?.comanda}
                </div>
              </div>
              <button
                onClick={() => setShowTransferir(false)}
                style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, fontSize: 18, fontWeight: 400 }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {/* Seção: itens a transferir */}
              <div style={{ padding: "16px 24px 8px", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Selecione os itens e quantidades
                </div>
                {(Array.isArray(selected?.items) ? selected.items : []).map((item, idx) => {
                  const qty    = item.qty ?? 1;
                  const qSel   = transQtds[idx] ?? 0;
                  const ativo  = qSel > 0;
                  return (
                    <div key={idx} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: 12, marginBottom: 6,
                      border: `1.5px solid ${ativo ? varColor(C.accent) + "66" : varColor(C.border)}`,
                      background: ativo ? `${alfa(C.accent, "08")}` : varColor(C.surface),
                      transition: "border-color 0.15s, background 0.15s",
                    }}>
                      {item.emoji && <span style={{ fontSize: 18 }}>{item.emoji}</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 14, color: varColor(C.muted) }}>Disponível: {qty}</div>
                      </div>
                      {/* Qty selector */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: Math.max(0, (prev[idx] ?? 0) - 1) }))}
                          style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid var(${C.border})`, background: varColor(C.card), color: varColor(C.text), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <span style={{ fontSize: 16, lineHeight: 1 }}>−</span>
                        </button>
                        <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 17, color: ativo ? varColor(C.accent) : varColor(C.muted) }}>
                          {qSel}
                        </span>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: Math.min(qty, (prev[idx] ?? 0) + 1) }))}
                          style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid var(${C.border})`, background: varColor(C.card), color: varColor(C.text), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                        </button>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: prev[idx] === qty ? 0 : qty }))}
                          style={{
                            padding: "4px 10px", borderRadius: 7, border: "none",
                            background: ativo ? `${alfa(C.accent, "22")}` : varColor(C.surface),
                            color: ativo ? varColor(C.accent) : varColor(C.muted),
                            cursor: "pointer", fontSize: 14, fontWeight: 700,
                          }}
                        >
                          {ativo && qSel === qty ? "Todos ✓" : "Todos"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Seção: comanda destino */}
              <div style={{ padding: "8px 24px 16px", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Transferir para
                </div>

                {/* Abas de modo */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {[
                    { id: "lista",  label: "Comandas abertas" },
                    { id: "numero", label: "Buscar por número" },
                    { id: "nova",   label: "+ Nova comanda" },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setTransMode(tab.id); setTransDestino(null); setTransNumeroErro(""); }}
                      style={{
                        padding: "6px 12px", borderRadius: 8, fontSize: 18, fontWeight: 700,
                        border: `1.5px solid ${transMode === tab.id ? varColor(C.accent) : varColor(C.border)}`,
                        background: transMode === tab.id ? `${alfa(C.accent, "14")}` : varColor(C.surface),
                        color: transMode === tab.id ? varColor(C.accent) : varColor(C.muted),
                        cursor: "pointer",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Modo: lista de comandas abertas */}
                {transMode === "lista" && (
                  abertas.filter(o => o.id !== selected?.id).length === 0 ? (
                    <div style={{ fontSize: 16, color: varColor(C.muted), padding: "12px 0" }}>
                      Nenhuma outra comanda aberta.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {abertas.filter(o => o.id !== selected?.id).map(o => {
                        const nome = fmtComanda(o.comanda) || `#${String(o.id).slice(-4).toUpperCase()}`;
                        const sel  = transDestino === o.id;
                        return (
                          <button
                            key={o.id}
                            onClick={() => setTransDestino(o.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              padding: "10px 14px", borderRadius: 12,
                              border: `1.5px solid ${sel ? varColor(C.green) + "88" : varColor(C.border)}`,
                              background: sel ? `${alfa(C.green, "0f")}` : varColor(C.surface),
                              cursor: "pointer", textAlign: "left", color: varColor(C.text),
                              transition: "border-color 0.15s, background 0.15s",
                            }}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                              background: sel ? `${alfa(C.green, "22")}` : varColor(C.card),
                              border: `1px solid ${sel ? varColor(C.green) + "55" : varColor(C.border)}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 17, fontWeight: 800, color: sel ? varColor(C.green) : varColor(C.muted),
                            }}>
                              {sel ? "✓" : "#"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 16 }}>{nome}</div>
                              {o.garcom && <div style={{ fontSize: 14, color: varColor(C.muted) }}>{o.garcom}</div>}
                            </div>
                            {o.total > 0 && (
                              <div style={{ fontWeight: 700, fontSize: 16, color: varColor(C.green), flexShrink: 0 }}>
                                R$ {Number(o.total).toFixed(2)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Modo: buscar por número */}
                {transMode === "numero" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ position: "relative" }}>
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        value={transNumero}
                        onChange={e => { setTransNumero(e.target.value.replace(/\D/g, "")); setTransNumeroErro(""); setTransDestino(null); }}
                        placeholder="Ex: 42"
                        style={{
                          width: "100%", padding: "12px 16px", borderRadius: 10,
                          border: `1.5px solid ${transNumeroErro ? varColor(C.red) : varColor(C.border)}`,
                          background: varColor(C.surface), color: varColor(C.text),
                          fontSize: 18, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                        }}
                      />
                    </div>
                    {transNumeroErro && (
                      <div style={{ fontSize: 18, color: varColor(C.red), fontWeight: 600 }}>{transNumeroErro}</div>
                    )}
                    {/* Preview da comanda encontrada */}
                    {(() => {
                      if (!transNumero.trim()) return null;
                      const encontrada = abertas.find(o => String(o.comanda).trim() === transNumero.trim() && o.id !== selected?.id);
                      if (!encontrada) return (
                        <div style={{ fontSize: 18, color: varColor(C.muted), padding: "6px 0" }}>
                          Nenhuma comanda aberta com esse número.
                        </div>
                      );
                      return (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                          borderRadius: 12, border: `1.5px solid ${alfa(C.green, "66")}`,
                          background: `${alfa(C.green, "0a")}`,
                        }}>
                          <div style={{ fontSize: 18 }}>✓</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: varColor(C.green) }}>{fmtComanda(encontrada.comanda)}</div>
                            {encontrada.garcom && <div style={{ fontSize: 14, color: varColor(C.muted) }}>{encontrada.garcom}</div>}
                          </div>
                          {encontrada.total > 0 && (
                            <div style={{ marginLeft: "auto", fontWeight: 700, fontSize: 16, color: varColor(C.green) }}>
                              R$ {Number(encontrada.total).toFixed(2)}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Modo: nova comanda */}
                {transMode === "nova" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 18, color: varColor(C.muted), marginBottom: 2 }}>
                      Uma nova comanda será criada com os itens selecionados.
                    </div>
                    <input
                      autoFocus
                      type="text"
                      value={transNomeNova}
                      onChange={e => { setTransNomeNova(e.target.value); setTransNumeroErro(""); }}
                      placeholder="Nome ou número da nova comanda (ex: 99)"
                      style={{
                        width: "100%", padding: "12px 16px", borderRadius: 10,
                        border: `1.5px solid ${transNumeroErro ? varColor(C.red) : varColor(C.border)}`,
                        background: varColor(C.surface), color: varColor(C.text),
                        fontSize: 17, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                      }}
                    />
                    {transNumeroErro && (
                      <div style={{ fontSize: 18, color: varColor(C.red), fontWeight: 600 }}>{transNumeroErro}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            {(() => {
              const algumSelecionado = Object.values(transQtds).some(q => q > 0);
              const qtdTransferir    = Object.values(transQtds).reduce((s, q) => s + q, 0);

              let pode = false;
              let nomeDestino = "";
              if (transMode === "lista") {
                pode = algumSelecionado && !!transDestino;
                const d = abertas.find(o => o.id === transDestino);
                nomeDestino = d ? fmtComanda(d.comanda) : "";
              } else if (transMode === "numero") {
                const encontrada = abertas.find(o => String(o.comanda).trim() === transNumero.trim() && o.id !== selected?.id);
                pode = algumSelecionado && !!encontrada;
                nomeDestino = encontrada ? fmtComanda(encontrada.comanda) : "";
              } else if (transMode === "nova") {
                pode = algumSelecionado && !!transNomeNova.trim();
                nomeDestino = transNomeNova.trim() ? fmtComanda(transNomeNova.trim()) : "nova comanda";
              }

              return (
                <div style={{ padding: "16px 24px", borderTop: `1px solid var(${C.border})`, flexShrink: 0, display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowTransferir(false)}
                    style={{
                      flex: 1, padding: "12px 0", borderRadius: 12,
                      border: `1px solid var(${C.border})`, background: "none",
                      color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: 17,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleTransferir}
                    disabled={!pode || transferindo}
                    style={{
                      flex: 2, padding: "12px 16px", borderRadius: 12, border: "none",
                      background: pode ? varColor(C.green) : varColor(C.faint),
                      color: "#fff", cursor: pode ? "pointer" : "not-allowed",
                      fontWeight: 800, fontSize: 17, fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      boxShadow: pode ? `0 4px 16px ${alfa(C.green, "44")}` : "none",
                      transition: "background 0.2s, box-shadow 0.2s",
                    }}
                  >
                    {transferindo
                      ? "Transferindo..."
                      : pode
                        ? <><LuArrowLeftRight size={16} /> Transferindo para {nomeDestino}</>
                        : "Selecione itens e destino"}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ── Popup: Confirmar cancelamento ───────────────────────── */}
      {confirmCancelar && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setConfirmCancelar(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, padding: 28,
            width: "100%", maxWidth: 400,
            border: `1px solid var(${C.border})`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: varColor(C.text),
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${alfa(C.red, "18")}`, border: `1.5px solid ${alfa(C.red, "44")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22,
              }}>
                🗑️
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>Cancelar pedido?</div>
                <div style={{ fontSize: 16, color: varColor(C.muted), marginTop: 2 }}>
                  {/^\d+$/.test(String(selected?.comanda ?? "").trim()) ? `Comanda ${selected?.comanda}` : selected?.comanda}
                </div>
              </div>
            </div>

            <div style={{
              padding: "12px 16px", borderRadius: 10, marginBottom: 16,
              background: `${alfa(C.red, "0d")}`, border: `1px solid ${alfa(C.red, "33")}`,
              fontSize: 16, color: varColor(C.muted), lineHeight: 1.5,
            }}>
              A comanda será <strong style={{ color: varColor(C.red) }}>removida permanentemente</strong>. Esta ação não pode ser desfeita.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 0.8 }}>
                Motivo do cancelamento <span style={{ color: varColor(C.red) }}>*</span>
              </div>
              <input
                autoFocus
                type="text"
                value={confirmCancelarMotivo}
                onChange={e => setConfirmCancelarMotivo(e.target.value)}
                placeholder="Ex: cliente desistiu, erro no pedido..."
                maxLength={120}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 10, boxSizing: "border-box",
                  border: `1.5px solid ${confirmCancelarMotivo.trim() ? varColor(C.accent) + "88" : varColor(C.border)}`,
                  background: varColor(C.surface), color: varColor(C.text), fontSize: 16, fontFamily: "inherit", outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmCancelar(false)}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: 17,
                }}
              >
                Voltar
              </button>
              <button
                onClick={async () => {
                  setConfirmCancelar(false);
                  const itensComanda = Array.isArray(selected?.items) ? selected.items : [];
                  logAction(currentUser?.username, "comanda:cancelar", { msg: `Comanda cancelada: ${fmtComanda(selected.comanda)}`, name: currentUser?.name, role: currentUser?.role, comanda: selected.comanda, motivo: confirmCancelarMotivo.trim(), items: itensComanda });
                  emitirEvento("pedido.cancelado", "pedidos", { pedido_id: selected.id, comanda: selected.comanda, motivo: confirmCancelarMotivo.trim(), itens: itensComanda.length }, currentUser?.username);
                  await removePending(selected.id);
                  handleBack();
                }}
                disabled={!confirmCancelarMotivo.trim()}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                  background: confirmCancelarMotivo.trim() ? varColor(C.red) : varColor(C.faint),
                  color: "#fff",
                  cursor: confirmCancelarMotivo.trim() ? "pointer" : "not-allowed",
                  fontWeight: 800, fontSize: 18,
                }}
              >
                Sim, cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Popup: Mesa ──────────────────────────────────────────── */}
      {showMesa && mesaPendingOrder && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) { handleConfirmarMesa(); } }}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20,
            width: "100%", maxWidth: 380,
            border: `1px solid var(${C.border})`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: varColor(C.text), overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px", borderBottom: `1px solid var(${C.border})`,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20,
              }}>
                🪑
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>
                  {fmtComanda(mesaPendingOrder.comanda)}
                </div>
                <div style={{ fontSize: 18, color: varColor(C.muted), marginTop: 1 }}>
                  {mesaPendingOrder.mesa ? "Editar mesa e apelido" : "Informe a mesa antes de continuar"}
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Mesa */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 18, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Número ou nome da mesa <span style={{ color: varColor(C.red) }}>*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={mesaInput}
                  onChange={e => setMesaInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConfirmarMesa()}
                  placeholder="Ex: 5, Varanda, Salão 2..."
                  maxLength={40}
                  style={{
                    width: "100%", padding: "13px 16px", borderRadius: 10,
                    border: `1.5px solid ${!mesaInput.trim() ? varColor(C.red) + "88" : varColor(C.border)}`,
                    background: varColor(C.surface),
                    color: varColor(C.text), fontSize: 18, fontFamily: "inherit",
                    outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = varColor(C.accent) + "88"}
                  onBlur={e => e.currentTarget.style.borderColor = !mesaInput.trim() ? varColor(C.red) + "88" : varColor(C.border)}
                />
                {!mesaInput.trim() && (
                  <div style={{ fontSize: 14, color: varColor(C.red), fontWeight: 600 }}>Campo obrigatório.</div>
                )}
              </div>

              {/* Apelido */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 18, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Apelido do cliente <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                </label>
                <input
                  type="text"
                  value={apelidoInput}
                  onChange={e => setApelidoInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConfirmarMesa()}
                  placeholder="Ex: João, Família Silva..."
                  maxLength={40}
                  style={{
                    width: "100%", padding: "13px 16px", borderRadius: 10,
                    border: `1.5px solid var(${C.border})`, background: varColor(C.surface),
                    color: varColor(C.text), fontSize: 18, fontFamily: "inherit",
                    outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = varColor(C.accent) + "88"}
                  onBlur={e => e.currentTarget.style.borderColor = varColor(C.border)}
                />
              </div>

              <div style={{ fontSize: 14, color: varColor(C.muted) }}>
                Apelido é opcional. Pressione Enter ou clique em Entrar para continuar.
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowMesa(false); setMesaPendingOrder(null); }}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 11,
                    border: `1px solid var(${C.border})`, background: "none",
                    color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: 17,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarMesa}
                  disabled={salvandoMesa || !mesaInput.trim()}
                  style={{
                    flex: 2, padding: "12px 0", borderRadius: 11, border: "none",
                    background: mesaInput.trim() ? varColor(C.accent) : varColor(C.faint),
                    color: "#fff",
                    cursor: (salvandoMesa || !mesaInput.trim()) ? "not-allowed" : "pointer",
                    fontWeight: 800, fontSize: 17,
                    opacity: salvandoMesa ? 0.7 : 1,
                  }}
                >
                  {salvandoMesa ? "Entrando..." : "Entrar na comanda →"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Popup: Saldo do Dia ──────────────────────────────────── */}
      {showSaldo && createPortal(
        <SaldoModal
          onClose={() => setShowSaldo(false)}
          senha={saldoSenha}
          setSenha={setSaldoSenha}
          senhaErro={saldoSenhaErro}
          setSenhaErro={setSaldoSenhaErro}
          autorizado={saldoAutorizado}
          setAutorizado={setSaldoAutorizado}
          senhaVis={saldoSenhaVis}
          setSenhaVis={setSaldoSenhaVis}
          users={users}
          sales={sales}
          pending={pending}
          metodosCustom={metodosCustom}
        />,
        document.body
      )}

    </div>
  );
}

// ── Modal de Saldo do Dia ─────────────────────────────────────────
function SaldoModal({ onClose, senha, setSenha, senhaErro, setSenhaErro, autorizado, setAutorizado, senhaVis, setSenhaVis, users, sales, pending, metodosCustom }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const isNarrow = width < 540;
  const hoje = new Date().toDateString();
  const [logsComandaCancelada, setLogsComandaCancelada] = useState([]);
  const [showCancelList, setShowCancelList] = useState(false);

  useEffect(() => {
    if (!autorizado) return;
    const inicioDia = new Date(new Date().toDateString()).toISOString();
    supabase
      .from("operator_logs")
      .select("payload, created_at")
      .eq("action_type", "comanda:cancelar")
      .gte("created_at", inicioDia)
      .then(({ data }) => setLogsComandaCancelada(data ?? []));
  }, [autorizado]);

  const vendasHoje = (sales ?? []).filter(s => s.at && new Date(s.at).toDateString() === hoje);
  const totalVendas = vendasHoje.reduce((s, v) => s + (v.total ?? 0), 0);
  const qtdVendas   = vendasHoje.length;

  const abertas = (pending ?? []).filter(p => p.status !== "closed");
  const totalAberto = abertas.reduce((s, p) => {
    const ativos = (Array.isArray(p.items) ? p.items : []).filter(i => !i.cancelado);
    return s + ativos.reduce((x, i) => x + (i.price ?? 0) * (i.qty ?? 1), 0);
  }, 0);

  // Cancelamentos: itens cancelados em comandas abertas + em vendas do dia + comandas inteiras canceladas
  const canceladosAbertos = abertas.flatMap(p =>
    (Array.isArray(p.items) ? p.items : []).filter(i => i.cancelado)
  );
  const canceladosFechados = vendasHoje.flatMap(v =>
    (Array.isArray(v.items) ? v.items : []).filter(i => i.cancelado)
  );
  // Itens de comandas inteiras canceladas (vindos dos logs)
  const canceladosComanda = logsComandaCancelada.flatMap(log => {
    const items = Array.isArray(log.payload?.items) ? log.payload.items : [];
    const motivo = log.payload?.motivo || "";
    const canceladoPor = log.payload?.name || "";
    const comanda = log.payload?.comanda || "—";
    return items.map(i => ({ ...i, motivoCancelamento: motivo, canceladoPor, _comanda: comanda, _comandaCancelada: true }));
  });
  const todosCancelados = [...canceladosAbertos, ...canceladosFechados, ...canceladosComanda];
  const totalCancelado  = todosCancelados.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 1), 0);
  const qtdCancelados   = todosCancelados.reduce((s, i) => s + (i.qty ?? 1), 0);

  const porMetodo = {};
  vendasHoje.forEach(v => { Object.entries(totalPorMetodo(v)).forEach(([m, val]) => { porMetodo[m] = (porMetodo[m] ?? 0) + val; }); });

  const customLabels = Object.fromEntries((metodosCustom ?? []).map(m => [m.id, m.label]));
  const METODOS_LABEL = { dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "Pix", ...customLabels };
  const METODOS_COLOR = { dinheiro: "#10b981", credito: "#3b82f6", debito: "#8b5cf6", pix: "#f59e0b" };

  const verificarSenha = async () => {
    const match = await verificarSenhaAdmin(senha);
    if (match) { setAutorizado(true); setSenhaErro(false); }
    else        { setSenhaErro(true); }
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9200,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <div style={{
        background: varColor(C.card), borderRadius: 20,
        width: "100%", maxWidth: autorizado ? 560 : 420,
        border: `1px solid var(${C.border})`,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        color: varColor(C.text), overflow: "hidden",
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        transition: "max-width 0.3s",
      }}>
        {/* Header */}
        <div style={{
          padding: `${sz.padSm + 4}px ${sz.pad}px`, borderBottom: `1px solid var(${C.border})`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <LuChartBar size={18} color={varColor(C.accent)} />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: sz.fontBase + 1 }}>Saldo do Dia</div>
              <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted), marginTop: 1 }}>
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Corpo: senha ou dados */}
        {!autorizado ? (
          <div style={{ padding: sz.pad, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: `${alfa(C.accent, "10")}`, border: `1px solid ${alfa(C.accent, "33")}`,
              borderRadius: 12, padding: "12px 16px",
              fontSize: sz.fontSm + 1, color: varColor(C.muted),
            }}>
              <LuLock size={16} color={varColor(C.accent)} style={{ flexShrink: 0 }} />
              Acesso restrito a administradores e gerentes.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: sz.fontSm, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 0.8 }}>
                Senha
              </label>
              <div style={{ position: "relative" }}>
                <input
                  autoFocus
                  type={senhaVis ? "text" : "password"}
                  value={senha}
                  onChange={e => { setSenha(e.target.value); setSenhaErro(false); }}
                  onKeyDown={e => e.key === "Enter" && verificarSenha()}
                  placeholder="Digite a senha de acesso"
                  style={{
                    width: "100%", padding: "12px 44px 12px 16px",
                    borderRadius: 10, border: `1.5px solid ${senhaErro ? varColor(C.red) : varColor(C.border)}`,
                    background: varColor(C.surface), color: varColor(C.text),
                    fontSize: sz.fontBase, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={() => setSenhaVis(v => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", display: "flex", padding: 2 }}
                >
                  {senhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
              {senhaErro && (
                <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.red), fontWeight: 600 }}>
                  Senha incorreta. Apenas administradores e gerentes têm acesso.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase }}>
                Cancelar
              </button>
              <button
                onClick={verificarSenha}
                disabled={!senha.trim()}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: senha.trim() ? varColor(C.accent) : varColor(C.faint), color: "#fff", cursor: senha.trim() ? "pointer" : "not-allowed", fontWeight: 700, fontSize: sz.fontBase }}
              >
                Acessar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: sz.pad, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", flex: 1 }}>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
              {[
                { label: "Vendas Finalizadas",    value: `R$ ${totalVendas.toFixed(2)}`, sub: `${qtdVendas} comanda${qtdVendas !== 1 ? "s" : ""}`, color: varColor(C.green) },
                { label: "Em Aberto (estimado)",  value: `R$ ${totalAberto.toFixed(2)}`, sub: `${abertas.length} comanda${abertas.length !== 1 ? "s" : ""} ativa${abertas.length !== 1 ? "s" : ""}`, color: varColor(C.accent) },
              ].map(k => (
                <div key={k.label} style={{ background: varColor(C.surface), border: `1px solid var(${C.border})`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: sz.fontSm, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontWeight: 900, fontSize: sz.fontLg, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted), marginTop: 3 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Card de Cancelamentos */}
            <div style={{ background: `${alfa(C.red, "0c")}`, border: `1.5px solid ${alfa(C.red, "33")}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: isNarrow ? "wrap" : "nowrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: sz.fontSm, fontWeight: 700, color: varColor(C.red), textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    Cancelamentos do Dia
                  </div>
                  <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted) }}>
                    {qtdCancelados} {qtdCancelados === 1 ? "item cancelado" : "itens cancelados"}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                    {canceladosAbertos.length > 0 && (
                      <span style={{ fontSize: 12, color: varColor(C.muted), background: varColor(C.surface), borderRadius: 6, padding: "2px 8px" }}>
                        {canceladosAbertos.reduce((s,i)=>s+(i.qty??1),0)} em aberto
                      </span>
                    )}
                    {canceladosFechados.length > 0 && (
                      <span style={{ fontSize: 12, color: varColor(C.muted), background: varColor(C.surface), borderRadius: 6, padding: "2px 8px" }}>
                        {canceladosFechados.reduce((s,i)=>s+(i.qty??1),0)} em fechadas
                      </span>
                    )}
                    {canceladosComanda.length > 0 && (
                      <span style={{ fontSize: 12, color: varColor(C.red), background: `${alfa(C.red, "12")}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>
                        {canceladosComanda.reduce((s,i)=>s+(i.qty??1),0)} de comanda{logsComandaCancelada.length !== 1 ? "s" : ""} cancelada{logsComandaCancelada.length !== 1 ? "s" : ""} ({logsComandaCancelada.length})
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontWeight: 900, fontSize: sz.fontLg, color: varColor(C.red), flexShrink: 0 }}>
                  {totalCancelado > 0 ? `- R$ ${totalCancelado.toFixed(2)}` : "R$ 0,00"}
                </div>
              </div>
            </div>

            {/* Total geral */}
            <div style={{ background: `${alfa(C.green, "10")}`, border: `1.5px solid ${alfa(C.green, "44")}`, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: isNarrow ? "wrap" : "nowrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: varColor(C.text) }}>Total do Dia (projetado)</div>
                <div style={{ fontSize: sz.fontSm + 1, color: varColor(C.muted), marginTop: 2 }}>Fechadas + em aberto · cancelamentos não incluídos</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: sz.fontLg + 2, color: varColor(C.green), flexShrink: 0 }}>
                R$ {(totalVendas + totalAberto).toFixed(2)}
              </div>
            </div>

            {/* Por método de pagamento */}
            {Object.keys(porMetodo).length > 0 && (
              <div>
                <div style={{ fontSize: sz.fontSm, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Vendas por Método
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {Object.entries(porMetodo).sort((a, b) => b[1] - a[1]).map(([metodo, val]) => (
                    <div key={metodo} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: varColor(C.surface), borderRadius: 10, padding: "10px 14px", border: `1px solid var(${C.border})` }}>
                      <span style={{ fontSize: sz.fontSm + 1, fontWeight: 700, color: METODOS_COLOR[metodo] ?? varColor(C.muted), background: `${METODOS_COLOR[metodo] ?? varColor(C.muted)}18`, border: `1px solid ${METODOS_COLOR[metodo] ?? varColor(C.muted)}44`, borderRadius: 8, padding: "3px 10px" }}>
                        {METODOS_LABEL[metodo] ?? metodo}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: sz.fontBase, color: varColor(C.text) }}>
                        R$ {Number(val).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detalhe dos itens cancelados — accordion */}
            {todosCancelados.length > 0 && (
              <div style={{ border: `1.5px solid ${alfa(C.red, "33")}`, borderRadius: 14 }}>
                {/* Header clicável */}
                <button
                  type="button"
                  onClick={() => setShowCancelList(v => !v)}
                  style={{
                    width: "100%", padding: "12px 16px", border: "none",
                    borderRadius: showCancelList ? "14px 14px 0 0" : 14,
                    background: showCancelList ? `${alfa(C.red, "0e")}` : `${alfa(C.red, "07")}`,
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "space-between", fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: `${alfa(C.red, "18")}`, border: `1px solid ${alfa(C.red, "33")}`,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <LuX size={13} color={varColor(C.red)} />
                    </div>
                    <span style={{ fontSize: sz.fontSm, fontWeight: 700, color: varColor(C.red), textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Itens Cancelados
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: varColor(C.red),
                      background: `${alfa(C.red, "18")}`, border: `1px solid ${alfa(C.red, "33")}`,
                      borderRadius: 20, padding: "1px 8px",
                    }}>
                      {todosCancelados.reduce((s, i) => s + (i.qty ?? 1), 0)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: sz.fontSm + 1, fontWeight: 800, color: varColor(C.red) }}>
                      {totalCancelado > 0 ? `- R$ ${totalCancelado.toFixed(2)}` : "R$ 0,00"}
                    </span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke={varColor(C.red)} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: showCancelList ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", opacity: 0.7, flexShrink: 0 }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Lista com scroll */}
                {showCancelList && (
                  <div style={{
                    maxHeight: 240, overflowY: "auto",
                    display: "flex", flexDirection: "column", gap: 0,
                    borderTop: `1px solid ${alfa(C.red, "22")}`,
                  }}>
                    {todosCancelados.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 16px", gap: 10,
                          borderBottom: idx < todosCancelados.length - 1 ? `1px solid ${alfa(C.red, "14")}` : "none",
                          background: idx % 2 === 0 ? `${alfa(C.red, "04")}` : "transparent",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: sz.fontSm + 1, color: varColor(C.text), textDecoration: "line-through", opacity: 0.6 }}>
                              {item.emoji ? `${item.emoji} ` : ""}{item.name}{(item.qty ?? 1) > 1 ? ` ×${item.qty}` : ""}
                            </span>
                            {item._comandaCancelada && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: varColor(C.red), background: `${alfa(C.red, "14")}`, borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>
                                comanda cancelada
                              </span>
                            )}
                          </div>
                          {(item.motivoCancelamento || item.canceladoPor || item._comanda) && (
                            <div style={{ fontSize: 11, color: varColor(C.muted), marginTop: 2 }}>
                              {item._comanda ? `${item._comanda} · ` : ""}
                              {item.canceladoPor || ""}
                              {item.motivoCancelamento && item.motivoCancelamento !== "—" ? ` — ${item.motivoCancelamento}` : ""}
                            </div>
                          )}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: sz.fontSm + 1, color: varColor(C.red), flexShrink: 0 }}>
                          - R$ {((item.price ?? 0) * (item.qty ?? 1)).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comandas em aberto */}
            {abertas.length > 0 && (
              <div>
                <div style={{ fontSize: sz.fontSm, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Comandas em Aberto
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {abertas.map(p => {
                    const ativos = (Array.isArray(p.items) ? p.items : []).filter(i => !i.cancelado);
                    const subtotal = ativos.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 1), 0);
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: varColor(C.surface), borderRadius: 10, padding: "9px 13px", border: `1px solid var(${C.border})` }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: sz.fontSm + 1 }}>{fmtComanda(p.comanda)}</div>
                          {p.garcom && <div style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>{p.garcom}</div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                          <div style={{ fontWeight: 800, fontSize: sz.fontBase, color: subtotal > 0 ? varColor(C.accent) : varColor(C.muted) }}>
                            {subtotal > 0 ? `R$ ${subtotal.toFixed(2)}` : "Sem itens"}
                          </div>
                          <div style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
                            {ativos.reduce((s, i) => s + (i.qty ?? 1), 0)} item(ns)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              style={{ padding: "11px 0", borderRadius: 10, border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, flexShrink: 0 }}
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

