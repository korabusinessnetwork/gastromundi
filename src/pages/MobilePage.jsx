import { useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import C from "@/constants/colors";
import { LuUtensils, LuUser, LuShoppingCart, LuArrowLeft, LuCheck, LuMinus, LuPlus, LuChevronUp, LuChevronDown, LuX, LuSearch, LuLock, LuLayoutGrid, LuLogOut, LuClock } from "react-icons/lu";

const TOTAL_COMANDAS = 1000;
const PAGE = 50;
const AMBER = "#f59e0b";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

// ── Tela Principal ────────────────────────────────────────────────
export default function MobilePage() {
  const {
    pending, products, currentUser, estoque, caixaAberto,
    addPending, updatePending,
    lancadas, addLancada,
    logout,
  } = useApp();

  const [mode,       setMode]       = useState("pedido"); // "pedido" | "grid"
  const [cartItems,  setCartItems]  = useState([]);
  const [salvando,   setSalvando]   = useState(false);
  const [limite,     setLimite]     = useState(PAGE);
  const [catAtiva,   setCatAtiva]   = useState("Todos");
  const [cartAberto, setCartAberto] = useState(false);
  const [toast,      setToast]      = useState(false);
  const [buscaGrid,  setBuscaGrid]  = useState("");
  const [buscaItens, setBuscaItens] = useState("");

  // Modal de lançamento
  const [showLancar,    setShowLancar]    = useState(false);
  const [lancComanda,   setLancComanda]   = useState("");
  const [lancMesa,      setLancMesa]      = useState("");
  const [lancErro,      setLancErro]      = useState("");

  // Detalhe da comanda (bottom sheet)
  const [detalheComanda, setDetalheComanda] = useState(null); // order object
  const [detalheVisible, setDetalheVisible] = useState(false);

  const abrirDetalhe = (order) => {
    setDetalheComanda(order);
    setDetalheVisible(true);
  };
  const fecharDetalhe = () => {
    setDetalheVisible(false);
    setTimeout(() => setDetalheComanda(null), 300);
  };

  const abertas = pending.filter(o => o.status !== "closed");
  const mapa    = {};
  abertas.forEach(o => { mapa[String(o.comanda)] = o; });

  const categorias = ["Todos", ...new Set(products.map(p => p.category).filter(Boolean))];
  const filtrados  = catAtiva === "Todos" ? products : products.filter(p => p.category === catAtiva);

  const total    = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const qtdTotal = cartItems.reduce((s, i) => s + i.qty, 0);

  const handleAddProduct = (product) => {
    setCartItems(prev => {
      const idx = prev.findIndex(i => i.id === product.id);
      if (idx >= 0) return prev.map((it, n) => n === idx ? { ...it, qty: it.qty + 1 } : it);
      return [...prev, { ...product, qty: 1, _key: Date.now() + Math.random() }];
    });
  };

  const handleChangeQty = (index, qty) => {
    if (qty <= 0) setCartItems(prev => prev.filter((_, i) => i !== index));
    else          setCartItems(prev => prev.map((it, i) => i === index ? { ...it, qty } : it));
  };

  const abrirModalLancar = () => {
    setLancComanda("");
    setLancMesa("");
    setLancErro("");
    setShowLancar(true);
  };

  const selecionarComanda = (comanda, mesa = "") => {
    const order = mapa[String(comanda)];
    const hasItems = order && Array.isArray(order.items) && order.items.length > 0;
    if (hasItems) {
      abrirDetalhe(order);
    } else {
      setLancComanda(String(comanda));
      setLancMesa(mesa || "");
      setLancErro("");
      setMode("pedido");
      setShowLancar(true);
    }
  };

  const handleLancar = async () => {
    const nomeComanda = lancComanda.trim();
    if (!nomeComanda) { setLancErro("Informe o número ou nome da comanda."); return; }
    if (cartItems.length === 0 || salvando) return;
    setSalvando(true);
    try {
      let order = mapa[nomeComanda];
      if (!order) {
        order = {
          id:         crypto.randomUUID(),
          comanda:    nomeComanda,
          mesa:       lancMesa.trim(),
          items:      [],
          status:     "open",
          total:      0,
          garcom:     currentUser?.name     || "",
          created_by: currentUser?.username || "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await addPending(order);
        logAction(currentUser?.username, "comanda:abrir", { msg: `Comanda aberta (palm): ${nomeComanda}`, name: currentUser?.name, role: currentUser?.role, comanda: nomeComanda, via: "palm" });
      } else if (lancMesa.trim() && !order.mesa) {
        await updatePending(order.id, { mesa: lancMesa.trim() });
        order = { ...order, mesa: lancMesa.trim() };
      }

      const anteriores = Array.isArray(order.items) ? order.items : [];
      const novos      = cartItems.map(({ _key, ...rest }) => rest);
      const acumulados = [...anteriores, ...novos];
      const novoTotal  = acumulados.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
      await updatePending(order.id, { items: acumulados, total: novoTotal });
      addLancada(order.id);
      logAction(currentUser?.username, "itens:lancar", { msg: `Itens lançados (palm) na Comanda ${nomeComanda} · ${novos.length} tipo(s) · R$ ${novoTotal.toFixed(2)}`, name: currentUser?.name, role: currentUser?.role, comanda: nomeComanda, tipos: novos.length, total: novoTotal, via: "palm" });

      setShowLancar(false);
      setCartItems([]);
      setCartAberto(false);
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    } catch (e) {
      console.error(e);
      setLancErro("Erro ao lançar pedido. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  // ── Guard: caixa fechado ──────────────────────────────────────
  if (!caixaAberto) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100dvh", background: C.bg, fontFamily: "'Inter',system-ui,sans-serif", color: C.text,
        padding: 24, gap: 16,
      }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "40px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%", maxWidth: 340, textAlign: "center", boxSizing: "border-box" }}>
          <div style={{ background: `${C.accent}1a`, borderRadius: "50%", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LuLock size={32} color={C.accent} />
          </div>
          <div style={{ fontWeight: 900, fontSize: 22 }}>Caixa Fechado</div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>
            O caixa está fechado. Para lançar pedidos, solicite ao responsável que abra o caixa.
          </div>
        </div>
      </div>
    );
  }

  // ── GRID de comandas ──────────────────────────────────────────
  if (mode === "grid") {
    const qGrid = buscaGrid.trim().toLowerCase();
    const resultadosGrid = qGrid
      ? abertas.filter(o => {
          const nome = String(o.comanda).toLowerCase();
          return nome.includes(qGrid) || fmtComanda(o.comanda).toLowerCase().includes(qGrid) || (o.garcom ?? "").toLowerCase().includes(qGrid);
        })
      : null;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: C.bg, fontFamily: "'Inter',system-ui,sans-serif", color: C.text }}>

        {/* Header */}
        <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><LuLayoutGrid size={20} /> Comandas</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
              {abertas.length} comanda{abertas.length !== 1 ? "s" : ""} em aberto
            </div>
          </div>
          <button
            onClick={() => setMode("pedido")}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              background: C.accent, border: "none", borderRadius: 12,
              color: "#fff", cursor: "pointer",
              padding: "10px 16px", fontWeight: 700, fontSize: 14,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <LuArrowLeft size={16} /> Voltar
          </button>
        </div>

        {/* Busca */}
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <LuSearch size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
            <input
              value={buscaGrid}
              onChange={e => setBuscaGrid(e.target.value)}
              placeholder="Buscar comanda por nome ou número..."
              style={{
                width: "100%", padding: "11px 36px 11px 36px",
                borderRadius: 12, border: `1.5px solid ${buscaGrid ? C.accent : C.border}`,
                background: C.surface, color: C.text,
                fontSize: 15, fontFamily: "inherit", outline: "none",
                boxSizing: "border-box", transition: "border-color 0.15s",
              }}
            />
            {buscaGrid && (
              <button onClick={() => setBuscaGrid("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0, padding: 2 }}>
                <LuX size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {resultadosGrid !== null ? (
            resultadosGrid.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 10, color: C.muted }}>
                <LuSearch size={40} style={{ opacity: 0.3 }} />
                <div style={{ fontWeight: 600, fontSize: 15 }}>Nenhuma comanda encontrada</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 16 }}>
                {resultadosGrid.map(order => {
                  const isLancada = lancadas.has(order.id);
                  const items     = Array.isArray(order.items) ? order.items : [];
                  const hasItems  = items.reduce((s, it) => s + (it.qty || 1), 0) > 0;
                  const borderColor = isLancada ? AMBER : hasItems ? `${C.blue}66` : C.border;
                  const bgColor     = isLancada ? `${AMBER}14` : hasItems ? `${C.blue}0a` : C.card;
                  return (
                    <div key={order.id} onClick={() => selecionarComanda(order.comanda, order.mesa)} style={{ background: bgColor, border: `1.5px solid ${borderColor}`, borderRadius: 16, padding: "18px 14px", color: C.text, display: "flex", flexDirection: "column", gap: 6, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{fmtComanda(order.comanda)}</div>
                      {order.mesa && <div style={{ fontSize: 12, color: C.muted }}>Mesa {order.mesa}</div>}
                      {order.garcom && <div style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}><LuUser size={11} /> {order.garcom}</div>}
                      <div style={{ fontSize: 13, fontWeight: 700, color: hasItems ? C.green : C.muted }}>
                        {hasItems ? `R$ ${(order.total ?? 0).toFixed(2)}` : "Vazio"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 16 }}>
                {Array.from({ length: limite }, (_, i) => i + 1).map(num => {
                  const order     = mapa[String(num)];
                  const isLancada = order ? lancadas.has(order.id) : false;
                  const items     = order ? (Array.isArray(order.items) ? order.items : []) : [];
                  const hasItems  = items.reduce((s, it) => s + (it.qty || 1), 0) > 0;
                  const borderColor = isLancada ? AMBER : hasItems ? `${C.blue}66` : C.border;
                  const bgColor     = isLancada ? `${AMBER}14` : hasItems ? `${C.blue}0a` : C.card;
                  return (
                    <div key={num} onClick={() => selecionarComanda(num, order?.mesa)} style={{ background: bgColor, border: `1.5px ${order ? "solid" : "dashed"} ${borderColor}`, borderRadius: 16, padding: "18px 14px", color: C.text, display: "flex", flexDirection: "column", gap: 6, opacity: !order ? 0.45 : 1, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>Comanda {num}</div>
                      {order ? (
                        <>
                          {order.mesa && <div style={{ fontSize: 12, color: C.muted }}>Mesa {order.mesa}</div>}
                          {order.garcom && <div style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}><LuUser size={11} /> {order.garcom}</div>}
                          <div style={{ fontSize: 13, fontWeight: 700, color: hasItems ? C.green : C.muted }}>
                            {hasItems ? `R$ ${(order.total ?? 0).toFixed(2)}` : "Vazio"}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: C.muted }}>Disponível</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {limite < TOTAL_COMANDAS && (
                <div style={{ padding: "0 16px 24px", display: "flex", justifyContent: "center" }}>
                  <button onClick={() => setLimite(l => Math.min(l + PAGE, TOTAL_COMANDAS))} style={{ padding: "12px 32px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%" }}>
                    Ver mais · {limite}/{TOTAL_COMANDAS}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── PEDIDO (tela de produtos) ─────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: C.bg, fontFamily: "'Inter',system-ui,sans-serif", color: C.text }}>

      {/* Header */}
      <div style={{
        padding: "14px 16px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={logout}
            title="Sair"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: `1.5px solid ${C.border}`, borderRadius: 10,
              color: C.muted, cursor: "pointer", padding: 7, lineHeight: 0,
              WebkitTapHighlightColor: "transparent", flexShrink: 0,
            }}
          >
            <LuLogOut size={16} />
          </button>
          <div style={{ fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <LuUtensils size={20} /> Palm
            <span style={{ fontSize: 13, fontWeight: 500, color: C.muted }}>· {currentUser?.name?.split(" ")[0]}</span>
          </div>
        </div>
        <button
          onClick={() => setMode("grid")}
          style={{
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12,
            color: C.muted, cursor: "pointer",
            padding: "8px 14px", fontWeight: 600, fontSize: 13,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <LuLayoutGrid size={14} /> Comandas {abertas.length > 0 && <span style={{ background: C.accent, color: "#fff", borderRadius: 8, padding: "1px 6px", fontSize: 11, fontWeight: 800 }}>{abertas.length}</span>}
        </button>
      </div>

      {/* Busca de item */}
      <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <LuSearch size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
          <input
            value={buscaItens}
            onChange={e => setBuscaItens(e.target.value)}
            placeholder="Buscar item..."
            style={{
              width: "100%", padding: "11px 36px 11px 36px",
              borderRadius: 12, border: `1.5px solid ${buscaItens ? C.accent : C.border}`,
              background: C.surface, color: C.text,
              fontSize: 15, fontFamily: "inherit", outline: "none",
              boxSizing: "border-box", transition: "border-color 0.15s",
            }}
          />
          {buscaItens && (
            <button onClick={() => setBuscaItens("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0, padding: 2 }}>
              <LuX size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Filtro categorias */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto", flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        {categorias.map(cat => (
          <button key={cat} onClick={() => setCatAtiva(cat)} style={{
            padding: "8px 16px", borderRadius: 20, border: "none",
            background: catAtiva === cat ? C.accent : C.surface,
            color: catAtiva === cat ? "#fff" : C.muted,
            cursor: "pointer", fontWeight: 600, fontSize: 13,
            whiteSpace: "nowrap", flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid de produtos */}
      {(() => {
        const qItens = buscaItens.trim().toLowerCase();
        const visiveis = qItens ? filtrados.filter(p => p.name.toLowerCase().includes(qItens)) : filtrados;
        return (
          <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 14, alignContent: "start", paddingBottom: "calc(120px + env(safe-area-inset-bottom))" }}>
            {visiveis.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 10, color: C.muted }}>
                <LuSearch size={40} style={{ opacity: 0.3 }} />
                <div style={{ fontWeight: 600, fontSize: 15 }}>Nenhum item encontrado</div>
              </div>
            ) : visiveis.map(product => {
              const qty = cartItems.find(i => i.id === product.id)?.qty ?? 0;
              return (
                <button key={product.id} onClick={() => handleAddProduct(product)} style={{
                  background: qty > 0 ? C.alow : C.card,
                  border: `1.5px solid ${qty > 0 ? C.accent : C.border}`,
                  borderRadius: 14, padding: "16px 12px",
                  cursor: "pointer", textAlign: "left", color: C.text,
                  display: "flex", flexDirection: "column", gap: 6,
                  position: "relative", WebkitTapHighlightColor: "transparent",
                }}>
                  {qty > 0 && (
                    <span style={{ position: "absolute", top: 8, right: 8, background: C.accent, color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 11, fontWeight: 800 }}>
                      {qty}
                    </span>
                  )}
                  {product.emoji && <span style={{ fontSize: 26 }}>{product.emoji}</span>}
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{product.name}</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.green }}>R$ {Number(product.price).toFixed(2)}</div>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Bottom bar fixa */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: C.card, borderTop: `1px solid ${C.border}`,
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        display: "flex", flexDirection: "column", gap: 8, zIndex: 100,
      }}>
        {cartItems.length > 0 && (
          <button
            onClick={() => setCartAberto(v => !v)}
            style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "10px 16px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              cursor: "pointer", color: C.text, WebkitTapHighlightColor: "transparent",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <LuShoppingCart size={16} /> {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}
            </span>
            <span style={{ fontWeight: 900, fontSize: 15, color: C.green, display: "flex", alignItems: "center", gap: 4 }}>
              R$ {total.toFixed(2)} {cartAberto ? <LuChevronDown size={14}/> : <LuChevronUp size={14}/>}
            </span>
          </button>
        )}

        {cartAberto && cartItems.length > 0 && (
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, maxHeight: 200, overflowY: "auto", padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 14px 6px", borderBottom: `1px solid ${C.border}` }}>
              <button
                onClick={() => { setCartItems([]); setCartAberto(false); }}
                style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "4px 0", display: "flex", alignItems: "center", gap: 4, WebkitTapHighlightColor: "transparent" }}
              >
                <LuX size={13} /> Limpar carrinho
              </button>
            </div>
            {cartItems.map((item, i) => (
              <div key={item._key ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: i < cartItems.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{item.name}</span>
                <button onClick={() => handleChangeQty(i, item.qty - 1)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.red }}><LuMinus size={13}/></button>
                <span style={{ fontWeight: 800, fontSize: 14, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                <button onClick={() => handleChangeQty(i, item.qty + 1)} style={{ background: `${C.green}15`, border: `1px solid ${C.green}44`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.green }}><LuPlus size={13}/></button>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.green, minWidth: 60, textAlign: "right" }}>R$ {(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={cartItems.length > 0 ? abrirModalLancar : undefined}
          disabled={cartItems.length === 0}
          style={{
            padding: "16px", borderRadius: 12, border: "none",
            background: cartItems.length > 0 ? C.accent : C.faint,
            color: "#fff", fontWeight: 800, fontSize: 16,
            cursor: cartItems.length > 0 ? "pointer" : "not-allowed",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <LuCheck size={16} style={{ marginRight: 6 }} />Lançar Pedido
        </button>
      </div>

      {/* Toast */}
      <ToastMsg visible={toast} />

      {/* Modal Lançar — bottom sheet */}
      {showLancar && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget && !salvando) { setShowLancar(false); } }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "flex-end",
            fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card, borderRadius: "20px 20px 0 0",
            padding: 24, width: "100%",
            border: `1px solid ${C.border}`,
            boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
            boxSizing: "border-box",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: C.text }}>Lançar Pedido</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                  {qtdTotal} {qtdTotal === 1 ? "item" : "itens"} · R$ {total.toFixed(2)}
                </div>
              </div>
              <button
                onClick={() => { if (!salvando) setShowLancar(false); }}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, lineHeight: 0 }}
              >
                <LuX size={22} />
              </button>
            </div>

            {/* Campos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Número da Comanda *
                </div>
                <input
                  autoFocus
                  value={lancComanda}
                  onChange={e => { setLancComanda(e.target.value); setLancErro(""); }}
                  onKeyDown={e => e.key === "Enter" && document.getElementById("palm-mesa")?.focus()}
                  placeholder="Ex: 42 ou Mesa VIP"
                  maxLength={40}
                  style={{
                    width: "100%", padding: "14px 16px",
                    borderRadius: 12, border: `1.5px solid ${lancErro ? C.red + "88" : C.border}`,
                    background: C.surface, color: C.text,
                    fontSize: 16, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Mesa <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                </div>
                <input
                  id="palm-mesa"
                  value={lancMesa}
                  onChange={e => setLancMesa(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLancar()}
                  placeholder="Ex: 5"
                  maxLength={20}
                  style={{
                    width: "100%", padding: "14px 16px",
                    borderRadius: 12, border: `1.5px solid ${C.border}`,
                    background: C.surface, color: C.text,
                    fontSize: 16, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {lancErro && (
                <div style={{ fontSize: 14, color: C.red, fontWeight: 600, padding: "8px 12px", background: `${C.red}12`, borderRadius: 8, border: `1px solid ${C.red}33` }}>
                  {lancErro}
                </div>
              )}
            </div>

            {/* Ações */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { if (!salvando) setShowLancar(false); }}
                style={{
                  flex: 1, padding: 14, borderRadius: 12,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 15,
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleLancar}
                disabled={!lancComanda.trim() || salvando}
                style={{
                  flex: 2, padding: 14, borderRadius: 12, border: "none",
                  background: lancComanda.trim() && !salvando ? C.accent : C.surface,
                  color: lancComanda.trim() && !salvando ? "#fff" : C.muted,
                  cursor: lancComanda.trim() && !salvando ? "pointer" : "not-allowed",
                  fontWeight: 800, fontSize: 15, fontFamily: "inherit",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {salvando ? "Enviando..." : mapa[lancComanda.trim()] ? "✓ Adicionar à Comanda" : "✓ Criar e Lançar"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bottom sheet — detalhe da comanda */}
      {createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) fecharDetalhe(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: detalheVisible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)",
            display: "flex", alignItems: "flex-end",
            fontFamily: "'Inter',system-ui,sans-serif",
            pointerEvents: detalheComanda ? "auto" : "none",
            transition: "background 0.3s",
          }}
        >
          <div style={{
            background: C.card, borderRadius: "20px 20px 0 0",
            width: "100%", maxHeight: "80dvh",
            border: `1px solid ${C.border}`,
            boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
            boxSizing: "border-box",
            display: "flex", flexDirection: "column",
            transform: detalheVisible ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1)",
          }}>
            {detalheComanda && (() => {
              const order = detalheComanda;
              const items = Array.isArray(order.items) ? order.items : [];
              const totalOrder = items.reduce((s, it) => s + (it.price ?? 0) * (it.qty ?? 1), 0);
              const hora = order.updated_at
                ? new Date(order.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                : order.created_at
                ? new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                : null;
              const data = order.updated_at
                ? new Date(order.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                : null;
              return (
                <>
                  {/* Handle */}
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border }} />
                  </div>

                  {/* Header */}
                  <div style={{ padding: "8px 20px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 20, color: C.text }}>{fmtComanda(order.comanda)}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 4 }}>
                        {order.mesa && <span style={{ fontSize: 13, color: C.muted }}>Mesa {order.mesa}</span>}
                        {order.garcom && <span style={{ fontSize: 13, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}><LuUser size={12} /> {order.garcom}</span>}
                        {hora && <span style={{ fontSize: 13, color: C.accent, display: "flex", alignItems: "center", gap: 4 }}><LuClock size={12} /> {data} às {hora}</span>}
                      </div>
                    </div>
                    <button onClick={fecharDetalhe} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, lineHeight: 0, flexShrink: 0 }}>
                      <LuX size={22} />
                    </button>
                  </div>

                  {/* Itens */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: C.accent, flexShrink: 0 }}>
                          {item.qty ?? 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{item.name}</div>
                          {item.emoji && <div style={{ fontSize: 12, color: C.muted }}>{item.emoji}</div>}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.green, flexShrink: 0 }}>
                          R$ {((item.price ?? 0) * (item.qty ?? 1)).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: "12px 20px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Total</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: C.green }}>R$ {totalOrder.toFixed(2)}</div>
                    </div>
                    <button
                      onClick={() => {
                        fecharDetalhe();
                        setTimeout(() => {
                          setLancComanda(String(order.comanda));
                          setLancMesa(order.mesa || "");
                          setLancErro("");
                          setMode("pedido");
                          setShowLancar(true);
                        }, 320);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: C.accent, border: "none", borderRadius: 12,
                        color: "#fff", cursor: "pointer",
                        padding: "14px 20px", fontWeight: 800, fontSize: 15,
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      <LuPlus size={16} /> Adicionar itens
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ToastMsg({ visible }) {
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%",
      transform: `translateX(-50%) translateY(${visible ? 0 : -16}px)`,
      background: C.green, color: "#fff",
      padding: "12px 20px", borderRadius: 12,
      fontWeight: 700, fontSize: 14,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      pointerEvents: "none", zIndex: 500,
      opacity: visible ? 1 : 0,
      transition: "opacity 0.3s, transform 0.3s",
      whiteSpace: "nowrap",
    }}>
      ✓ Pedido enviado com sucesso!
    </div>
  );
}
