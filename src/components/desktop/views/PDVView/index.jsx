import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { LuArrowLeft, LuArrowLeftRight, LuPlus, LuTriangleAlert, LuChevronDown, LuChevronUp, LuShoppingBag, LuShoppingCart, LuLock, LuSearch, LuX, LuChartBar, LuEye, LuEyeOff, LuPencil } from "react-icons/lu";
import ComandaGrid   from "./ComandaGrid";
import ProductGrid   from "./ProductGrid";
import CartPanel     from "./CartPanel";
import CheckoutView  from "./CheckoutView";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

export default function PDVView() {
  const {
    pending, products, estoque,
    addPending, updatePending, removePending, addSale,
    caixaAberto, currentUser, sales, users,
    lancadas, addLancada,
  } = useApp();

  const { width } = useResponsive();
  const isMob = width < 768;
  const sz = getSizes(width);
  const location = useLocation();

  // Reset to grid whenever the sidebar navigates to this page
  useEffect(() => {
    setMode("grid");
    setSelected(null);
    setCartItems([]);
  }, [location.key]);

  // "grid" | "pedido" | "checkout"
  const [mode,        setMode]        = useState("grid");
  const [selected,    setSelected]    = useState(null);
  const [cartItems,   setCartItems]   = useState([]);
  const [salvando,    setSalvando]    = useState(false);
  const [abaAtiva,    setAbaAtiva]    = useState("produtos"); // mobile tab

  const [toast,         setToast]         = useState(false);
  const [alertaAberto,  setAlertaAberto]  = useState(true);
  const [buscaComanda,  setBuscaComanda]  = useState("");

  // modal nova comanda
  const [showNova,          setShowNova]          = useState(false);
  const [nomeComanda,       setNomeComanda]       = useState("");
  const [criando,           setCriando]           = useState(false);
  const [confirmCancelar,   setConfirmCancelar]   = useState(false);
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
  const [showMesa,          setShowMesa]          = useState(false);
  const [mesaInput,         setMesaInput]         = useState("");
  const [apelidoInput,      setApelidoInput]      = useState("");
  const [mesaPendingOrder,  setMesaPendingOrder]  = useState(null);
  const [salvandoMesa,      setSalvandoMesa]      = useState(false);

  const abertas = pending.filter(o => o.status !== "closed");

  // ── Selecionar comanda → pede mesa antes de entrar ────────────
  const handleSelectComanda = (order) => {
    setBuscaComanda("");
    if (order.mesa) {
      // Já tem mesa definida — entra direto
      setSelected(order);
      setCartItems([]);
      setAbaAtiva("produtos");
      setMode("pedido");
    } else {
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
      const mudou = mesa !== (mesaPendingOrder.mesa || "") || apelido !== (mesaPendingOrder.apelido || "");
      if (mudou) await updatePending(mesaPendingOrder.id, { mesa, apelido });
      const order = { ...mesaPendingOrder, mesa, apelido };
      setSelected(order);
      // Só muda de modo se ainda não estava no pedido
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
    setMode("grid");
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
      const anteriores = Array.isArray(selected.items) ? selected.items : [];
      const novos      = cartItems.map(({ _key, ...rest }) => rest);
      const acumulados = [...anteriores, ...novos];
      const total      = acumulados.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
      await updatePending(selected.id, { items: acumulados, total });
      addLancada(selected.id);
      logAction(currentUser?.username, "itens:lancar", { msg: `Itens lançados na ${fmtComanda(selected.comanda)} · ${novos.length} tipo(s) · R$ ${total.toFixed(2)}`, name: currentUser?.name, role: currentUser?.role, comanda: selected.comanda, tipos: novos.length, total });
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
    if (cartItems.length > 0) {
      const anteriores = Array.isArray(selected.items) ? selected.items : [];
      const novos      = cartItems.map(({ _key, ...rest }) => rest);
      const acumulados = [...anteriores, ...novos];
      const novoTotal  = acumulados.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
      await updatePending(selected.id, { items: acumulados, total: novoTotal });
      setSelected(prev => ({ ...prev, items: acumulados, total: novoTotal }));
      setCartItems([]);
    }
    setMode("checkout");
  };

  // ── Confirmar pagamento → grava venda e remove comanda ────────
  const handleConfirmPayment = async ({ metodo, recebido, troco }) => {
    if (!selected) return;
    // Usa os itens já acumulados no pedido; cashier pode ter adicionado itens locais também
    const itensAcumulados = Array.isArray(selected.items) ? selected.items : [];
    const itensLocais     = cartItems.map(({ _key, ...rest }) => rest);
    const todosItens      = [...itensAcumulados, ...itensLocais];
    const total           = todosItens.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);

    const sale = {
      id:      crypto.randomUUID(),
      comanda: selected.comanda,
      items:   todosItens,
      total,
      metodo,
      recebido,
      troco,
      cashier: currentUser?.name || "",
      at:      new Date().toISOString(),
    };

    await addSale(sale);
    await removePending(selected.id);
    logAction(currentUser?.username, "comanda:finalizar", { msg: `Comanda ${selected.comanda} finalizada · R$ ${total.toFixed(2)} · ${metodo}`, name: currentUser?.name, role: currentUser?.role, comanda: selected.comanda, total, metodo });
    handleBack();
  };

  // ── Abrir slot vazio (cria comanda direto pelo número) ────────
  const handleOpenEmpty = async (nome) => {
    if (!caixaAberto) return;
    const order = {
      id:         crypto.randomUUID(),
      comanda:    nome,
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
    setBuscaComanda("");
    setMesaInput("");
    setApelidoInput("");
    setMesaPendingOrder(order);
    setShowMesa(true);
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
      setSelected(prev => ({ ...prev, items: novosOrigem, total: totalOrigem }));
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
        height: "100vh", background: C.bg, gap: 16, fontFamily: "'Inter',system-ui,sans-serif",
        color: C.text, userSelect: "none",
      }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 24, padding: "48px 56px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 420, textAlign: "center" }}>
          <div style={{ background: `${C.accent}1a`, borderRadius: "50%", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LuLock size={36} color={C.accent} />
          </div>
          <div style={{ fontWeight: 900, fontSize: sz.fontLg + 4 }}>Caixa Fechado</div>
          <div style={{ fontSize: sz.fontBase, color: C.muted, lineHeight: 1.6 }}>
            O caixa está fechado. Para realizar operações na frente de caixa, solicite ao responsável que abra o caixa.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, flexDirection: "column" }}>

      {/* ── Header (oculto no checkout — ele tem o próprio) ─────── */}
      {mode !== "checkout" && (
        <div style={{
          padding: "16px 24px", borderBottom: `1px solid ${C.border}`,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}>
          {/* Esquerda: título / voltar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {mode === "pedido" && (
              <button
                onClick={handleBack}
                style={{
                  background: C.surface,
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 10, color: C.text,
                  cursor: "pointer",
                  padding: "10px 18px",
                  fontWeight: 700, fontSize: 18,
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = C.accent;
                  e.currentTarget.style.borderColor = C.accent;
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = C.surface;
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.color = C.text;
                }}
              >
                <LuArrowLeft size={16} /> Voltar
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {mode === "pedido" ? fmtComanda(selected?.comanda) : "Frente de Caixa"}
                </div>
                <div style={{ color: C.muted, fontSize: 16, marginTop: 2 }}>
                  {mode === "pedido"
                    ? <>
                        {selected?.mesa && <span style={{ marginRight: 6 }}>🪑 Mesa {selected.mesa}{selected?.apelido ? ` · ${selected.apelido}` : ""} ·</span>}
                        {cartItems.length} {cartItems.length === 1 ? "tipo de item" : "tipos de item"} no carrinho
                      </>
                    : `${abertas.length} comanda${abertas.length !== 1 ? "s" : ""} em aberto`}
                </div>
              </div>
              {mode === "grid" && (
                <button
                  onClick={() => { setShowSaldo(true); setSaldoSenha(""); setSaldoSenhaErro(false); setSaldoAutorizado(false); setSaldoSenhaVis(false); }}
                  title="Saldo do dia"
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "8px 16px", borderRadius: 10,
                    border: `1px solid ${C.border}`, background: C.surface,
                    color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 16,
                    transition: "background 0.15s, color 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.accent + "66"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
                >
                  <LuChartBar size={15} /> Saldo do Dia
                </button>
              )}
            </div>
          </div>

          {/* Centro: vazio */}
          <div />

          {/* Direita: ações */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
          {/* Toast inline — visível no grid após lançar */}
          {mode === "grid" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: `${C.green}18`, border: `1px solid ${C.green}44`,
              color: C.green, borderRadius: 10, padding: "9px 16px",
              fontWeight: 700, fontSize: 17,
              pointerEvents: "none",
              transition: "opacity 0.3s, transform 0.3s",
              opacity: toast ? 1 : 0,
              transform: toast ? "translateY(0)" : "translateY(-6px)",
            }}>
              ✓ Pedido lançado!
            </div>
          )}
          {mode === "grid" && (
            <button
              onClick={() => { setShowNova(true); setNomeComanda(""); }}
              disabled={!caixaAberto}
              style={{
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: caixaAberto ? C.accent : C.faint,
                color: "#fff", fontWeight: 700, fontSize: 17,
                cursor: caixaAberto ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <LuPlus size={16} /> Nova Comanda
            </button>
          )}

          {mode === "pedido" && (() => {
            const itensLancados = Array.isArray(selected?.items) ? selected.items : [];
            return (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* Botão Editar Mesa — sempre visível no modo pedido */}
                <button
                  onClick={abrirEditarMesa}
                  title="Editar mesa e apelido"
                  style={{
                    padding: "10px 14px", borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: C.surface,
                    color: C.muted, fontWeight: 700, fontSize: 17,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "background 0.15s, color 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.text; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.muted; }}
                >
                  <LuPencil size={14} />
                  {selected?.mesa ? `Mesa ${selected.mesa}` : "Mesa"}
                </button>

                {itensLancados.length > 0 ? (
                  <button
                    onClick={abrirTransferir}
                    style={{
                      padding: "10px 18px", borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.muted, fontWeight: 700, fontSize: 17,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 7,
                      transition: "background 0.15s, color 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.text; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.muted; }}
                  >
                    <LuArrowLeftRight size={15} /> Transferir
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmCancelar(true)}
                    style={{
                      padding: "10px 20px", borderRadius: 10,
                      border: `1px solid ${C.red}55`,
                      background: `${C.red}0f`,
                      color: C.red, fontWeight: 700, fontSize: 17,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = `${C.red}1e`}
                    onMouseLeave={e => e.currentTarget.style.background = `${C.red}0f`}
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

      {/* ── Alerta de estoque (só no grid) ──────────────────────── */}
      {mode === "grid" && (() => {
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
                {baixos.length > 0 && `${baixos.length} com estoque baixo`}
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
                    background: `${C.red}18`, border: `1px solid ${C.red}44`, color: C.red,
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

      {/* ── Busca de comandas (apenas no grid) ──────────────────── */}
      {mode === "grid" && (
        <div style={{
          flexShrink: 0,
          padding: "14px 24px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", justifyContent: "center",
        }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 560 }}>
            <LuSearch
              size={18}
              color={buscaComanda ? C.accent : C.muted}
              style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.15s" }}
            />
            <input
              value={buscaComanda}
              onChange={e => { if (e.target.value === "" || /^\d+$/.test(e.target.value)) setBuscaComanda(e.target.value); }}
              placeholder="Buscar comanda..."
              inputMode="numeric"
              style={{
                width: "100%",
                padding: "13px 44px",
                borderRadius: 12,
                border: `1.5px solid ${buscaComanda ? C.accent + "88" : C.border}`,
                background: C.surface,
                color: C.text,
                fontSize: 16,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
            />
            {buscaComanda && (
              <button
                onClick={() => setBuscaComanda("")}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 2 }}
              >
                <LuX size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

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
                borderBottom: `1px solid ${C.border}`,
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
                      background: abaAtiva === key ? C.alow : "none",
                      border: "none",
                      borderBottom: `2px solid ${abaAtiva === key ? C.accent : "transparent"}`,
                      color: abaAtiva === key ? C.accent : C.muted,
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
            background: C.card, borderRadius: 16, padding: 28,
            width: 340, border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Nova Comanda</div>
            <div style={{ fontSize: 16, color: C.muted, marginBottom: 20 }}>
              Informe o nome ou número da mesa
            </div>

            <label style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
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
                border: `1px solid ${C.border}`,
                background: C.surface, color: C.text, fontSize: 18,
                boxSizing: "border-box", fontFamily: "inherit", outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowNova(false)}
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleNovaComanda}
                disabled={!nomeComanda.trim() || criando}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, border: "none",
                  background: nomeComanda.trim() ? C.accent : C.faint,
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
            background: C.card, borderRadius: 20,
            width: "100%", maxWidth: 520,
            maxHeight: "85vh", display: "flex", flexDirection: "column",
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
                  <LuArrowLeftRight size={18} /> Transferir itens
                </div>
                <div style={{ fontSize: 18, color: C.muted, marginTop: 2 }}>
                  De: {/^\d+$/.test(String(selected?.comanda ?? "").trim()) ? `Comanda ${selected?.comanda}` : selected?.comanda}
                </div>
              </div>
              <button
                onClick={() => setShowTransferir(false)}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, fontSize: 18, fontWeight: 400 }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {/* Seção: itens a transferir */}
              <div style={{ padding: "16px 24px 8px", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
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
                      border: `1.5px solid ${ativo ? C.accent + "66" : C.border}`,
                      background: ativo ? `${C.accent}08` : C.surface,
                      transition: "border-color 0.15s, background 0.15s",
                    }}>
                      {item.emoji && <span style={{ fontSize: 18 }}>{item.emoji}</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 14, color: C.muted }}>Disponível: {qty}</div>
                      </div>
                      {/* Qty selector */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: Math.max(0, (prev[idx] ?? 0) - 1) }))}
                          style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <span style={{ fontSize: 16, lineHeight: 1 }}>−</span>
                        </button>
                        <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 17, color: ativo ? C.accent : C.muted }}>
                          {qSel}
                        </span>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: Math.min(qty, (prev[idx] ?? 0) + 1) }))}
                          style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                        </button>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: prev[idx] === qty ? 0 : qty }))}
                          style={{
                            padding: "4px 10px", borderRadius: 7, border: "none",
                            background: ativo ? `${C.accent}22` : C.surface,
                            color: ativo ? C.accent : C.muted,
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
                <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
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
                        border: `1.5px solid ${transMode === tab.id ? C.accent : C.border}`,
                        background: transMode === tab.id ? `${C.accent}14` : C.surface,
                        color: transMode === tab.id ? C.accent : C.muted,
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
                    <div style={{ fontSize: 16, color: C.muted, padding: "12px 0" }}>
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
                              border: `1.5px solid ${sel ? C.green + "88" : C.border}`,
                              background: sel ? `${C.green}0f` : C.surface,
                              cursor: "pointer", textAlign: "left", color: C.text,
                              transition: "border-color 0.15s, background 0.15s",
                            }}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                              background: sel ? `${C.green}22` : C.card,
                              border: `1px solid ${sel ? C.green + "55" : C.border}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 17, fontWeight: 800, color: sel ? C.green : C.muted,
                            }}>
                              {sel ? "✓" : "#"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 16 }}>{nome}</div>
                              {o.garcom && <div style={{ fontSize: 14, color: C.muted }}>{o.garcom}</div>}
                            </div>
                            {o.total > 0 && (
                              <div style={{ fontWeight: 700, fontSize: 16, color: C.green, flexShrink: 0 }}>
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
                          border: `1.5px solid ${transNumeroErro ? C.red : C.border}`,
                          background: C.surface, color: C.text,
                          fontSize: 18, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                        }}
                      />
                    </div>
                    {transNumeroErro && (
                      <div style={{ fontSize: 18, color: C.red, fontWeight: 600 }}>{transNumeroErro}</div>
                    )}
                    {/* Preview da comanda encontrada */}
                    {(() => {
                      if (!transNumero.trim()) return null;
                      const encontrada = abertas.find(o => String(o.comanda).trim() === transNumero.trim() && o.id !== selected?.id);
                      if (!encontrada) return (
                        <div style={{ fontSize: 18, color: C.muted, padding: "6px 0" }}>
                          Nenhuma comanda aberta com esse número.
                        </div>
                      );
                      return (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                          borderRadius: 12, border: `1.5px solid ${C.green}66`,
                          background: `${C.green}0a`,
                        }}>
                          <div style={{ fontSize: 18 }}>✓</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: C.green }}>{fmtComanda(encontrada.comanda)}</div>
                            {encontrada.garcom && <div style={{ fontSize: 14, color: C.muted }}>{encontrada.garcom}</div>}
                          </div>
                          {encontrada.total > 0 && (
                            <div style={{ marginLeft: "auto", fontWeight: 700, fontSize: 16, color: C.green }}>
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
                    <div style={{ fontSize: 18, color: C.muted, marginBottom: 2 }}>
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
                        border: `1.5px solid ${transNumeroErro ? C.red : C.border}`,
                        background: C.surface, color: C.text,
                        fontSize: 17, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                      }}
                    />
                    {transNumeroErro && (
                      <div style={{ fontSize: 18, color: C.red, fontWeight: 600 }}>{transNumeroErro}</div>
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
                <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, flexShrink: 0, display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowTransferir(false)}
                    style={{
                      flex: 1, padding: "12px 0", borderRadius: 12,
                      border: `1px solid ${C.border}`, background: "none",
                      color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleTransferir}
                    disabled={!pode || transferindo}
                    style={{
                      flex: 2, padding: "12px 0", borderRadius: 12, border: "none",
                      background: pode ? C.green : C.faint,
                      color: "#fff", cursor: pode ? "pointer" : "not-allowed",
                      fontWeight: 800, fontSize: 17,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    }}
                  >
                    {transferindo
                      ? "Transferindo..."
                      : pode
                        ? <><LuArrowLeftRight size={15} /> Transferir {qtdTransferir} item{qtdTransferir !== 1 ? "s" : ""} → {nomeDestino}</>
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
            background: C.card, borderRadius: 20, padding: 28,
            width: "100%", maxWidth: 400,
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${C.red}18`, border: `1.5px solid ${C.red}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22,
              }}>
                🗑️
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>Cancelar pedido?</div>
                <div style={{ fontSize: 16, color: C.muted, marginTop: 2 }}>
                  {/^\d+$/.test(String(selected?.comanda ?? "").trim()) ? `Comanda ${selected?.comanda}` : selected?.comanda}
                </div>
              </div>
            </div>

            <div style={{
              padding: "12px 16px", borderRadius: 10, marginBottom: 20,
              background: `${C.red}0d`, border: `1px solid ${C.red}33`,
              fontSize: 16, color: C.muted, lineHeight: 1.5,
            }}>
              A comanda será <strong style={{ color: C.red }}>removida permanentemente</strong>. Esta ação não pode ser desfeita.
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmCancelar(false)}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17,
                }}
              >
                Voltar
              </button>
              <button
                onClick={async () => {
                  setConfirmCancelar(false);
                  logAction(currentUser?.username, "comanda:cancelar", { msg: `Comanda cancelada: ${fmtComanda(selected.comanda)}`, name: currentUser?.name, role: currentUser?.role, comanda: selected.comanda });
                  await removePending(selected.id);
                  handleBack();
                }}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                  background: C.red, color: "#fff",
                  cursor: "pointer", fontWeight: 800, fontSize: 18,
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
            background: C.card, borderRadius: 20,
            width: "100%", maxWidth: 380,
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: `${C.accent}18`, border: `1.5px solid ${C.accent}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20,
              }}>
                🪑
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>
                  {fmtComanda(mesaPendingOrder.comanda)}
                </div>
                <div style={{ fontSize: 18, color: C.muted, marginTop: 1 }}>
                  {mesaPendingOrder.mesa ? "Editar mesa e apelido" : "Informe a mesa antes de continuar"}
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Mesa */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 18, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Número ou nome da mesa <span style={{ color: C.red }}>*</span>
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
                    border: `1.5px solid ${!mesaInput.trim() ? C.red + "88" : C.border}`,
                    background: C.surface,
                    color: C.text, fontSize: 18, fontFamily: "inherit",
                    outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = C.accent + "88"}
                  onBlur={e => e.currentTarget.style.borderColor = !mesaInput.trim() ? C.red + "88" : C.border}
                />
                {!mesaInput.trim() && (
                  <div style={{ fontSize: 14, color: C.red, fontWeight: 600 }}>Campo obrigatório.</div>
                )}
              </div>

              {/* Apelido */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 18, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>
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
                    border: `1.5px solid ${C.border}`, background: C.surface,
                    color: C.text, fontSize: 18, fontFamily: "inherit",
                    outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = C.accent + "88"}
                  onBlur={e => e.currentTarget.style.borderColor = C.border}
                />
              </div>

              <div style={{ fontSize: 14, color: C.muted }}>
                Apelido é opcional. Pressione Enter ou clique em Entrar para continuar.
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowMesa(false); setMesaPendingOrder(null); }}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 11,
                    border: `1px solid ${C.border}`, background: "none",
                    color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarMesa}
                  disabled={salvandoMesa || !mesaInput.trim()}
                  style={{
                    flex: 2, padding: "12px 0", borderRadius: 11, border: "none",
                    background: mesaInput.trim() ? C.accent : C.faint,
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
        />,
        document.body
      )}

    </div>
  );
}

