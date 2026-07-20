import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { getSizes } from "@/constants/sizes";
import { useResponsive } from "@/utils/hooks";
import { LuUtensils, LuUser, LuShoppingCart, LuArrowLeft, LuCheck, LuMinus, LuPlus, LuChevronUp, LuChevronDown, LuX, LuSearch, LuLock, LuLayoutGrid, LuLogOut, LuClock, LuChartBar, LuLightbulb, LuPause, LuSend, LuTrash2 } from "react-icons/lu";
import { totalLancamentosGarcom, radarOportunidades } from "@/lib/painelGarcom";
import { criarEspera, adicionarEspera, removerEspera, totalEspera, qtdItensEspera, resumoEsperas } from "@/lib/pedidosEmEspera";
import { useTravaComanda } from "@/hooks/useTravaComanda";
import { travadaPorOutro, nomeTrava } from "@/lib/comandaLock";

const TOTAL_COMANDAS = 1000;
const PAGE = 50;
const AMBER = "#f59e0b";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

// ── Tela Principal ────────────────────────────────────────────────
export default function MobilePage() {
  const {
    pending, products, currentUser, estoque, caixaAberto,
    loading: bootstrapLoading,
    addPending, updatePending,
    lancadas, addLancada,
    logout,
    sales, sessaoAbertaEm, categoriaGrupoMap,
    redeOnline, ponteEndereco,
  } = useApp();

  const { width } = useResponsive();
  const sz = getSizes(width);

  const [mode,       setMode]       = useState("pedido"); // "pedido" | "grid" | "painel"
  const [cartItems,  setCartItems]  = useState([]);
  const [salvando,   setSalvando]   = useState(false);
  const [limite,     setLimite]     = useState(PAGE);
  const [catAtiva,   setCatAtiva]   = useState("Todos");
  const [cartAberto, setCartAberto] = useState(false);
  const [toast,      setToast]      = useState("");
  const [buscaGrid,  setBuscaGrid]  = useState("");
  const [buscaItens, setBuscaItens] = useState("");

  // Pedidos em espera: fila local de pedidos montados mas ainda não
  // enviados — o garçom atende várias mesas e envia tudo de uma vez.
  const [esperas,     setEsperas]     = useState([]);
  const [showEsperas, setShowEsperas] = useState(false);

  // Modal de lançamento
  const [showLancar,    setShowLancar]    = useState(false);
  const [lancComanda,   setLancComanda]   = useState("");
  const [lancMesa,      setLancMesa]      = useState("");
  const [lancErro,      setLancErro]      = useState("");

  // Detalhe da comanda (bottom sheet)
  const [detalheComanda, setDetalheComanda] = useState(null); // order object
  const [detalheVisible, setDetalheVisible] = useState(false);
  const detalheTimer = useRef(null);

  const abrirDetalhe = (order) => {
    // cancela qualquer close em andamento para evitar race condition
    if (detalheTimer.current) clearTimeout(detalheTimer.current);
    setDetalheComanda(order);
    setDetalheVisible(true);
  };
  const fecharDetalhe = () => {
    setDetalheVisible(false);
    detalheTimer.current = setTimeout(() => setDetalheComanda(null), 300);
  };

  const abertas = pending.filter(o => o.status !== "closed");
  const mapa    = {};
  abertas.forEach(o => { mapa[String(o.comanda)] = o; });

  // ── Trava de edição (Leva 14): enquanto EU estou com uma comanda aberta
  // (detalhe ou tela de pedido apontando pra ela), ninguém mais mexe nela —
  // e vice-versa. Usa detalheComanda (não detalheVisible) pra trava
  // sobreviver à transição "Adicionar itens" → tela de pedido sem soltar.
  const comandaEmEdicao = detalheComanda
    ? (mapa[String(detalheComanda.comanda)] ?? detalheComanda)
    : (mode === "pedido" && lancComanda.trim() ? mapa[lancComanda.trim()] : null);
  const { bloqueio } = useTravaComanda(comandaEmEdicao, true);
  const emUsoPorOutro = (order) => travadaPorOutro(order, currentUser?.username);

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
    // preserva comanda pré-preenchida (ex.: vinda de "Adicionar itens")
    setLancComanda(prev => prev || "");
    setLancMesa(prev => prev || "");
    setLancErro("");
    setShowLancar(true);
  };

  const selecionarComanda = (comanda, mesa = "") => {
    const order = mapa[String(comanda)];
    if (order) {
      // comanda já existe → sempre mostra o detalhe (mesmo sem itens)
      abrirDetalhe(order);
    } else {
      // slot vazio → fluxo rápido de lançamento
      setLancComanda(String(comanda));
      setLancMesa(mesa || "");
      setLancErro("");
      setMode("pedido");
      setShowLancar(true);
    }
  };

  // Núcleo compartilhado entre "Lançar Pedido" e "Enviar todos" (em espera):
  // cria a comanda se não existe, registra a mesa e acumula os itens.
  // Lança em caso de erro — o chamador decide como avisar o usuário.
  const persistirLancamento = async (nomeComanda, mesa, itensCarrinho) => {
    let order = mapa[nomeComanda];
    if (!order) {
      order = {
        id:         crypto.randomUUID(),
        comanda:    nomeComanda,
        mesa,
        items:      [],
        status:     "open",
        total:      0,
        garcom:     currentUser?.name     || "",
        created_by: currentUser?.username || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await addPending(order);
      if (error) throw error;
      logAction(currentUser?.username, "comanda:abrir", { msg: `Comanda aberta (palm): ${nomeComanda}`, name: currentUser?.name, role: currentUser?.role, comanda: nomeComanda, via: "palm" });
    } else if (mesa && !order.mesa) {
      const { error } = await updatePending(order.id, { mesa });
      if (error) throw error;
      order = { ...order, mesa };
    }

    // order atualizado localmente — não depende do Supabase sync
    let updatedOrder = order;

    if (itensCarrinho.length > 0) {
      const anteriores = Array.isArray(order.items) ? order.items : [];
      const agora      = new Date().toISOString();
      const novos      = itensCarrinho.map(({ _key, ...rest }) => ({ ...rest, launched_at: agora }));
      const acumulados = [...anteriores, ...novos];
      const novoTotal  = acumulados.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
      const { error } = await updatePending(order.id, { items: acumulados, total: novoTotal }, { baseItems: anteriores });
      if (error) throw error;
      addLancada(order.id);
      logAction(currentUser?.username, "itens:lancar", { msg: `Itens lançados (palm) na Comanda ${nomeComanda} · ${novos.length} tipo(s) · R$ ${novoTotal.toFixed(2)}`, name: currentUser?.name, role: currentUser?.role, comanda: nomeComanda, tipos: novos.length, total: novoTotal, via: "palm" });
      updatedOrder = { ...order, items: acumulados, total: novoTotal, updated_at: agora };
    }
    return updatedOrder;
  };

  const handleLancar = async () => {
    const nomeComanda = lancComanda.trim();
    if (!nomeComanda) { setLancErro("Informe o número ou nome da comanda."); return; }
    if (salvando) return;
    // Trava de edição (Leva 14): comanda aberta em outro aparelho → não mexe.
    const existente = mapa[nomeComanda];
    if (existente && (emUsoPorOutro(existente) || (bloqueio && comandaEmEdicao?.id === existente.id))) {
      setLancErro(`Em uso por ${bloqueio?.nome ?? nomeTrava(existente)}. Aguarde fechar a comanda.`);
      return;
    }
    // Já tem pedido em espera na fila? O pedido atual se junta a eles e a
    // tela de revisão abre com TODOS — o garçom lança tudo num toque só,
    // em vez de enviar um agora e esquecer os que ficaram esperando.
    if (cartItems.length > 0 && esperas.length > 0) {
      setEsperas(prev => adicionarEspera(prev, criarEspera({ comanda: nomeComanda, mesa: lancMesa, items: cartItems })));
      setShowLancar(false);
      setLancComanda("");
      setLancMesa("");
      setLancErro("");
      setCartItems([]);
      setCartAberto(false);
      setShowEsperas(true);
      return;
    }
    setSalvando(true);
    try {
      const updatedOrder = await persistirLancamento(nomeComanda, lancMesa.trim(), cartItems);

      if (cartItems.length > 0) {
        setToast("✓ Pedido enviado com sucesso!");
        setTimeout(() => setToast(""), 3000);
      }

      setShowLancar(false);
      setLancComanda("");
      setLancMesa("");
      setCartItems([]);
      setCartAberto(false);
      setMode("grid");
      // reabre o detalhe imediatamente com os dados locais
      setTimeout(() => abrirDetalhe(updatedOrder), 80);
    } catch (e) {
      console.error(e);
      setLancErro("Erro ao lançar pedido. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  // ── Pedidos em espera ─────────────────────────────────────────
  // Guarda o pedido atual na fila local (nada vai ao servidor ainda)
  // e libera a tela para o garçom seguir com a próxima comanda.
  const porEmEspera = () => {
    const nomeComanda = lancComanda.trim();
    if (!nomeComanda) { setLancErro("Informe o número ou nome da comanda."); return; }
    if (cartItems.length === 0) return;
    setEsperas(prev => adicionarEspera(prev, criarEspera({ comanda: nomeComanda, mesa: lancMesa, items: cartItems })));
    setShowLancar(false);
    setLancComanda("");
    setLancMesa("");
    setLancErro("");
    setCartItems([]);
    setCartAberto(false);
    setToast(`Comanda ${nomeComanda} em espera — siga com a próxima`);
    setTimeout(() => setToast(""), 2500);
  };

  // Envia todos os pedidos da fila de uma vez. Quem falhar (comanda em
  // uso em outro aparelho, erro de rede) permanece na fila com o motivo
  // à vista — nada se perde silenciosamente.
  const enviarEsperas = async () => {
    if (salvando || esperas.length === 0) return;
    setSalvando(true);
    const restantes = [];
    let enviados = 0;
    for (const esp of esperas) {
      const existente = mapa[esp.comanda];
      if (existente && emUsoPorOutro(existente)) {
        restantes.push({ ...esp, erro: `Em uso por ${nomeTrava(existente)}. Aguarde liberar e envie de novo.` });
        continue;
      }
      try {
        await persistirLancamento(esp.comanda, esp.mesa, esp.items);
        enviados++;
      } catch (e) {
        console.error(e);
        restantes.push({ ...esp, erro: "Erro ao enviar. Tente de novo." });
      }
    }
    setEsperas(restantes);
    setSalvando(false);
    if (enviados > 0) {
      setToast(`✓ ${enviados} pedido${enviados !== 1 ? "s" : ""} enviado${enviados !== 1 ? "s" : ""} com sucesso!`);
      setTimeout(() => setToast(""), 3000);
    }
    if (restantes.length === 0) {
      setShowEsperas(false);
      setMode("grid");
    }
  };

  // ── Guard: bootstrap ainda carregando o estado real do caixa ─
  // (o default local é "aberto" — sem este gate dava para lançar
  // pedido nos primeiros segundos mesmo com o caixa fechado)
  if (bootstrapLoading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100dvh", background: varColor(C.bg),
        fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.muted),
        fontSize: 15, fontWeight: 600, padding: 24,
      }}>
        Conectando ao caixa…
      </div>
    );
  }

  // ── Guard: caixa fechado ──────────────────────────────────────
  if (!caixaAberto) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100dvh", background: varColor(C.bg), fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.text),
        padding: 24, gap: 16,
      }}>
        <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 20, padding: "40px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%", maxWidth: 340, textAlign: "center", boxSizing: "border-box" }}>
          <div style={{ background: `${alfa(C.accent, "1a")}`, borderRadius: "50%", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LuLock size={32} color={varColor(C.accent)} />
          </div>
          <div style={{ fontWeight: 900, fontSize: 22 }}>Caixa Fechado</div>
          <div style={{ fontSize: 14, color: varColor(C.muted), lineHeight: 1.65 }}>
            O caixa está fechado. Para lançar pedidos, solicite ao responsável que abra o caixa.
          </div>
        </div>
      </div>
    );
  }

  const qGrid = buscaGrid.trim().toLowerCase();
  const resultadosGrid = qGrid
    ? abertas.filter(o => {
        const nome = String(o.comanda).toLowerCase();
        return nome.includes(qGrid) || fmtComanda(o.comanda).toLowerCase().includes(qGrid) || (o.garcom ?? "").toLowerCase().includes(qGrid);
      })
    : null;

  // ── PEDIDO (tela de produtos) ─────────────────────────────────
  return (
    <>
    {/* ── Leva 13: sem internet + ponte configurada → oferece o modo local.
        Um toque leva à página servida pela ponte no Wi-Fi do caixa, onde o
        pedido continua saindo na impressora. Botão só aparece quando faz
        sentido (prevenção > erro). ── */}
    {redeOnline === false && ponteEndereco && (
      <button
        onClick={() => { window.location.href = ponteEndereco; }}
        style={{
          position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)",
          zIndex: 300, border: "none", borderRadius: 999, padding: "10px 18px",
          background: AMBER, color: "#1a1a1a", fontWeight: 800, fontSize: 14,
          fontFamily: "inherit", cursor: "pointer", boxShadow: "0 4px 14px #0006",
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        Sem internet? Tocar pedido pelo Wi-Fi do caixa
      </button>
    )}
    {/* ── GRID de comandas ── */}
    {mode === "grid" && (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: varColor(C.bg), fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.text) }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid var(${C.border})`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><LuLayoutGrid size={20} /> Comandas</div>
            <div style={{ fontSize: 13, color: varColor(C.muted), marginTop: 2 }}>
              {abertas.length} comanda{abertas.length !== 1 ? "s" : ""} em aberto
            </div>
          </div>
          <button onClick={() => { setMode("pedido"); setLancComanda(""); setLancMesa(""); }} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: varColor(C.accent), border: "none", borderRadius: 12, color: "#fff", cursor: "pointer", padding: "10px 16px", fontWeight: 700, fontSize: 14, WebkitTapHighlightColor: "transparent" }}>
            <LuArrowLeft size={16} /> Voltar
          </button>
        </div>
        {/* Busca */}
        <div style={{ padding: "10px 16px", borderBottom: `1px solid var(${C.border})`, flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <LuSearch size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: varColor(C.muted), pointerEvents: "none" }} />
            <input value={buscaGrid} onChange={e => setBuscaGrid(e.target.value)} placeholder="Buscar comanda por nome ou número..." style={{ width: "100%", padding: "11px 36px 11px 36px", borderRadius: 12, border: `1.5px solid ${buscaGrid ? varColor(C.accent) : varColor(C.border)}`, background: varColor(C.surface), color: varColor(C.text), fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }} />
            {buscaGrid && <button onClick={() => setBuscaGrid("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", lineHeight: 0, padding: 2 }}><LuX size={16} /></button>}
          </div>
        </div>
        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {resultadosGrid !== null ? (
            resultadosGrid.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 10, color: varColor(C.muted) }}>
                <LuSearch size={40} style={{ opacity: 0.3 }} />
                <div style={{ fontWeight: 600, fontSize: 15 }}>Nenhuma comanda encontrada</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: sz.gridCols, gap: 12, padding: 16 }}>
                {resultadosGrid.map(order => {
                  const isLancada = lancadas.has(order.id);
                  const items     = Array.isArray(order.items) ? order.items : [];
                  const hasItems  = items.reduce((s, it) => s + (it.qty || 1), 0) > 0;
                  const emUso     = emUsoPorOutro(order);
                  const borderColor = isLancada ? AMBER : hasItems ? `${alfa(C.blue, "66")}` : varColor(C.border);
                  const bgColor     = isLancada ? `${AMBER}14` : hasItems ? `${alfa(C.blue, "0a")}` : varColor(C.card);
                  return (
                    <div key={order.id} onClick={() => selecionarComanda(order.comanda, order.mesa)} style={{ background: bgColor, border: `1.5px solid ${borderColor}`, borderRadius: 16, padding: "18px 14px", color: varColor(C.text), display: "flex", flexDirection: "column", gap: 6, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{fmtComanda(order.comanda)}</div>
                      {emUso && <div style={{ fontSize: 11, fontWeight: 700, color: AMBER, display: "flex", alignItems: "center", gap: 4 }}><LuLock size={10} /> Em uso · {nomeTrava(order)}</div>}
                      {order.mesa && <div style={{ fontSize: 12, color: varColor(C.muted) }}>Mesa {order.mesa}</div>}
                      {order.garcom && <div style={{ fontSize: 12, color: varColor(C.muted), display: "flex", alignItems: "center", gap: 4 }}><LuUser size={11} /> {order.garcom}</div>}
                      <div style={{ fontSize: 13, fontWeight: 700, color: hasItems ? varColor(C.green) : varColor(C.muted) }}>{hasItems ? `R$ ${(order.total ?? 0).toFixed(2)}` : "Vazio"}</div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: sz.gridCols, gap: 12, padding: 16 }}>
                {Array.from({ length: limite }, (_, i) => i + 1).map(num => {
                  const order     = mapa[String(num)];
                  const isLancada = order ? lancadas.has(order.id) : false;
                  const items     = order ? (Array.isArray(order.items) ? order.items : []) : [];
                  const hasItems  = items.reduce((s, it) => s + (it.qty || 1), 0) > 0;
                  const borderColor = isLancada ? AMBER : hasItems ? `${alfa(C.blue, "66")}` : varColor(C.border);
                  const bgColor     = isLancada ? `${AMBER}14` : hasItems ? `${alfa(C.blue, "0a")}` : varColor(C.card);
                  return (
                    <div key={num} onClick={() => selecionarComanda(num, order?.mesa)} style={{ background: bgColor, border: `1.5px ${order ? "solid" : "dashed"} ${borderColor}`, borderRadius: 16, padding: "18px 14px", color: varColor(C.text), display: "flex", flexDirection: "column", gap: 6, opacity: !order ? 0.45 : 1, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>Comanda {num}</div>
                      {order ? (
                        <>
                          {emUsoPorOutro(order) && <div style={{ fontSize: 11, fontWeight: 700, color: AMBER, display: "flex", alignItems: "center", gap: 4 }}><LuLock size={10} /> Em uso · {nomeTrava(order)}</div>}
                          {order.mesa && <div style={{ fontSize: 12, color: varColor(C.muted) }}>Mesa {order.mesa}</div>}
                          {order.garcom && <div style={{ fontSize: 12, color: varColor(C.muted), display: "flex", alignItems: "center", gap: 4 }}><LuUser size={11} /> {order.garcom}</div>}
                          <div style={{ fontSize: 13, fontWeight: 700, color: hasItems ? varColor(C.green) : varColor(C.muted) }}>{hasItems ? `R$ ${(order.total ?? 0).toFixed(2)}` : "Vazio"}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: varColor(C.muted) }}>Disponível</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {limite < TOTAL_COMANDAS && (
                <div style={{ padding: "0 16px 24px", display: "flex", justifyContent: "center" }}>
                  <button onClick={() => setLimite(l => Math.min(l + PAGE, TOTAL_COMANDAS))} style={{ padding: "12px 32px", borderRadius: 12, border: `1px solid var(${C.border})`, background: varColor(C.card), color: varColor(C.muted), fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%" }}>
                    Ver mais · {limite}/{TOTAL_COMANDAS}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {/* Fila de espera visível também na grade — o garçom nunca "esquece"
            pedidos guardados no aparelho */}
        {esperas.length > 0 && (
          <div style={{ padding: "10px 16px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid var(${C.border})`, flexShrink: 0, background: varColor(C.card) }}>
            <BarraEsperas esperas={esperas} onClick={() => setShowEsperas(true)} />
          </div>
        )}
      </div>
    )}

    {/* ── PAINEL DO GARÇOM (C3) ── */}
    {mode === "painel" && (() => {
      const comandasEVendas = [...abertas, ...(Array.isArray(sales) ? sales : [])];
      const meu = totalLancamentosGarcom(comandasEVendas, {
        nome: currentUser?.name,
        username: currentUser?.username,
        desde: sessaoAbertaEm,
      });
      const cards = radarOportunidades(abertas, categoriaGrupoMap, products);
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: varColor(C.bg), fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.text) }}>
          {/* Header */}
          <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid var(${C.border})`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><LuChartBar size={20} /> Meu Painel</div>
              <div style={{ fontSize: 13, color: varColor(C.muted), marginTop: 2 }}>{currentUser?.name?.split(" ")[0]} · caixa atual</div>
            </div>
            <button onClick={() => setMode("pedido")} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: varColor(C.accent), border: "none", borderRadius: 12, color: "#fff", cursor: "pointer", padding: "10px 16px", fontWeight: 700, fontSize: 14, WebkitTapHighlightColor: "transparent" }}>
              <LuArrowLeft size={16} /> Voltar
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16, paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
            {/* Bloco 1 — Minhas vendas no caixa atual */}
            <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 13, color: varColor(C.muted), fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Meus lançamentos no caixa</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: varColor(C.green), marginTop: 8 }}>R$ {meu.total.toFixed(2)}</div>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                <div style={{ fontSize: 14, color: varColor(C.muted) }}><b style={{ color: varColor(C.text) }}>{meu.comandas}</b> comanda{meu.comandas !== 1 ? "s" : ""}</div>
                <div style={{ fontSize: 14, color: varColor(C.muted) }}><b style={{ color: varColor(C.text) }}>{meu.itens}</b> {meu.itens === 1 ? "item" : "itens"}</div>
              </div>
              {!sessaoAbertaEm && (
                <div style={{ marginTop: 10, fontSize: 12, color: varColor(C.muted) }}>
                  Total desde a abertura do caixa. Conta comandas abertas e vendas atribuídas a você.
                </div>
              )}
            </div>

            {/* Bloco 2 — Radar de oportunidades */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <LuLightbulb size={18} color={AMBER} />
                <span style={{ fontWeight: 800, fontSize: 16 }}>Oportunidades</span>
                {cards.length > 0 && <span style={{ background: `${AMBER}22`, color: AMBER, borderRadius: 8, padding: "1px 8px", fontSize: 12, fontWeight: 800 }}>{cards.length}</span>}
              </div>
              {cards.length === 0 ? (
                <div style={{ background: varColor(C.card), border: `1px dashed var(${C.border})`, borderRadius: 14, padding: 24, textAlign: "center", color: varColor(C.muted), fontSize: 14 }}>
                  {Object.keys(categoriaGrupoMap ?? {}).length === 0
                    ? "Configure os grupos de categoria (Configurações → Grupos de Categoria) para ver sugestões."
                    : "Nenhuma oportunidade agora. Tudo em dia! 🎉"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {cards.map((card, i) => {
                    const order = mapa[String(card.comanda)];
                    return (
                      <button
                        key={`${card.comandaId}-${card.regraId}-${i}`}
                        onClick={() => order && abrirDetalhe(order)}
                        style={{
                          textAlign: "left", background: `${AMBER}0f`, border: `1.5px solid ${AMBER}44`,
                          borderRadius: 14, padding: "14px 16px", cursor: order ? "pointer" : "default",
                          display: "flex", alignItems: "center", gap: 12, color: varColor(C.text),
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: `${AMBER}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <LuLightbulb size={20} color={AMBER} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 15 }}>
                            {fmtComanda(card.comanda)}{card.mesa ? ` · Mesa ${card.mesa}` : ""}
                          </div>
                          <div style={{ fontSize: 13, color: varColor(C.muted), marginTop: 2 }}>{card.rotulo}</div>
                        </div>
                        {order && <LuPlus size={18} color={AMBER} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── PEDIDO ── */}
    {mode === "pedido" && <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: varColor(C.bg), fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.text) }}>

      {/* Header */}
      <div style={{
        padding: "14px 16px", borderBottom: `1px solid var(${C.border})`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
          <button
            onClick={logout}
            title="Sair"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: `1.5px solid var(${C.border})`, borderRadius: 10,
              color: varColor(C.muted), cursor: "pointer", padding: 7, lineHeight: 0,
              WebkitTapHighlightColor: "transparent", flexShrink: 0,
            }}
          >
            <LuLogOut size={16} />
          </button>
          <div style={{ fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap" }}>
            <LuUtensils size={20} style={{ flexShrink: 0 }} /> Palm
            <span style={{ fontSize: 13, fontWeight: 500, color: varColor(C.muted), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {currentUser?.name?.split(" ")[0]}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setMode("painel")}
            title="Meu painel"
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
              background: varColor(C.surface), border: `1.5px solid var(${C.border})`, borderRadius: 12,
              color: varColor(C.muted), cursor: "pointer",
              padding: "8px 10px", fontWeight: 600, fontSize: 13,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <LuChartBar size={14} /> Painel
          </button>
          <button
            onClick={() => { setMode("grid"); setLancComanda(""); setLancMesa(""); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap",
              background: varColor(C.surface), border: `1.5px solid var(${C.border})`, borderRadius: 12,
              color: varColor(C.muted), cursor: "pointer",
              padding: "8px 12px", fontWeight: 600, fontSize: 13,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <LuLayoutGrid size={14} /> Comandas {abertas.length > 0 && <span style={{ background: varColor(C.accent), color: "#fff", borderRadius: 8, padding: "1px 6px", fontSize: 11, fontWeight: 800 }}>{abertas.length}</span>}
          </button>
        </div>
      </div>

      {/* Busca de item */}
      <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <LuSearch size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: varColor(C.muted), pointerEvents: "none" }} />
          <input
            value={buscaItens}
            onChange={e => setBuscaItens(e.target.value)}
            placeholder="Buscar item..."
            style={{
              width: "100%", padding: "11px 36px 11px 36px",
              borderRadius: 12, border: `1.5px solid ${buscaItens ? varColor(C.accent) : varColor(C.border)}`,
              background: varColor(C.surface), color: varColor(C.text),
              fontSize: 15, fontFamily: "inherit", outline: "none",
              boxSizing: "border-box", transition: "border-color 0.15s",
            }}
          />
          {buscaItens && (
            <button onClick={() => setBuscaItens("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", lineHeight: 0, padding: 2 }}>
              <LuX size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Filtro categorias */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto", flexShrink: 0, borderBottom: `1px solid var(${C.border})` }}>
        {categorias.map(cat => (
          <button key={cat} onClick={() => setCatAtiva(cat)} style={{
            padding: "8px 16px", borderRadius: 20, border: "none",
            background: catAtiva === cat ? varColor(C.accent) : varColor(C.surface),
            color: catAtiva === cat ? "#fff" : varColor(C.muted),
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
          <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: sz.gridCols, gap: 10, padding: 14, alignContent: "start", paddingBottom: "calc(120px + env(safe-area-inset-bottom))" }}>
            {visiveis.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 10, color: varColor(C.muted) }}>
                <LuSearch size={40} style={{ opacity: 0.3 }} />
                <div style={{ fontWeight: 600, fontSize: 15 }}>Nenhum item encontrado</div>
              </div>
            ) : visiveis.map(product => {
              const qty = cartItems.find(i => i.id === product.id)?.qty ?? 0;
              return (
                <button key={product.id} onClick={() => handleAddProduct(product)} style={{
                  background: qty > 0 ? varColor(C.alow) : varColor(C.card),
                  border: `1.5px solid ${qty > 0 ? varColor(C.accent) : varColor(C.border)}`,
                  borderRadius: 14, padding: "16px 12px",
                  cursor: "pointer", textAlign: "left", color: varColor(C.text),
                  display: "flex", flexDirection: "column", gap: 6,
                  position: "relative", WebkitTapHighlightColor: "transparent",
                }}>
                  {qty > 0 && (
                    <span style={{ position: "absolute", top: 8, right: 8, background: varColor(C.accent), color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 11, fontWeight: 800 }}>
                      {qty}
                    </span>
                  )}
                  {product.emoji && <span style={{ fontSize: 26 }}>{product.emoji}</span>}
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{product.name}</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: varColor(C.green) }}>R$ {Number(product.price).toFixed(2)}</div>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Bottom bar fixa */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: varColor(C.card), borderTop: `1px solid var(${C.border})`,
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        display: "flex", flexDirection: "column", gap: 8, zIndex: 100,
      }}>
        {esperas.length > 0 && <BarraEsperas esperas={esperas} onClick={() => setShowEsperas(true)} />}
        {cartItems.length > 0 && (
          <button
            onClick={() => setCartAberto(v => !v)}
            style={{
              background: varColor(C.surface), border: `1px solid var(${C.border})`,
              borderRadius: 10, padding: "10px 16px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              cursor: "pointer", color: varColor(C.text), WebkitTapHighlightColor: "transparent",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <LuShoppingCart size={16} /> {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}
            </span>
            <span style={{ fontWeight: 900, fontSize: 15, color: varColor(C.green), display: "flex", alignItems: "center", gap: 4 }}>
              R$ {total.toFixed(2)} {cartAberto ? <LuChevronDown size={14}/> : <LuChevronUp size={14}/>}
            </span>
          </button>
        )}

        {cartAberto && cartItems.length > 0 && (
          <div style={{ background: varColor(C.surface), borderRadius: 12, border: `1px solid var(${C.border})`, maxHeight: 200, overflowY: "auto", padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 14px 6px", borderBottom: `1px solid var(${C.border})` }}>
              <button
                onClick={() => { setCartItems([]); setCartAberto(false); setLancComanda(""); setLancMesa(""); }}
                style={{ background: "none", border: "none", color: varColor(C.red), cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "4px 0", display: "flex", alignItems: "center", gap: 4, WebkitTapHighlightColor: "transparent" }}
              >
                <LuX size={13} /> Limpar carrinho
              </button>
            </div>
            {cartItems.map((item, i) => (
              <div key={item._key ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: i < cartItems.length - 1 ? `1px solid var(${C.border})` : "none" }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{item.name}</span>
                <button onClick={() => handleChangeQty(i, item.qty - 1)} style={{ background: `${alfa(C.red, "15")}`, border: `1px solid ${alfa(C.red, "44")}`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: varColor(C.red) }}><LuMinus size={13}/></button>
                <span style={{ fontWeight: 800, fontSize: 14, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                <button onClick={() => handleChangeQty(i, item.qty + 1)} style={{ background: `${alfa(C.green, "15")}`, border: `1px solid ${alfa(C.green, "44")}`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: varColor(C.green) }}><LuPlus size={13}/></button>
                <span style={{ fontWeight: 700, fontSize: 13, color: varColor(C.green), minWidth: 60, textAlign: "right" }}>R$ {(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={cartItems.length > 0 ? abrirModalLancar : undefined}
          disabled={cartItems.length === 0}
          style={{
            padding: "16px", borderRadius: 12, border: "none",
            background: cartItems.length > 0 ? varColor(C.accent) : varColor(C.faint),
            color: "#fff", fontWeight: 800, fontSize: 16,
            cursor: cartItems.length > 0 ? "pointer" : "not-allowed",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <LuCheck size={16} style={{ marginRight: 6 }} />Lançar Pedido
        </button>
      </div>

    </div>}

    {/* Toast — sempre visível independente do mode */}
    <ToastMsg msg={toast} />

    {/* Modal Lançar */}
    {showLancar && createPortal(
      <div
        {...fecharAoClicarFora(() => setShowLancar(false), !salvando)}
        style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", fontFamily: "'Inter',system-ui,sans-serif" }}
      >
        <div style={{ background: varColor(C.card), borderRadius: "20px 20px 0 0", padding: 24, paddingBottom: "calc(24px + env(safe-area-inset-bottom))", width: "100%", maxHeight: "100dvh", overflowY: "auto", border: `1px solid var(${C.border})`, boxShadow: "0 -8px 32px rgba(0,0,0,0.5)", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: varColor(C.text) }}>{cartItems.length === 0 ? "Abrir Comanda" : "Lançar Pedido"}</div>
              <div style={{ fontSize: 13, color: varColor(C.muted), marginTop: 2 }}>{cartItems.length === 0 ? "Sem itens por enquanto — dá pra lançar depois" : `${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"} · R$ ${total.toFixed(2)}`}</div>
            </div>
            <button onClick={() => { if (!salvando) setShowLancar(false); }} style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, lineHeight: 0 }}><LuX size={22} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Número da Comanda *</div>
              <input autoFocus value={lancComanda} onChange={e => { setLancComanda(e.target.value); setLancErro(""); }} onKeyDown={e => e.key === "Enter" && document.getElementById("palm-mesa")?.focus()} placeholder="Ex: 42 ou Mesa VIP" maxLength={40} style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${lancErro ? varColor(C.red) + "88" : varColor(C.border)}`, background: varColor(C.surface), color: varColor(C.text), fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Mesa <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></div>
              <input id="palm-mesa" value={lancMesa} onChange={e => setLancMesa(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLancar()} placeholder="Ex: 5" maxLength={20} style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: `1.5px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
            {lancErro && <div style={{ fontSize: 14, color: varColor(C.red), fontWeight: 600, padding: "8px 12px", background: `${alfa(C.red, "12")}`, borderRadius: 8, border: `1px solid ${alfa(C.red, "33")}` }}>{lancErro}</div>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { if (!salvando) setShowLancar(false); }} style={{ flex: 1, padding: 14, borderRadius: 12, border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: 15, fontFamily: "inherit" }}>Cancelar</button>
            <button onClick={handleLancar} disabled={!lancComanda.trim() || salvando} style={{ flex: 2, padding: 14, borderRadius: 12, border: "none", background: lancComanda.trim() && !salvando ? varColor(C.accent) : varColor(C.surface), color: lancComanda.trim() && !salvando ? "#fff" : varColor(C.muted), cursor: lancComanda.trim() && !salvando ? "pointer" : "not-allowed", fontWeight: 800, fontSize: 15, fontFamily: "inherit", transition: "background 0.15s, color 0.15s" }}>
              {salvando ? "Enviando..."
                : cartItems.length === 0 ? (mapa[lancComanda.trim()] ? "✓ Abrir Comanda" : "✓ Criar Comanda")
                : esperas.length > 0 ? `✓ Revisar e lançar todos (${esperas.length + 1})`
                : mapa[lancComanda.trim()] ? "✓ Adicionar à Comanda" : "✓ Criar e Lançar"}
            </button>
          </div>
          {/* Em espera: segura este pedido no aparelho e libera a tela para a
              próxima comanda — tudo é enviado junto depois, num toque só. */}
          {cartItems.length > 0 && (
            <button
              onClick={porEmEspera}
              disabled={!lancComanda.trim() || salvando}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: 13, borderRadius: 12, marginTop: -4,
                border: `1.5px solid ${lancComanda.trim() && !salvando ? `${AMBER}88` : varColor(C.border)}`,
                background: lancComanda.trim() && !salvando ? `${AMBER}14` : "none",
                color: lancComanda.trim() && !salvando ? AMBER : varColor(C.muted),
                cursor: lancComanda.trim() && !salvando ? "pointer" : "not-allowed",
                fontWeight: 800, fontSize: 15, fontFamily: "inherit",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <LuPause size={15} /> Deixar em espera e ir pra próxima
            </button>
          )}
        </div>
      </div>,
      document.body
    )}

    {/* Bottom sheet — pedidos em espera (revisar e enviar todos) */}
    {showEsperas && createPortal(
      <div
        {...fecharAoClicarFora(() => setShowEsperas(false), !salvando)}
        style={{ position: "fixed", inset: 0, zIndex: 9200, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", fontFamily: "'Inter',system-ui,sans-serif" }}
      >
        <div style={{ background: varColor(C.card), borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "80dvh", border: `1px solid var(${C.border})`, boxShadow: "0 -8px 32px rgba(0,0,0,0.5)", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "20px 20px 14px", borderBottom: `1px solid var(${C.border})`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 19, color: varColor(C.text), display: "flex", alignItems: "center", gap: 8 }}>
                <LuPause size={18} color={AMBER} /> Pedidos em espera
              </div>
              {(() => {
                const r = resumoEsperas(esperas);
                return (
                  <div style={{ fontSize: 13, color: varColor(C.muted), marginTop: 3 }}>
                    {r.pedidos} pedido{r.pedidos !== 1 ? "s" : ""} · {r.itens} {r.itens === 1 ? "item" : "itens"} · R$ {r.total.toFixed(2)}
                  </div>
                );
              })()}
            </div>
            <button onClick={() => { if (!salvando) setShowEsperas(false); }} style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, lineHeight: 0, flexShrink: 0 }}><LuX size={22} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {esperas.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: varColor(C.muted), fontSize: 14 }}>Nenhum pedido em espera.</div>
            ) : esperas.map((esp, i) => (
              <div key={esp.comanda} style={{ padding: "14px 20px", borderBottom: i < esperas.length - 1 ? `1px solid var(${C.border})` : "none", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: varColor(C.text) }}>
                    {fmtComanda(esp.comanda)}{esp.mesa ? <span style={{ fontWeight: 500, color: varColor(C.muted) }}> · Mesa {esp.mesa}</span> : null}
                  </div>
                  <div style={{ fontSize: 13, color: varColor(C.muted), marginTop: 3, lineHeight: 1.5 }}>
                    {esp.items.map(it => `${it.qty ?? 1}× ${it.name}`).join(", ")}
                  </div>
                  {esp.erro && (
                    <div style={{ fontSize: 12, color: AMBER, fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <LuLock size={11} style={{ flexShrink: 0 }} /> {esp.erro}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: varColor(C.green) }}>R$ {totalEspera(esp).toFixed(2)}</div>
                  <button
                    onClick={() => setEsperas(prev => {
                      const depois = removerEspera(prev, esp.comanda);
                      if (depois.length === 0) setShowEsperas(false);
                      return depois;
                    })}
                    title="Descartar este pedido"
                    style={{ background: `${alfa(C.red, "12")}`, border: `1px solid ${alfa(C.red, "33")}`, borderRadius: 8, color: varColor(C.red), cursor: "pointer", padding: 6, lineHeight: 0, WebkitTapHighlightColor: "transparent" }}
                  >
                    <LuTrash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 20px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", borderTop: `1px solid var(${C.border})` }}>
            <button
              onClick={enviarEsperas}
              disabled={salvando || esperas.length === 0}
              style={{
                width: "100%", padding: 16, borderRadius: 12, border: "none",
                background: !salvando && esperas.length > 0 ? varColor(C.accent) : varColor(C.faint),
                color: "#fff", fontWeight: 800, fontSize: 16,
                cursor: !salvando && esperas.length > 0 ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                fontFamily: "inherit", WebkitTapHighlightColor: "transparent",
              }}
            >
              <LuSend size={16} /> {salvando ? "Enviando..." : `Enviar todos (${esperas.length})`}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Bottom sheet — detalhe da comanda */}
    {createPortal(
      <div {...fecharAoClicarFora(fecharDetalhe)} style={{ position: "fixed", inset: 0, zIndex: 9100, background: detalheVisible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)", display: "flex", alignItems: "flex-end", fontFamily: "'Inter',system-ui,sans-serif", pointerEvents: detalheComanda ? "auto" : "none", transition: "background 0.3s" }}>
        <div style={{ background: varColor(C.card), borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "80dvh", border: `1px solid var(${C.border})`, boxShadow: "0 -8px 32px rgba(0,0,0,0.5)", boxSizing: "border-box", display: "flex", flexDirection: "column", transform: detalheVisible ? "translateY(0)" : "translateY(100%)", transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1)" }}>
          {detalheComanda && (() => {
            // sempre usa dados frescos do pending; fallback para o snapshot local (ex: logo após lançamento)
            const order = mapa[String(detalheComanda.comanda)] ?? detalheComanda;
            const items = Array.isArray(order.items) ? order.items : [];
            const totalOrder = items.reduce((s, it) => s + (it.price ?? 0) * (it.qty ?? 1), 0);
            const hora = order.updated_at
              ? new Date(order.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
              : order.created_at ? new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
            const data = order.updated_at ? new Date(order.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;
            return (
              <>
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
                  <div style={{ width: 40, height: 4, borderRadius: 2, background: varColor(C.border) }} />
                </div>
                <div style={{ padding: "8px 20px 14px", borderBottom: `1px solid var(${C.border})`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 20, color: varColor(C.text) }}>{fmtComanda(order.comanda)}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 4 }}>
                      {order.mesa && <span style={{ fontSize: 13, color: varColor(C.muted) }}>Mesa {order.mesa}</span>}
                      {order.garcom && <span style={{ fontSize: 13, color: varColor(C.muted), display: "flex", alignItems: "center", gap: 4 }}><LuUser size={12} /> {order.garcom}</span>}
                      {hora && <span style={{ fontSize: 13, color: varColor(C.accent), display: "flex", alignItems: "center", gap: 4 }}><LuClock size={12} /> {data} às {hora}</span>}
                    </div>
                  </div>
                  <button onClick={fecharDetalhe} style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, lineHeight: 0, flexShrink: 0 }}><LuX size={22} /></button>
                </div>
                {/* Trava de edição (Leva 14): outra pessoa está com esta comanda aberta */}
                {(bloqueio || emUsoPorOutro(order)) && (
                  <div style={{ margin: "10px 20px 0", padding: "10px 14px", borderRadius: 12, background: `${AMBER}14`, border: `1.5px solid ${AMBER}66`, color: AMBER, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                    <LuLock size={14} style={{ flexShrink: 0 }} />
                    Em uso por {bloqueio?.nome ?? nomeTrava(order)} — dá pra ver, mas não mexer até liberar.
                  </div>
                )}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {items.map((item, i) => {
                    const qty = item.qty ?? 1;
                    const lancHora = item.launched_at
                      ? new Date(item.launched_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                      : null;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < items.length - 1 ? `1px solid var(${C.border})` : "none" }}>
                        {/* Badge de quantidade — destaque visual */}
                        <div style={{
                          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                          background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}`,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          lineHeight: 1,
                        }}>
                          <span style={{ fontWeight: 900, fontSize: 18, color: varColor(C.accent) }}>{qty}</span>
                          <span style={{ fontSize: 9, color: varColor(C.accent), opacity: 0.7, fontWeight: 700, letterSpacing: 0.3 }}>un</span>
                        </div>
                        {/* Nome + horário */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: varColor(C.text), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {item.emoji ? `${item.emoji} ${item.name}` : item.name}
                          </div>
                          {lancHora && (
                            <div style={{ fontSize: 11, color: varColor(C.muted), display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                              <LuClock size={10} /> {lancHora}
                            </div>
                          )}
                        </div>
                        {/* Preço */}
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: varColor(C.green) }}>
                            R$ {((item.price ?? 0) * qty).toFixed(2)}
                          </div>
                          {qty > 1 && (
                            <div style={{ fontSize: 10, color: varColor(C.muted), marginTop: 1 }}>
                              {qty}× R$ {Number(item.price ?? 0).toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: "12px 20px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", borderTop: `1px solid var(${C.border})`, display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: varColor(C.muted), fontWeight: 600 }}>Total</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: varColor(C.green) }}>R$ {totalOrder.toFixed(2)}</div>
                  </div>
                  {(() => {
                    const travada = !!(bloqueio || emUsoPorOutro(order));
                    return (
                      <button disabled={travada} onClick={() => {
                        if (travada) return;
                        fecharDetalhe();
                        setTimeout(() => {
                          setLancComanda(String(order.comanda));
                          setLancMesa(order.mesa || "");
                          setLancErro("");
                          setMode("pedido");
                          // não abre o modal — usuário seleciona produtos primeiro
                        }, 320);
                      }} style={{ display: "flex", alignItems: "center", gap: 8, background: travada ? varColor(C.surface) : varColor(C.accent), border: "none", borderRadius: 12, color: travada ? varColor(C.muted) : "#fff", cursor: travada ? "not-allowed" : "pointer", padding: "14px 20px", fontWeight: 800, fontSize: 15, WebkitTapHighlightColor: "transparent" }}>
                        {travada ? <LuLock size={16} /> : <LuPlus size={16} />} {travada ? "Em uso" : "Adicionar itens"}
                      </button>
                    );
                  })()}
                </div>
              </>
            );
          })()}
        </div>
      </div>,
      document.body
    )}
    </>
  );
}

// Barra âmbar "N pedidos em espera" — mesma cara na tela de pedido e na
// grade, sempre levando ao mesmo lugar (revisar e enviar todos).
function BarraEsperas({ esperas, onClick }) {
  const r = resumoEsperas(esperas);
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", boxSizing: "border-box",
        background: `${AMBER}14`, border: `1.5px solid ${AMBER}88`,
        borderRadius: 12, padding: "12px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        cursor: "pointer", color: AMBER, fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <LuPause size={15} /> {r.pedidos} pedido{r.pedidos !== 1 ? "s" : ""} em espera · R$ {r.total.toFixed(2)}
      </span>
      <span style={{ fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
        Revisar e enviar <LuSend size={13} />
      </span>
    </button>
  );
}

function ToastMsg({ msg }) {
  // guarda a última mensagem para o texto não sumir durante o fade-out
  const ultima = useRef("");
  if (msg) ultima.current = msg;
  const visible = !!msg;
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%",
      transform: `translateX(-50%) translateY(${visible ? 0 : -16}px)`,
      background: varColor(C.green), color: "#fff",
      padding: "12px 20px", borderRadius: 12,
      fontWeight: 700, fontSize: 14,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      pointerEvents: "none", zIndex: 500,
      opacity: visible ? 1 : 0,
      transition: "opacity 0.3s, transform 0.3s",
      whiteSpace: "nowrap",
    }}>
      {msg || ultima.current}
    </div>
  );
}
