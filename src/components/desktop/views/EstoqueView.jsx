import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import {
  compraParaEstoque, estoqueParaConsumo,
  labelEstoque, labelConsumo,
  temConversaoConsumo, getUnidadesCompra, fmtQtd,
} from "@/utils/conversaoUnidades";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
import {
  LuPackage, LuTriangleAlert, LuCircleAlert,
  LuMinus, LuPlus, LuShoppingCart, LuBox,
  LuLock, LuLockOpen, LuEye, LuEyeOff, LuKeyRound,
  LuChevronUp, LuChevronDown, LuChevronsUpDown,
} from "react-icons/lu";

const LIMITE_BAIXO = 10;

const COLUNAS = [
  { key: "name",     label: "Produto",   align: "left"   },
  { key: "category", label: "Categoria", align: "left"   },
  { key: "price",    label: "Preço",     align: "left"   },
  { key: "saldo",    label: "Saldo",     align: "center" },
  { key: "entrada",  label: "Entrada",   align: "center", sortable: false },
];

function estoqueColor(qty) {
  if (qty === 0)           return C.red;
  if (qty <= LIMITE_BAIXO) return "#f59e0b";
  return C.green;
}

export default function EstoqueView() {
  const { products, estoque, updateEstoque, users } = useApp();
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

  // Autorização de entrada
  const [autorizado,    setAutorizado]    = useState(false);
  const [showAuth,      setShowAuth]      = useState(false);
  const [senha,         setSenha]         = useState("");
  const [senhaErro,     setSenhaErro]     = useState(false);
  const [senhaVis,      setSenhaVis]      = useState(false);
  const [verificando,   setVerificando]   = useState(false);

  const CATS_FIXAS = ["Insumo"];

  const categorias = useMemo(() => {
    const cats = [...new Set([...CATS_FIXAS, ...products.map(p => p.category).filter(Boolean)])].sort();
    return ["Todos", ...cats];
  }, [products]);

  const lista = useMemo(() => {
    let l = products;
    if (busca)                l = l.filter(p => p.name?.toLowerCase().includes(busca.toLowerCase()));
    if (categoria !== "Todos") l = l.filter(p => p.category === categoria);
    l = [...l].sort((a, b) => {
      let va, vb;
      if (sortKey === "saldo") {
        va = estoque[a.id] ?? 0;
        vb = estoque[b.id] ?? 0;
      } else if (sortKey === "price") {
        va = Number(a.price) || 0;
        vb = Number(b.price) || 0;
      } else {
        va = (a[sortKey] ?? "").toString().toLowerCase();
        vb = (b[sortKey] ?? "").toString().toLowerCase();
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return l;
  }, [products, busca, categoria, sortKey, sortDir, estoque]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const totalItens   = products.reduce((s, p) => s + (estoque[p.id] ?? 0), 0);
  const semEstoque   = products.filter(p => (estoque[p.id] ?? 0) === 0).length;
  const estoqueBaixo = products.filter(p => { const q = estoque[p.id] ?? 0; return q > 0 && q <= LIMITE_BAIXO; }).length;

  const getModo = (p) => {
    const stored = modoEntrada[p.id];
    if (stored !== undefined) return stored;
    const units = getUnidadesCompra(p);
    return units.length > 0 ? 0 : "estoque";
  };

  const setModo = (id, modo) => setModoEntrada(prev => ({ ...prev, [id]: modo }));
  const getQtd  = (id) => qtdEntrada[id] ?? "";
  const setQtd  = (id, v) => setQtdEntrada(prev => ({ ...prev, [id]: v }));

  const handleDireto = async (productId, novaQty) => {
    if (novaQty < 0) return;
    setSalvando(prev => ({ ...prev, [productId]: true }));
    await updateEstoque(productId, novaQty);
    setSalvando(prev => ({ ...prev, [productId]: false }));
  };

  const handleAdicionar = async (p) => {
    const raw = parseFloat(String(getQtd(p.id)).replace(",", "."));
    if (!raw || raw <= 0) return;
    const modo    = getModo(p);
    const units   = getUnidadesCompra(p);
    const qtyCurr = estoque[p.id] ?? 0;
    const delta   = modo === "estoque" ? raw : compraParaEstoque(raw, units[modo]);
    const nova    = qtyCurr + delta;
    setSalvando(prev => ({ ...prev, [p.id]: true }));
    await updateEstoque(p.id, nova);
    setQtd(p.id, "");
    setSalvando(prev => ({ ...prev, [p.id]: false }));
  };

  const abrirAuth = () => {
    setSenha(""); setSenhaErro(false); setSenhaVis(false);
    setShowAuth(true);
  };

  const confirmarSenha = async () => {
    if (!senha || verificando) return;
    setVerificando(true);
    const ok = await verificarSenhaAdmin(senha);
    setVerificando(false);
    if (ok) {
      setAutorizado(true);
      setShowAuth(false);
    } else {
      setSenhaErro(true);
    }
  };

  const bloquear = () => {
    setAutorizado(false);
    setModoEntrada({});
    setQtdEntrada({});
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: `${sz.pad - 4}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Estoque</div>
          <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>Controle de quantidade dos produtos</div>
        </div>

        {/* Botão de liberar / bloquear entrada */}
        {autorizado ? (
          <button
            onClick={bloquear}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 10,
              border: `1.5px solid ${C.green}55`,
              background: `${C.green}10`,
              color: C.green, cursor: "pointer",
              fontWeight: 700, fontSize: sz.fontBase,
              fontFamily: "inherit", transition: "all 0.15s",
            }}
          >
            <LuLockOpen size={15} /> Entrada liberada · Bloquear
          </button>
        ) : (
          <button
            onClick={abrirAuth}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 10,
              border: `1.5px solid ${C.border}`,
              background: C.surface,
              color: C.muted, cursor: "pointer",
              fontWeight: 700, fontSize: sz.fontBase,
              fontFamily: "inherit", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + "88"; e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
          >
            <LuLock size={15} /> Liberar Entrada
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: width < 600 ? "1fr" : "repeat(3, 1fr)", gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`, flexShrink: 0 }}>
        {[
          { label: "Total em estoque", value: totalItens,   color: C.green,   Icon: LuPackage       },
          { label: "Sem estoque",       value: semEstoque,   color: C.red,     Icon: LuTriangleAlert },
          { label: "Estoque baixo",     value: estoqueBaixo, color: "#f59e0b", Icon: LuCircleAlert   },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: `${sz.padSm + 2}px ${sz.pad - 4}px`, display: "flex", alignItems: "center", gap: 14 }}>
            <k.Icon size={sz.fontXl - 4} color={k.color} />
            <div>
              <div style={{ fontWeight: 900, fontSize: sz.fontXl - 2, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Busca + categorias */}
      <div style={{ padding: `0 ${sz.pad}px ${sz.padSm}px`, display: "flex", gap: sz.gap, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto..." style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, fontFamily: "inherit", outline: "none", width: Math.min(220, width - sz.pad * 2 - 32), minWidth: 120, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCategoria(cat)} style={{ padding: "7px 14px", borderRadius: 20, border: "none", background: categoria === cat ? C.accent : C.surface, color: categoria === cat ? "#fff" : C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1, transition: "background 0.15s, color 0.15s" }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
        {lista.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, padding: 60 }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>📦</div>
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhum produto encontrado</div>
          </div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {COLUNAS.map(col => {
                    const ativo = sortKey === col.key;
                    const sortable = col.sortable !== false;
                    return (
                      <th
                        key={col.key}
                        onClick={sortable ? () => toggleSort(col.key) : undefined}
                        style={{
                          padding: "12px 16px",
                          textAlign: col.align,
                          fontSize: 14,
                          fontWeight: 700,
                          color: ativo ? C.accent : C.muted,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          whiteSpace: "nowrap",
                          cursor: sortable ? "pointer" : "default",
                          userSelect: "none",
                        }}
                        onMouseEnter={sortable ? e => { if (!ativo) e.currentTarget.style.color = C.text; } : undefined}
                        onMouseLeave={sortable ? e => { e.currentTarget.style.color = ativo ? C.accent : C.muted; } : undefined}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {col.label}
                          {sortable && (
                            ativo
                              ? (sortDir === "asc" ? <LuChevronUp size={13} /> : <LuChevronDown size={13} />)
                              : <LuChevronsUpDown size={13} style={{ opacity: 0.35 }} />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const qty    = estoque[p.id] ?? 0;
                  const cor    = estoqueColor(qty);
                  const busy   = !!salvando[p.id];
                  const ue     = labelEstoque(p);
                  const uc     = labelConsumo(p);
                  const temC   = temConversaoConsumo(p);
                  const units  = getUnidadesCompra(p);
                  const temP   = units.length > 0;
                  const modo   = getModo(p);
                  const rawInput = getQtd(p.id);
                  const rawNum   = parseFloat(String(rawInput).replace(",", ".")) || 0;

                  const unidadeAtual = modo !== "estoque" ? units[modo] : null;
                  const previewEst   = unidadeAtual && rawNum > 0
                    ? compraParaEstoque(rawNum, unidadeAtual) : null;

                  return (
                    <tr key={p.id} onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}>

                      {/* Produto */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 22 }}>{p.emoji ?? "📦"}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>{p.name}</div>
                            {(temP || temC) && (
                              <div style={{ fontSize: 14, color: C.muted, marginTop: 2, display: "flex", gap: 8 }}>
                                {temC && <span>consumo: {uc}</span>}
                                {temP && <span>compra: {units.map(u => u.unidade).join(", ")}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Categoria */}
                      <td style={{ padding: "14px 16px" }}>
                        {p.category && (
                          <span style={{ fontSize: sz.fontSm, fontWeight: 600, background: `${C.accent}18`, color: C.accent, padding: "3px 10px", borderRadius: 20 }}>{p.category}</span>
                        )}
                      </td>

                      {/* Preço */}
                      <td style={{ padding: "14px 16px", fontSize: sz.fontBase, color: C.muted, whiteSpace: "nowrap" }}>
                        R$ {Number(p.price).toFixed(2)}
                      </td>

                      {/* Saldo atual */}
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={{ fontWeight: 800, fontSize: sz.fontBase + 2, color: cor }}>{fmtQtd(qty)}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: cor, opacity: 0.8 }}>{ue}</div>
                          {temC && qty > 0 && (
                            <div style={{ fontSize: 14, color: C.muted, marginTop: 1 }}>
                              ≈ {fmtQtd(estoqueParaConsumo(qty, p))} {uc}
                            </div>
                          )}
                          <div style={{ fontSize: 13, color: cor, marginTop: 2, fontWeight: 600 }}>
                            {qty === 0 ? "Sem estoque" : qty <= LIMITE_BAIXO ? "Baixo" : "OK"}
                          </div>
                        </div>
                      </td>

                      {/* Entrada */}
                      <td style={{ padding: "14px 16px" }}>
                        {!autorizado ? (
                          /* Bloqueado — mostra cadeado clicável */
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={abrirAuth}
                              title="Liberar entrada de estoque"
                              style={{
                                width: 40, height: 40, borderRadius: 10,
                                border: `1px solid ${C.border}`,
                                background: C.surface,
                                color: C.muted, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + "66"; e.currentTarget.style.color = C.accent; e.currentTarget.style.background = `${C.accent}0c`; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; e.currentTarget.style.background = C.surface; }}
                            >
                              <LuLock size={16} />
                            </button>
                          </div>
                        ) : temP ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                            {/* Tabs: uma por unidade de compra + estoque direto */}
                            <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", flexWrap: "wrap" }}>
                              {units.map((u, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setModo(p.id, idx)}
                                  style={{ padding: "5px 10px", border: "none", borderRight: `1px solid ${C.border}`, background: modo === idx ? C.accent : "none", color: modo === idx ? "#fff" : C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", whiteSpace: "nowrap" }}
                                >
                                  <LuShoppingCart size={11} /> {u.unidade}
                                </button>
                              ))}
                              <button
                                onClick={() => setModo(p.id, "estoque")}
                                style={{ padding: "5px 10px", border: "none", background: modo === "estoque" ? C.surface : "none", color: modo === "estoque" ? C.text : C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", whiteSpace: "nowrap" }}
                              >
                                <LuBox size={11} /> {ue}
                              </button>
                            </div>

                            {/* Input + unidade */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={rawInput}
                                onChange={e => setQtd(p.id, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleAdicionar(p)}
                                placeholder="0"
                                style={{ width: 68, padding: "7px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit", outline: "none", textAlign: "center", MozAppearance: "textfield", appearance: "textfield" }}
                              />
                              <span style={{ fontSize: 14, color: C.muted, fontWeight: 600 }}>
                                {modo === "estoque" ? ue : (units[modo]?.unidade ?? ue)}
                              </span>
                            </div>

                            {/* Preview de conversão */}
                            {previewEst !== null && (
                              <div style={{ fontSize: 14, color: C.blue }}>
                                = {fmtQtd(previewEst)} {ue}
                              </div>
                            )}

                            <button
                              onClick={() => handleAdicionar(p)}
                              disabled={busy || !rawInput || rawNum <= 0}
                              style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: rawNum > 0 ? C.accent : C.faint, color: rawNum > 0 ? "#fff" : C.muted, cursor: rawNum > 0 ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 18, fontFamily: "inherit", whiteSpace: "nowrap" }}
                            >
                              {busy ? "..." : "+ Adicionar"}
                            </button>
                          </div>
                        ) : (
                          /* Modo simples: +/- com label */
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <button onClick={() => handleDireto(p.id, qty - 1)} disabled={qty === 0 || busy} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: qty > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: qty === 0 ? 0.4 : 1 }}>
                              <LuMinus size={14} />
                            </button>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                              <input
                                type="number"
                                min="0"
                                value={qty}
                                onChange={e => handleDireto(p.id, parseFloat(e.target.value) || 0)}
                                style={{ width: 60, textAlign: "center", padding: "6px 6px", borderRadius: 8, border: `1.5px solid ${cor}66`, background: `${cor}12`, color: cor, fontWeight: 800, fontSize: sz.fontBase + 1, fontFamily: "inherit", outline: "none", MozAppearance: "textfield", appearance: "textfield" }}
                              />
                              <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{ue}</span>
                            </div>
                            <button onClick={() => handleDireto(p.id, qty + 1)} disabled={busy} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <LuPlus size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de autenticação ─────────────────────────────────── */}
      {showAuth && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAuth(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20, padding: 28,
            width: "100%", maxWidth: 400,
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text, display: "flex", flexDirection: "column", gap: 20,
          }}>
            {/* Título */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${C.accent}18`, border: `1.5px solid ${C.accent}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuKeyRound size={22} color={C.accent} />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>Liberar Entrada de Estoque</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>Requer senha de administrador ou gerente</div>
              </div>
            </div>

            {/* Campo de senha */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 6 }}>
                <LuLock size={12} /> Senha
              </label>
              <div style={{ position: "relative" }}>
                <input
                  autoFocus
                  type={senhaVis ? "text" : "password"}
                  value={senha}
                  onChange={e => { setSenha(e.target.value); setSenhaErro(false); }}
                  onKeyDown={e => { if (e.key === "Enter") confirmarSenha(); }}
                  placeholder="Digite a senha..."
                  style={{
                    width: "100%", padding: "12px 44px 12px 14px",
                    borderRadius: 10, border: `1.5px solid ${senhaErro ? C.red : C.border}`,
                    background: C.surface, color: C.text,
                    fontSize: 16, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box", transition: "border-color 0.15s",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setSenhaVis(v => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 0, display: "flex" }}
                >
                  {senhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
              {senhaErro && (
                <div style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>
                  Senha incorreta. Apenas administrador ou gerente pode liberar.
                </div>
              )}
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowAuth(false)}
                style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 16, fontFamily: "inherit" }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarSenha}
                disabled={!senha || verificando}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                  background: senha && !verificando ? C.accent : C.faint,
                  color: "#fff",
                  cursor: senha && !verificando ? "pointer" : "not-allowed",
                  fontWeight: 800, fontSize: 16, fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <LuLockOpen size={15} />
                {verificando ? "Verificando..." : "Liberar"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