// ── Modal de Saldo do Dia ─────────────────────────────────────────
function SaldoModal({ onClose, senha, setSenha, senhaErro, setSenhaErro, autorizado, setAutorizado, senhaVis, setSenhaVis, users, sales, pending }) {
  const hoje = new Date().toDateString();

  const vendasHoje = (sales ?? []).filter(s => s.at && new Date(s.at).toDateString() === hoje);
  const totalVendas = vendasHoje.reduce((s, v) => s + (v.total ?? 0), 0);
  const qtdVendas   = vendasHoje.length;

  const abertas = (pending ?? []).filter(p => p.status !== "closed");
  const totalAberto = abertas.reduce((s, p) => {
    const ativos = (Array.isArray(p.items) ? p.items : []).filter(i => !i.cancelado);
    return s + ativos.reduce((x, i) => x + (i.price ?? 0) * (i.qty ?? 1), 0);
  }, 0);

  const porMetodo = {};
  vendasHoje.forEach(v => { porMetodo[v.metodo] = (porMetodo[v.metodo] ?? 0) + (v.total ?? 0); });

  const METODOS_LABEL = { dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "Pix" };
  const METODOS_COLOR = { dinheiro: "#10b981", credito: "#3b82f6", debito: "#8b5cf6", pix: "#f59e0b" };

  const verificarSenha = () => {
    const admins = (users ?? []).filter(u => u.role === "admin" || u.role === "gerente");
    const match  = admins.some(u => u.password === senha || u._plainPassword === senha);
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
        background: C.card, borderRadius: 20,
        width: "100%", maxWidth: autorizado ? 520 : 400,
        border: `1px solid ${C.border}`,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        color: C.text, overflow: "hidden",
        transition: "max-width 0.3s",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: `${C.accent}18`, border: `1.5px solid ${C.accent}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <LuChartBar size={20} color={C.accent} />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17 }}>Saldo do Dia</div>
              <div style={{ fontSize: 18, color: C.muted, marginTop: 1 }}>
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Corpo: senha ou dados */}
        {!autorizado ? (
          <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: `${C.accent}10`, border: `1px solid ${C.accent}33`,
              borderRadius: 12, padding: "12px 16px",
              fontSize: 16, color: C.muted,
            }}>
              <LuLock size={16} color={C.accent} style={{ flexShrink: 0 }} />
              Acesso restrito a administradores e gerentes.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 18, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>
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
                    width: "100%", padding: "13px 44px 13px 16px",
                    borderRadius: 10, border: `1.5px solid ${senhaErro ? C.red : C.border}`,
                    background: C.surface, color: C.text,
                    fontSize: 18, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box", transition: "border-color 0.15s",
                  }}
                />
                <button
                  onClick={() => setSenhaVis(v => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex", padding: 2 }}
                >
                  {senhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
              {senhaErro && (
                <div style={{ fontSize: 18, color: C.red, fontWeight: 600 }}>
                  Senha incorreta. Apenas administradores e gerentes têm acesso.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: "12px 0", borderRadius: 11, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17 }}
              >
                Cancelar
              </button>
              <button
                onClick={verificarSenha}
                disabled={!senha.trim()}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 11, border: "none",
                  background: senha.trim() ? C.accent : C.faint,
                  color: "#fff", cursor: senha.trim() ? "pointer" : "not-allowed",
                  fontWeight: 700, fontSize: 17,
                }}
              >
                Acessar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Vendas Finalizadas", value: `R$ ${totalVendas.toFixed(2)}`, sub: `${qtdVendas} comanda${qtdVendas !== 1 ? "s" : ""}`, color: C.green },
                { label: "Em Aberto (estimado)", value: `R$ ${totalAberto.toFixed(2)}`, sub: `${abertas.length} comanda${abertas.length !== 1 ? "s" : ""} ativa${abertas.length !== 1 ? "s" : ""}`, color: C.accent },
              ].map(k => (
                <div key={k.label} style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: "16px 18px",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{k.label}</div>
                  <div style={{ fontWeight: 900, fontSize: 22, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 18, color: C.muted, marginTop: 4 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Total geral */}
            <div style={{
              background: `${C.green}10`, border: `1.5px solid ${C.green}44`,
              borderRadius: 14, padding: "16px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: C.text }}>Total do Dia (projetado)</div>
                <div style={{ fontSize: 18, color: C.muted, marginTop: 2 }}>Fechadas + em aberto</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 26, color: C.green }}>
                R$ {(totalVendas + totalAberto).toFixed(2)}
              </div>
            </div>

            {/* Por método de pagamento */}
            {Object.keys(porMetodo).length > 0 && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Vendas por Método
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(porMetodo).sort((a, b) => b[1] - a[1]).map(([metodo, val]) => (
                    <div key={metodo} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: C.surface, borderRadius: 10, padding: "10px 14px",
                      border: `1px solid ${C.border}`,
                    }}>
                      <span style={{
                        fontSize: 16, fontWeight: 700,
                        color: METODOS_COLOR[metodo] ?? C.muted,
                        background: `${METODOS_COLOR[metodo] ?? C.muted}18`,
                        border: `1px solid ${METODOS_COLOR[metodo] ?? C.muted}44`,
                        borderRadius: 8, padding: "3px 10px",
                      }}>
                        {METODOS_LABEL[metodo] ?? metodo}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: 18, color: C.text }}>
                        R$ {Number(val).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comandas em aberto */}
            {abertas.length > 0 && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Comandas em Aberto
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {abertas.map(p => {
                    const ativos = (Array.isArray(p.items) ? p.items : []).filter(i => !i.cancelado);
                    const subtotal = ativos.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 1), 0);
                    return (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: C.surface, borderRadius: 10, padding: "10px 14px",
                        border: `1px solid ${C.border}`,
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtComanda(p.comanda)}</div>
                          {p.garcom && <div style={{ fontSize: 14, color: C.muted }}>{p.garcom}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 800, fontSize: 17, color: subtotal > 0 ? C.accent : C.muted }}>
                            {subtotal > 0 ? `R$ ${subtotal.toFixed(2)}` : "Sem itens"}
                          </div>
                          <div style={{ fontSize: 14, color: C.muted }}>
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
              style={{
                padding: "12px 0", borderRadius: 11, border: `1px solid ${C.border}`,
                background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17,
              }}
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

