import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { LuArrowLeft, LuArrowLeftRight, LuPlus, LuTriangleAlert, LuChevronDown, LuChevronUp, LuShoppingBag, LuShoppingCart, LuLock, LuSearch, LuX } from "react-icons/lu";
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
    caixaAberto, currentUser,
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
  const [showVerItens,      setShowVerItens]      = useState(false);
  const [showTransferir,    setShowTransferir]    = useState(false);
  const [transQtds,         setTransQtds]         = useState({});   // { [itemIdx]: qty }
  const [transDestino,      setTransDestino]      = useState(null); // order id destino
  const [transferindo,      setTransferindo]      = useState(false);

  const abertas = pending.filter(o => o.status !== "closed");

  // ── Selecionar comanda → entra no modo pedido ──────────────────
  const handleSelectComanda = (order) => {
    setBuscaComanda("");
    setSelected(order);
    setCartItems([]);
    setAbaAtiva("produtos");
    setMode("pedido");
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
      setTimeout(() => setToast(false), 3000);
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
    handleSelectComanda(order);
  };

  // ── Transferir itens entre comandas ──────────────────────────
  const abrirTransferir = () => {
    const itens = Array.isArray(selected?.items) ? selected.items : [];
    const qtds = {};
    itens.forEach((_, idx) => { qtds[idx] = 0; });
    setTransQtds(qtds);
    setTransDestino(null);
    setShowTransferir(true);
  };

  const handleTransferir = async () => {
    if (!transDestino || transferindo) return;
    const itens = Array.isArray(selected?.items) ? selected.items : [];
    const destino = abertas.find(o => o.id === transDestino);
    if (!destino) return;

    setTransferindo(true);
    try {
      // Itens a transferir (apenas os com qty > 0)
      const aTransferir = itens
        .map((it, idx) => ({ it, qty: transQtds[idx] ?? 0 }))
        .filter(x => x.qty > 0);

      // Origem: subtrai qtds ou remove item
      const novosOrigem = itens.map((it, idx) => {
        const qRemover = transQtds[idx] ?? 0;
        if (!qRemover) return it;
        const novaQty = (it.qty ?? 1) - qRemover;
        return novaQty > 0 ? { ...it, qty: novaQty } : null;
      }).filter(Boolean);

      // Destino: acumula itens (agrupa por id de produto)
      const novosDestino = [...(Array.isArray(destino.items) ? destino.items : [])];
      aTransferir.forEach(({ it, qty }) => {
        const existIdx = novosDestino.findIndex(d => d.id === it.id);
        if (existIdx >= 0) {
          novosDestino[existIdx] = { ...novosDestino[existIdx], qty: (novosDestino[existIdx].qty ?? 1) + qty };
        } else {
          novosDestino.push({ ...it, qty });
        }
      });

      const totalOrigem  = novosOrigem.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
      const totalDestino = novosDestino.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);

      await Promise.all([
        updatePending(selected.id,  { items: novosOrigem,  total: totalOrigem  }),
        updatePending(transDestino, { items: novosDestino, total: totalDestino }),
      ]);

      const nomeDestino = /^\d+$/.test(String(destino.comanda ?? "").trim()) ? `Comanda ${destino.comanda}` : destino.comanda;
      const qtdTransf   = aTransferir.reduce((s, x) => s + x.qty, 0);
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
    handleSelectComanda(order);
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
                  fontWeight: 700, fontSize: 15,
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
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>
                {mode === "pedido" ? fmtComanda(selected?.comanda) : "Frente de Caixa"}
              </div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
                {mode === "pedido"
                  ? `${cartItems.length} ${cartItems.length === 1 ? "tipo de item" : "tipos de item"} no carrinho`
                  : `${abertas.length} comanda${abertas.length !== 1 ? "s" : ""} em aberto`}
              </div>
            </div>
          </div>

          {/* Centro: busca de comandas (apenas no grid) */}
          {mode === "grid" ? (
            <div style={{ position: "relative" }}>
              <LuSearch
                size={15}
                color={buscaComanda ? C.accent : C.muted}
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.15s" }}
              />
              <input
                value={buscaComanda}
                onChange={e => setBuscaComanda(e.target.value)}
                placeholder="Buscar comanda..."
                style={{
                  width: 280,
                  padding: "10px 36px",
                  borderRadius: 10,
                  border: `1.5px solid ${buscaComanda ? C.accent + "66" : C.border}`,
                  background: C.surface,
                  color: C.text,
                  fontSize: 14,
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
              />
              {buscaComanda && (
                <button
                  onClick={() => setBuscaComanda("")}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 2 }}
                >
                  <LuX size={14} />
                </button>
              )}
            </div>
          ) : <div />}

          {/* Direita: ações */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {mode === "grid" && (
            <button
              onClick={() => { setShowNova(true); setNomeComanda(""); }}
              disabled={!caixaAberto}
              style={{
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: caixaAberto ? C.accent : C.faint,
                color: "#fff", fontWeight: 700, fontSize: 14,
                cursor: caixaAberto ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <LuPlus size={16} /> Nova Comanda
            </button>
          )}

          {mode === "pedido" && (() => {
            const itensLancados = Array.isArray(selected?.items) ? selected.items : [];
            if (itensLancados.length > 0) {
              const qtdTotal = itensLancados.reduce((s, i) => s + (i.qty ?? 1), 0);
              return (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={abrirTransferir}
                    style={{
                      padding: "10px 18px", borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.muted, fontWeight: 700, fontSize: 14,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 7,
                      transition: "background 0.15s, color 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.text; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.muted; }}
                  >
                    <LuArrowLeftRight size={15} /> Transferir
                  </button>
                  <button
                    onClick={() => setShowVerItens(true)}
                    style={{
                      padding: "10px 20px", borderRadius: 10,
                      border: `1px solid ${C.accent}55`,
                      background: `${C.accent}0f`,
                      color: C.accent, fontWeight: 700, fontSize: 14,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = `${C.accent}1e`}
                    onMouseLeave={e => e.currentTarget.style.background = `${C.accent}0f`}
                  >
                    Ver itens
                    <span style={{
                      background: C.accent, color: "#fff",
                      borderRadius: 10, padding: "1px 8px",
                      fontSize: 12, fontWeight: 800,
                    }}>
                      {qtdTotal}
                    </span>
                  </button>
                </div>
              );
            }
            return (
              <button
                onClick={() => setConfirmCancelar(true)}
                style={{
                  padding: "10px 20px", borderRadius: 10,
                  border: `1px solid ${C.red}55`,
                  background: `${C.red}0f`,
                  color: C.red, fontWeight: 700, fontSize: 14,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${C.red}1e`}
                onMouseLeave={e => e.currentTarget.style.background = `${C.red}0f`}
              >
                Cancelar Pedido
              </button>
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
              <span style={{ fontWeight: 700, fontSize: 13, color: "#f59e0b", flex: 1 }}>
                {criticos.length > 0 && `${criticos.length} produto${criticos.length !== 1 ? "s" : ""} sem estoque`}
                {criticos.length > 0 && baixos.length > 0 && " · "}
                {baixos.length > 0 && `${baixos.length} com estoque baixo`}
              </span>
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
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
                    padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: `${C.red}18`, border: `1px solid ${C.red}44`, color: C.red,
                  }}>
                    {p.emoji} {p.name} · <span style={{ fontWeight: 900 }}>0</span>
                  </span>
                ))}
                {baixos.map(p => (
                  <span key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
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
                      fontWeight: 700, fontSize: 14, cursor: "pointer",
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
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
              Informe o nome ou número da mesa
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
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
                background: C.surface, color: C.text, fontSize: 15,
                boxSizing: "border-box", fontFamily: "inherit", outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowNova(false)}
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14,
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
                  fontWeight: 700, fontSize: 14,
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
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
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
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
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
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted }}>Disponível: {qty}</div>
                      </div>
                      {/* Qty selector */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: Math.max(0, (prev[idx] ?? 0) - 1) }))}
                          style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <span style={{ fontSize: 16, lineHeight: 1 }}>−</span>
                        </button>
                        <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 14, color: ativo ? C.accent : C.muted }}>
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
                            cursor: "pointer", fontSize: 11, fontWeight: 700,
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
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Transferir para
                </div>
                {abertas.filter(o => o.id !== selected?.id).length === 0 ? (
                  <div style={{ fontSize: 13, color: C.muted, padding: "12px 0" }}>
                    Nenhuma outra comanda aberta.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {abertas.filter(o => o.id !== selected?.id).map(o => {
                      const nome    = /^\d+$/.test(String(o.comanda ?? "").trim()) ? `Comanda ${o.comanda}` : o.comanda;
                      const selecionado = transDestino === o.id;
                      return (
                        <button
                          key={o.id}
                          onClick={() => setTransDestino(o.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 14px", borderRadius: 12,
                            border: `1.5px solid ${selecionado ? C.green + "88" : C.border}`,
                            background: selecionado ? `${C.green}0f` : C.surface,
                            cursor: "pointer", textAlign: "left", color: C.text,
                            transition: "border-color 0.15s, background 0.15s",
                          }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: selecionado ? `${C.green}22` : C.card,
                            border: `1px solid ${selecionado ? C.green + "55" : C.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: 800, color: selecionado ? C.green : C.muted,
                          }}>
                            {selecionado ? "✓" : "#"}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{nome || `#${String(o.id).slice(-4).toUpperCase()}`}</div>
                            {o.garcom && <div style={{ fontSize: 11, color: C.muted }}>{o.garcom}</div>}
                          </div>
                          {o.total > 0 && (
                            <div style={{ fontWeight: 700, fontSize: 13, color: C.green, flexShrink: 0 }}>
                              R$ {Number(o.total).toFixed(2)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            {(() => {
              const algumSelecionado = Object.values(transQtds).some(q => q > 0);
              const pode = algumSelecionado && transDestino;
              const qtdTransferir = Object.values(transQtds).reduce((s, q) => s + q, 0);
              const nomeDestino = (() => {
                const d = abertas.find(o => o.id === transDestino);
                if (!d) return "";
                return /^\d+$/.test(String(d.comanda ?? "").trim()) ? `Comanda ${d.comanda}` : d.comanda;
              })();
              return (
                <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, flexShrink: 0, display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowTransferir(false)}
                    style={{
                      flex: 1, padding: "12px 0", borderRadius: 12,
                      border: `1px solid ${C.border}`, background: "none",
                      color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14,
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
                      fontWeight: 800, fontSize: 14,
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

      {/* ── Popup: Ver Itens Lançados ───────────────────────────── */}
      {showVerItens && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowVerItens(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20,
            width: "100%", maxWidth: 480,
            maxHeight: "80vh", display: "flex", flexDirection: "column",
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
                <div style={{ fontWeight: 900, fontSize: 17 }}>Itens lançados</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {/^\d+$/.test(String(selected?.comanda ?? "").trim()) ? `Comanda ${selected?.comanda}` : selected?.comanda}
                </div>
              </div>
              <button
                onClick={() => setShowVerItens(false)}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", fontSize: 18, fontWeight: 400 }}
              >
                ✕
              </button>
            </div>

            {/* Lista */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {(() => {
                const itens = Array.isArray(selected?.items) ? selected.items : [];
                if (itens.length === 0) return (
                  <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 14 }}>Nenhum item lançado.</div>
                );

                const handleRemoveItem = async (idx, qty) => {
                  const novos = selected.items.map((it, i) => {
                    if (i !== idx) return it;
                    const novaQty = (it.qty ?? 1) - qty;
                    return novaQty > 0 ? { ...it, qty: novaQty } : null;
                  }).filter(Boolean);
                  const novoTotal = novos.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
                  await updatePending(selected.id, { items: novos, total: novoTotal });
                  setSelected(prev => ({ ...prev, items: novos, total: novoTotal }));
                  if (novos.length === 0) setShowVerItens(false);
                };

                return itens.map((item, idx) => (
                  <ItemVerRow key={idx} item={item} onRemove={(qty) => handleRemoveItem(idx, qty)} />
                ));
              })()}
            </div>

            {/* Footer total */}
            {(() => {
              const itens = Array.isArray(selected?.items) ? selected.items : [];
              if (itens.length === 0) return null;
              const total = itens.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
              return (
                <div style={{
                  padding: "16px 24px", borderTop: `1px solid ${C.border}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Total lançado</span>
                  <span style={{ fontWeight: 900, fontSize: 20, color: C.green }}>
                    R$ {total.toFixed(2)}
                  </span>
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
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                  {/^\d+$/.test(String(selected?.comanda ?? "").trim()) ? `Comanda ${selected?.comanda}` : selected?.comanda}
                </div>
              </div>
            </div>

            <div style={{
              padding: "12px 16px", borderRadius: 10, marginBottom: 20,
              background: `${C.red}0d`, border: `1px solid ${C.red}33`,
              fontSize: 13, color: C.muted, lineHeight: 1.5,
            }}>
              A comanda será <strong style={{ color: C.red }}>removida permanentemente</strong>. Esta ação não pode ser desfeita.
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmCancelar(false)}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14,
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
                  cursor: "pointer", fontWeight: 800, fontSize: 15,
                }}
              >
                Sim, cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Toast: Pedido enviado ────────────────────────────────── */}
      <div style={{
        position: "fixed", top: 24, right: 24, zIndex: 500,
        display: "flex", alignItems: "center", gap: 10,
        background: C.green, color: "#fff",
        padding: "14px 20px", borderRadius: 12,
        fontWeight: 700, fontSize: 15,
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        pointerEvents: "none",
        transition: "opacity 0.3s, transform 0.3s",
        opacity: toast ? 1 : 0,
        transform: toast ? "translateY(0)" : "translateY(-12px)",
      }}>
        ✓ Pedido enviado com sucesso!
      </div>
    </div>
  );
}

function ItemVerRow({ item, onRemove }) {
  const [qtyRemover, setQtyRemover] = useState(1);
  const qty = item.qty ?? 1;
  const obsArr = Array.isArray(item.obs) ? item.obs : (item.obs ? [item.obs] : []);

  return (
    <div style={{
      padding: "14px 24px",
      borderBottom: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {item.emoji && <span style={{ fontSize: 20 }}>{item.emoji}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {item.name}
            <span style={{ color: C.muted, fontWeight: 500 }}> × {qty}</span>
          </div>
          {obsArr.map((obs, j) => (
            <div key={j} style={{ fontSize: 12, color: C.accent, marginTop: 2 }}>↳ {obs}</div>
          ))}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.green, flexShrink: 0 }}>
          R$ {(item.price * qty).toFixed(2)}
        </div>
      </div>

      {/* Controle de exclusão */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
        <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>Excluir:</span>
        <button
          onClick={() => setQtyRemover(q => Math.max(1, q - 1))}
          disabled={qtyRemover <= 1}
          style={{
            width: 28, height: 28, borderRadius: 7,
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.text, cursor: qtyRemover > 1 ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: qtyRemover <= 1 ? 0.4 : 1,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>−</span>
        </button>
        <span style={{ minWidth: 24, textAlign: "center", fontWeight: 800, fontSize: 14 }}>{qtyRemover}</span>
        <button
          onClick={() => setQtyRemover(q => Math.min(qty, q + 1))}
          disabled={qtyRemover >= qty}
          style={{
            width: 28, height: 28, borderRadius: 7,
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.text, cursor: qtyRemover < qty ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: qtyRemover >= qty ? 0.4 : 1,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
        </button>
        <button
          onClick={() => onRemove(qtyRemover)}
          style={{
            padding: "5px 14px", borderRadius: 8, border: "none",
            background: C.red, color: "#fff",
            cursor: "pointer", fontWeight: 700, fontSize: 12,
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          🗑 Excluir {qtyRemover === qty ? "tudo" : qtyRemover}
        </button>
      </div>
    </div>
  );
}
