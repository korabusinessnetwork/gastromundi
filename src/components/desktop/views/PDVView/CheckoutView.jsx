import { useState } from "react";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuArrowLeft, LuBanknote, LuCreditCard, LuZap, LuSmartphone, LuWallet, LuPercent, LuX, LuUsers } from "react-icons/lu";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import ClienteFiadoSelector from "./ClienteFiadoSelector";
import ImpressaoAcoes from "./ImpressaoAcoes";
import "./CheckoutView.css";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

const METODOS_CATALOG = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote   },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone },
  { id: "pix",      label: "Pix",      Icon: LuZap        },
];

export default function CheckoutView({ comanda, items, onConfirm, onBack }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { meiosPagamento, metodosCustom, taxaServico, currentUser } = useApp();
  const catalogCompleto = [
    ...METODOS_CATALOG,
    ...(metodosCustom ?? []).map(m => ({ ...m, Icon: LuWallet })),
  ];
  const ativos = meiosPagamento?.length ? meiosPagamento : METODOS_CATALOG.map(m => m.id);
  const METODOS = ativos.map(id => catalogCompleto.find(m => m.id === id)).filter(Boolean);

  const [pagamentos,    setPagamentos]    = useState([{ metodo: null, valor: 0, recebido: 0 }]);
  const [showDivisor,   setShowDivisor]   = useState(false);
  const [nPessoas,      setNPessoas]      = useState(2);
  const [confirmando,   setConfirmando]   = useState(false);
  const [aplicarTaxa,   setAplicarTaxa]   = useState(!!taxaServico);

  // Desconto / Acréscimo
  const [showAjuste,    setShowAjuste]    = useState(false);
  const [ajusteTipo,    setAjusteTipo]    = useState("desconto");
  const [ajusteMode,    setAjusteMode]    = useState("percentual");
  const [ajusteValor,   setAjusteValor]   = useState("");
  const [ajusteAplicado, setAjusteAplicado] = useState(null);

  // F010 — cliente do fiado (fiado exige cliente identificado)
  const [clienteFiado, setClienteFiado] = useState(null);

  // Agrupa itens ativos pelo mesmo produto (name + price), somando qty e unindo obs
  const itensAgrupados = items.filter(i => !i.cancelado).reduce((acc, item) => {
    const chave = `${item.name}||${item.price}`;
    const obs   = Array.isArray(item.obs) ? item.obs : (item.obs ? [item.obs] : []);
    if (acc[chave]) {
      acc[chave].qty += (item.qty ?? 1);
      obs.forEach(o => { if (!acc[chave].obs.includes(o)) acc[chave].obs.push(o); });
    } else {
      acc[chave] = { ...item, qty: item.qty ?? 1, obs };
    }
    return acc;
  }, {});
  const itensVisiveis = Object.values(itensAgrupados);

  const subtotal      = itensVisiveis.reduce((s, i) => s + i.price * i.qty, 0);
  const valorTaxa     = aplicarTaxa ? subtotal * 0.10 : 0;
  const baseComTaxa   = subtotal + valorTaxa;

  const calcAjuste = (base, aj) => {
    if (!aj) return 0;
    const v = parseFloat(aj.valor) || 0;
    const val = aj.mode === "percentual" ? base * (v / 100) : v;
    return aj.tipo === "desconto" ? -val : val;
  };
  const valorAjuste   = calcAjuste(baseComTaxa, ajusteAplicado);
  const total         = Math.max(0, baseComTaxa + valorAjuste);

  const isSplit = pagamentos.length > 1;

  // Single-mode helpers (pagamentos[0] with total auto-synced)
  const singleMetodo   = pagamentos[0]?.metodo ?? null;
  const singleRecebido = pagamentos[0]?.recebido ?? 0;
  const singleTroco    = singleMetodo === "dinheiro" ? singleRecebido - total : 0;

  // Aggregated sum for split mode
  const somaValores = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);
  const faltaAlocar = total - somaValores;

  const usaFiado = pagamentos.some(p => p.metodo === "fiado");

  const podeConfirmar = (isSplit
    ? pagamentos.every(p => !!p.metodo) && Math.abs(faltaAlocar) < 0.015
    : !!singleMetodo) && (!usaFiado || !!clienteFiado);

  const updatePagamento = (idx, patch) =>
    setPagamentos(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));

  const removePagamento = (idx) =>
    setPagamentos(prev => prev.filter((_, i) => i !== idx));

  const addPagamento = () => {
    setPagamentos(prev => {
      const soma = prev.reduce((s, p) => s + (p.valor || 0), 0);
      const restante = parseFloat(Math.max(0, total - soma).toFixed(2));
      return [...prev, { metodo: null, valor: restante, recebido: 0 }];
    });
  };

  const dividirPagamento = (n) => {
    const totalCents = Math.round(total * 100);
    const base = Math.floor(totalCents / n);
    const resto = totalCents - base * n;
    const valores = Array.from({ length: n }, (_, i) => parseFloat(((i < resto ? base + 1 : base) / 100).toFixed(2)));
    setPagamentos(valores.map(v => ({ metodo: null, valor: v, recebido: 0 })));
    setShowDivisor(false);
  };

  const voltarParaUnico = () => {
    setPagamentos(prev => [{ metodo: prev[0]?.metodo ?? null, valor: total, recebido: 0 }]);
    setShowDivisor(false);
  };

  const handleConfirm = async () => {
    if (!podeConfirmar || confirmando) return;
    setConfirmando(true);
    const payloadPagamentos = isSplit
      ? pagamentos.map(p => ({
          metodo:   p.metodo,
          valor:    p.valor,
          recebido: p.metodo === "dinheiro" ? (p.recebido || 0) : 0,
          troco:    p.metodo === "dinheiro" ? Math.max(0, (p.recebido || 0) - p.valor) : 0,
        }))
      : [{ metodo: singleMetodo, valor: total, recebido: singleRecebido, troco: Math.max(0, singleTroco) }];
    await onConfirm({ pagamentos: payloadPagamentos, total, taxaServico: aplicarTaxa, valorTaxa, ajuste: ajusteAplicado, valorAjuste, clienteId: clienteFiado?.id ?? null });
  };

  const buildPrintPagamentos = () => {
    if (isSplit) {
      return pagamentos.map(p => ({
        metodo:   p.metodo,
        valor:    p.valor,
        recebido: p.metodo === "dinheiro" ? (p.recebido || 0) : 0,
        troco:    p.metodo === "dinheiro" ? Math.max(0, (p.recebido || 0) - p.valor) : 0,
      }));
    }
    return [{ metodo: singleMetodo, valor: total, recebido: singleRecebido, troco: Math.max(0, singleTroco) }];
  };

  // F015 — dados para os templates de impressão (comprovante/pré-nota).
  const montarVendaParaImpressao = () => ({
    comanda: comanda?.comanda,
    items: itensVisiveis,
    valorTaxa,
    ajuste: ajusteAplicado,
    valorAjuste,
    total,
    pagamentos: buildPrintPagamentos(),
  });

  const isMob = sz.checkoutResumo === 0;

  return (
    <>
      <div className="checkout-view" style={{ background: C.bg }}>

        {/* ── Header ── */}
        <div className="checkout-view__header">
          <button
            onClick={onBack}
            disabled={confirmando}
            className="checkout-view__btn-voltar"
            style={{
              background: C.surface,
              border: `1.5px solid ${C.border}`,
              color: C.text,
              cursor: confirmando ? "not-allowed" : "pointer",
              opacity: confirmando ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!confirmando) { e.currentTarget.style.background = C.accent; e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = "#fff"; } }}
            onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
          >
            <LuArrowLeft size={16} /> Voltar
          </button>

          <div style={{ flex: 1 }}>
            <div className="checkout-view__titulo">Finalizar Comanda</div>
            <div className="checkout-view__subtitulo" style={{ color: C.muted }}>
              {fmtComanda(comanda?.comanda)} · {itensVisiveis.reduce((s, i) => s + i.qty, 0)} {itensVisiveis.reduce((s, i) => s + i.qty, 0) === 1 ? "item" : "itens"}
            </div>
          </div>

          {/* Botão Desconto/Acréscimo */}
          <button
            onClick={() => { setShowAjuste(true); setAjusteValor(ajusteAplicado?.valor ?? ""); setAjusteTipo(ajusteAplicado?.tipo ?? "desconto"); setAjusteMode(ajusteAplicado?.mode ?? "percentual"); }}
            className="checkout-view__btn-ajuste"
            style={{
              background: ajusteAplicado ? alfa(ajusteAplicado.tipo === "desconto" ? C.red : C.green, "18") : C.surface,
              border: `1.5px solid ${ajusteAplicado ? alfa(ajusteAplicado.tipo === "desconto" ? C.red : C.green, "66") : C.border}`,
              color: ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? C.red : C.green) : C.text,
            }}
          >
            <LuPercent size={16} /> {ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo") : "Desconto / Acréscimo"}
          </button>

          {/* F015 — imprimir comprovante ou pré-nota */}
          <ImpressaoAcoes montarVenda={montarVendaParaImpressao} />
        </div>

        {/* ── Body ── */}
        <div className="checkout-view__body" style={{ flexDirection: isMob ? "column" : "row" }}>

          {/* ── Resumo do pedido ── */}
          <div className="checkout-view__resumo" style={{
            width: isMob ? "100%" : sz.checkoutResumo,
            maxHeight: isMob ? "38%" : undefined,
            borderRight: isMob ? "none" : `1px solid ${C.border}`,
            borderBottom: isMob ? `1px solid ${C.border}` : "none",
          }}>
            {/* Área scrollável — itens */}
            <div className="checkout-view__resumo-lista" style={{ padding: isMob ? "16px 20px" : "28px 32px" }}>
            <div className="checkout-view__resumo-titulo" style={{ color: C.muted }}>
              Resumo · {fmtComanda(comanda?.comanda)}
            </div>

            {itensVisiveis.map((item, i) => {
              const obsArr = Array.isArray(item.obs) ? item.obs : [];
              const qty = item.qty;
              return (
                <div key={i} className="checkout-view__item" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <div className="checkout-view__item-icone" style={{
                    background: "var(--gm-alow)", border: `1.5px solid ${alfa(C.accent, "44")}`,
                  }}>
                    {item.emoji
                      ? <span style={{ fontSize: 20, lineHeight: 1 }}>{item.emoji}</span>
                      : null}
                    <span style={{ fontWeight: 900, fontSize: item.emoji ? 11 : 18, color: C.accent, lineHeight: 1 }}>×{qty}</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="checkout-view__item-nome" style={{ fontSize: sz.fontLg - 1 }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: sz.fontBase, color: C.muted, marginTop: 4 }}>
                      {qty}× R$ {Number(item.price).toFixed(2)}
                    </div>
                    {obsArr.map((obs, j) => (
                      <div key={j} className="checkout-view__item-obs" style={{
                        fontSize: 18, color: C.accent, background: "var(--gm-alow)",
                      }}>
                        📝 {obs}
                      </div>
                    ))}
                  </div>

                  <div className="checkout-view__item-total" style={{ fontSize: sz.fontLg, color: C.text }}>
                    R$ {(item.price * qty).toFixed(2)}
                  </div>
                </div>
              );
            })}
            </div>{/* fim área scrollável */}

            {/* Rodapé fixo — taxa, desconto, total */}
            <div className="checkout-view__resumo-rodape" style={{ padding: isMob ? "12px 20px 16px" : "16px 32px 24px", borderTop: `1px solid ${C.border}` }}>

            {/* Taxa de Serviço */}
            {taxaServico && (
              <div className="checkout-view__linha-ajuste">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: sz.fontBase, color: C.muted, fontWeight: 600 }}>Taxa de Serviço (10%)</span>
                  <button
                    onClick={() => setAplicarTaxa(v => !v)}
                    style={{
                      fontSize: sz.fontSm - 1, fontWeight: 700, padding: "3px 10px",
                      borderRadius: 8, border: `1.5px solid ${aplicarTaxa ? alfa(C.red, "88") : alfa(C.green, "88")}`,
                      background: aplicarTaxa ? alfa(C.red, "15") : alfa(C.green, "15"),
                      color: aplicarTaxa ? C.red : C.green,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {aplicarTaxa ? "Remover" : "Aplicar"}
                  </button>
                </div>
                <span style={{ fontWeight: 700, fontSize: sz.fontBase, color: aplicarTaxa ? C.text : C.muted, textDecoration: aplicarTaxa ? "none" : "line-through" }}>
                  R$ {(subtotal * 0.10).toFixed(2)}
                </span>
              </div>
            )}

            {/* Desconto / Acréscimo aplicado */}
            {ajusteAplicado && valorAjuste !== 0 && (
              <div className="checkout-view__linha-ajuste">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: sz.fontSm, color: ajusteAplicado.tipo === "desconto" ? C.red : C.green }}>
                    {ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo"}
                    {" "}({ajusteAplicado.mode === "percentual" ? `${ajusteAplicado.valor}%` : `R$ ${parseFloat(ajusteAplicado.valor).toFixed(2)}`})
                  </span>
                  <button
                    onClick={() => setAjusteAplicado(null)}
                    style={{
                      fontSize: sz.fontSm - 2, fontWeight: 700, padding: "2px 8px",
                      borderRadius: 6, border: `1px solid ${C.border}`,
                      background: "transparent", color: C.muted,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Remover
                  </button>
                </div>
                <span style={{ fontWeight: 700, fontSize: sz.fontBase, color: ajusteAplicado.tipo === "desconto" ? C.red : C.green }}>
                  {valorAjuste < 0 ? "-" : "+"}R$ {Math.abs(valorAjuste).toFixed(2)}
                </span>
              </div>
            )}

            {/* Total */}
            <div className="checkout-view__total-linha" style={{ borderTop: `2px solid ${C.border}` }}>
              <span style={{ fontWeight: 800, fontSize: sz.fontLg, color: C.muted }}>Total</span>
              <span style={{ fontWeight: 900, fontSize: sz.fontXl + 6, color: C.green }}>
                R$ {total.toFixed(2)}
              </span>
            </div>

            </div>{/* fim rodapé fixo */}
          </div>

          {/* ── Sidebar de pagamento ── */}
          <div className="checkout-view__pagamento" style={{ background: C.card }}>
            {/* Header da sidebar */}
            <div className="checkout-view__pagamento-header" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div className="checkout-view__pagamento-titulo" style={{ color: C.muted }}>
                    Forma de Pagamento
                  </div>
                  <div style={{ fontSize: 17, color: C.muted }}>
                    {isSplit ? `${pagamentos.length} pagamentos · R$ ${total.toFixed(2)} total` : "Selecione como o cliente vai pagar"}
                  </div>
                </div>
                {isSplit ? (
                  <button
                    onClick={voltarParaUnico}
                    style={{
                      background: "none", border: `1px solid ${C.border}`,
                      borderRadius: 8, color: C.muted, cursor: "pointer",
                      padding: "6px 12px", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                    }}
                  >
                    Pagamento único
                  </button>
                ) : (
                  <button
                    onClick={() => setShowDivisor(v => !v)}
                    className="checkout-view__btn-divisor"
                    style={{
                      background: showDivisor ? alfa(C.accent, "18") : "none",
                      border: `1.5px solid ${showDivisor ? alfa(C.accent, "66") : C.border}`,
                      color: showDivisor ? C.accent : C.muted,
                    }}
                  >
                    <LuUsers size={14} /> Dividir pagamento
                  </button>
                )}
              </div>

              {/* Stepper inline */}
              {showDivisor && !isSplit && (
                <div className="checkout-view__stepper" style={{
                  background: C.surface, border: `1.5px solid ${alfa(C.accent, "44")}`,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.muted, whiteSpace: "nowrap" }}>Dividir entre</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => setNPessoas(n => Math.max(2, n - 1))}
                      className="checkout-view__stepper-btn"
                      style={{
                        border: `1.5px solid ${C.border}`,
                        background: C.card, color: C.text,
                        cursor: nPessoas <= 2 ? "not-allowed" : "pointer", opacity: nPessoas <= 2 ? 0.4 : 1,
                      }}
                    >−</button>
                    <span style={{ fontSize: 20, fontWeight: 900, color: C.text, minWidth: 32, textAlign: "center" }}>{nPessoas}</span>
                    <button
                      onClick={() => setNPessoas(n => Math.min(10, n + 1))}
                      className="checkout-view__stepper-btn"
                      style={{
                        border: `1.5px solid ${C.border}`,
                        background: C.card, color: C.text,
                        cursor: nPessoas >= 10 ? "not-allowed" : "pointer", opacity: nPessoas >= 10 ? 0.4 : 1,
                      }}
                    >+</button>
                  </div>
                  <span style={{ fontSize: 14, color: C.muted }}>pessoas</span>
                  <span style={{ fontSize: 13, color: C.muted, flex: 1 }}>
                    ≈ R$ {(total / nPessoas).toFixed(2)} cada
                  </span>
                  <button
                    onClick={() => dividirPagamento(nPessoas)}
                    style={{
                      padding: "8px 16px", borderRadius: 8, border: "none",
                      background: C.accent, color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: "pointer", fontFamily: "inherit",
                      boxShadow: `0 2px 8px ${alfa(C.accent, "44")}`,
                    }}
                  >
                    Dividir
                  </button>
                </div>
              )}
            </div>

            {/* Conteúdo: lista (split) ou grid (single) */}
            {isSplit ? (
              /* ── Modo split: lista de entradas ── */
              <div className="checkout-view__split-lista">
                {pagamentos.map((p, idx) => {
                  const trocoP = p.metodo === "dinheiro" ? (p.recebido || 0) - p.valor : 0;
                  return (
                    <div key={idx} className="checkout-view__split-item" style={{
                      background: C.surface,
                      border: `1.5px solid ${p.metodo ? alfa(C.accent, "44") : C.border}`,
                    }}>
                      {/* Linha 1: método + valor + remover */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="checkout-view__split-metodos">
                          {METODOS.map(m => (
                            <button
                              key={m.id}
                              onClick={() => updatePagamento(idx, { metodo: m.id })}
                              className="checkout-view__chip-metodo"
                              style={{
                                border: `1.5px solid ${p.metodo === m.id ? C.accent : C.border}`,
                                background: p.metodo === m.id ? "var(--gm-alow)" : "transparent",
                                color: p.metodo === m.id ? C.accent : C.muted,
                              }}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                        <div className="checkout-view__split-valor-wrap">
                          <span className="checkout-view__input-prefixo" style={{ color: C.muted }}>R$</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={p.valor === 0 ? "" : p.valor}
                            onChange={e => updatePagamento(idx, { valor: parseFloat(e.target.value) || 0 })}
                            className="checkout-view__split-input"
                            style={{
                              border: `1.5px solid ${C.border}`,
                              background: C.card, color: C.text,
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                            onBlur={e => e.currentTarget.style.borderColor = C.border}
                          />
                        </div>
                        <button
                          onClick={() => removePagamento(idx)}
                          className="checkout-view__btn-remover-split"
                          style={{ color: C.muted }}
                          onMouseEnter={e => e.currentTarget.style.color = C.red}
                          onMouseLeave={e => e.currentTarget.style.color = C.muted}
                        >
                          <LuX size={16} />
                        </button>
                      </div>

                      {/* Linha 2: dinheiro → recebido + troco */}
                      {p.metodo === "dinheiro" && (
                        <div className="checkout-view__split-recebido">
                          <span style={{ fontSize: 13, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>Recebido:</span>
                          <div style={{ position: "relative", flex: 1 }}>
                            <span className="checkout-view__input-prefixo" style={{ color: C.muted }}>R$</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={p.recebido || ""}
                              onChange={e => updatePagamento(idx, { recebido: parseFloat(e.target.value) || 0 })}
                              placeholder={p.valor.toFixed(2)}
                              className="checkout-view__recebido-input"
                              style={{
                                border: `1.5px solid ${C.border}`,
                                background: C.card, color: C.text,
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                              onBlur={e => e.currentTarget.style.borderColor = C.border}
                            />
                          </div>
                          {(p.recebido || 0) > 0 && (
                            <span style={{
                              fontSize: 13, fontWeight: 700,
                              color: trocoP >= 0 ? C.green : C.accent,
                              minWidth: 90, textAlign: "right", whiteSpace: "nowrap",
                            }}>
                              {trocoP >= 0 ? "Troco" : "Falta"}: R$ {Math.abs(trocoP).toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Falta alocar */}
                {Math.abs(faltaAlocar) >= 0.005 && (
                  <div className="checkout-view__falta-alocar" style={{
                    background: faltaAlocar > 0 ? alfa(C.accent, "14") : alfa(C.red, "14"),
                    border: `1.5px solid ${alfa(faltaAlocar > 0 ? C.accent : C.red, "55")}`,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: faltaAlocar > 0 ? C.accent : C.red }}>
                      {faltaAlocar > 0 ? "Falta alocar" : "Valor excede o total"}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: faltaAlocar > 0 ? C.accent : C.red }}>
                      R$ {Math.abs(faltaAlocar).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* + Adicionar outro */}
                {pagamentos.length < 10 && (
                  <button
                    onClick={addPagamento}
                    className="checkout-view__btn-adicionar-outro"
                    style={{
                      border: `1.5px dashed ${C.border}`,
                      color: C.muted,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
                  >
                    + Adicionar outro
                  </button>
                )}
              </div>
            ) : (
              /* ── Modo single: grid original ── */
              <div className="checkout-view__single">
                <div className="checkout-view__metodos-grid" style={{
                  gridTemplateColumns: METODOS.length === 1 ? "1fr" : "1fr 1fr",
                  gridTemplateRows: `repeat(${Math.ceil(METODOS.length / 2)}, 1fr)`,
                }}>
                  {METODOS.map(m => {
                    const ativo = singleMetodo === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => updatePagamento(0, { metodo: m.id, recebido: 0 })}
                        className="checkout-view__metodo-card"
                        style={{
                          border: `2px solid ${ativo ? C.accent : C.border}`,
                          background: ativo ? "var(--gm-alow)" : C.surface,
                          color: ativo ? C.accent : C.text,
                          fontSize: sz.fontLg,
                          boxShadow: ativo ? `0 0 0 4px ${alfa(C.accent, "22")}` : "none",
                        }}
                      >
                        <div className="checkout-view__metodo-icone" style={{
                          background: ativo ? alfa(C.accent, "22") : C.card,
                          border: `1.5px solid ${ativo ? alfa(C.accent, "55") : C.border}`,
                        }}>
                          <m.Icon size={24} />
                        </div>
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                {singleMetodo === "dinheiro" && (
                  <div className="checkout-view__troco">
                    <label className="checkout-view__troco-label" style={{ color: C.muted }}>
                      Calcular Troco <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 14 }}>(opcional)</span>
                    </label>
                    <div className="checkout-view__troco-input-wrap">
                      <span className="checkout-view__troco-prefixo" style={{ color: C.muted }}>
                        R$
                      </span>
                      <input
                        autoFocus
                        type="number"
                        min="0"
                        step="0.01"
                        value={singleRecebido || ""}
                        onChange={e => updatePagamento(0, { recebido: parseFloat(e.target.value) || 0 })}
                        placeholder={total.toFixed(2)}
                        className="checkout-view__troco-input"
                        style={{
                          border: `1.5px solid ${C.border}`,
                          background: C.surface, color: C.text,
                          fontSize: sz.fontXl - 2,
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                        onBlur={e => e.currentTarget.style.borderColor = C.border}
                      />
                    </div>

                    {singleRecebido > 0 && (
                      <div className="checkout-view__troco-resultado" style={{
                        background: singleTroco >= 0 ? alfa(C.green, "14") : alfa(C.accent, "14"),
                        border: `1.5px solid ${alfa(singleTroco >= 0 ? C.green : C.accent, "55")}`,
                      }}>
                        <span style={{ fontSize: sz.fontBase + 1, fontWeight: 700, color: C.muted }}>
                          {singleTroco >= 0 ? "Troco" : "Falta"}
                        </span>
                        <span style={{ fontSize: sz.fontXl - 2, fontWeight: 900, color: singleTroco >= 0 ? C.green : C.accent }}>
                          R$ {Math.abs(singleTroco).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="checkout-view__rodape-confirmar" style={{ borderTop: `1px solid ${C.border}` }}>
              {usaFiado && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
                    Cliente do fiado
                  </div>
                  <ClienteFiadoSelector
                    cliente={clienteFiado}
                    onSelecionar={setClienteFiado}
                    usuario={currentUser?.username}
                  />
                </div>
              )}
              {!podeConfirmar && (
                <div className="checkout-view__aviso-confirmar" style={{ color: C.muted }}>
                  {usaFiado && !clienteFiado
                    ? "Busque ou cadastre o cliente do fiado acima"
                    : isSplit
                    ? Math.abs(faltaAlocar) >= 0.015
                      ? `Distribua os R$ ${Math.abs(faltaAlocar).toFixed(2)} restantes`
                      : "Selecione a forma de cada pagamento"
                    : "Selecione a forma de pagamento acima"}
                </div>
              )}
              <button
                onClick={handleConfirm}
                disabled={!podeConfirmar || confirmando}
                className="checkout-view__btn-confirmar"
                style={{
                  background: podeConfirmar ? C.green : C.faint,
                  cursor: podeConfirmar ? "pointer" : "not-allowed",
                  boxShadow: podeConfirmar ? `0 4px 20px ${alfa(C.green, "44")}` : "none",
                }}
              >
                {confirmando ? "Processando..." : "✓ Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* ── Popup Desconto / Acréscimo ── */}
      {showAjuste && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAjuste(false); }}
          className="checkout-view__overlay"
        >
          <div className="checkout-view__modal" style={{
            background: C.card, border: `1px solid ${C.border}`,
          }}>
            {/* Header */}
            <div className="checkout-view__modal-header" style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: sz.fontXl, color: "#fff" }}>Desconto / Acréscimo</div>
                <div style={{ fontSize: sz.fontBase, fontWeight: 700, color: C.muted, marginTop: 4 }}>Total atual: R$ {baseComTaxa.toFixed(2)}</div>
              </div>
              <button onClick={() => setShowAjuste(false)} className="checkout-view__modal-fechar" style={{ color: C.muted }}>
                <LuX size={sz.fontLg} />
              </button>
            </div>

            <div style={{ padding: `${sz.padSm}px ${sz.pad}px ${sz.pad}px`, display: "flex", flexDirection: "column", gap: sz.padSm }}>

              {/* Tipo */}
              <div className="checkout-view__modal-tipo-grid" style={{ gap: sz.gap }}>
                {[
                  { id: "desconto",  label: "Desconto",  sub: "Reduz o valor",   color: C.red   },
                  { id: "acrescimo", label: "Acréscimo", sub: "Aumenta o valor", color: C.green },
                ].map(t => (
                  <button key={t.id} onClick={() => setAjusteTipo(t.id)} className="checkout-view__modal-tipo-card" style={{
                    padding: `${sz.padSm}px 12px`,
                    border: `2px solid ${ajusteTipo === t.id ? t.color : C.border}`,
                    background: ajusteTipo === t.id ? alfa(t.color, "18") : C.surface,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: sz.fontLg, color: ajusteTipo === t.id ? t.color : C.text }}>{t.label}</div>
                    <div style={{ fontSize: sz.fontSm, color: ajusteTipo === t.id ? alfa(t.color, "bb") : C.muted, marginTop: 4 }}>{t.sub}</div>
                  </button>
                ))}
              </div>

              {/* Modo */}
              <div className="checkout-view__modal-modo" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                {[{ id: "percentual", label: "Percentual (%)" }, { id: "fixo", label: "Valor Fixo (R$)" }].map(m => (
                  <button key={m.id} onClick={() => { setAjusteMode(m.id); setAjusteValor(""); }} className="checkout-view__modal-modo-btn" style={{
                    padding: `${sz.gap}px 8px`,
                    background: ajusteMode === m.id ? C.card : "transparent",
                    color: ajusteMode === m.id ? C.text : C.muted,
                    fontWeight: ajusteMode === m.id ? 700 : 500,
                    fontSize: sz.fontBase,
                    boxShadow: ajusteMode === m.id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                  }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div>
                <div style={{ fontSize: sz.fontSm, fontWeight: 600, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {ajusteMode === "percentual" ? "Percentual de " : "Valor de "}{ajusteTipo === "desconto" ? "desconto" : "acréscimo"}
                </div>
                <div className="checkout-view__modal-input-wrap">
                  <span className="checkout-view__modal-input-prefixo" style={{ color: C.muted, fontSize: sz.fontLg }}>
                    {ajusteMode === "percentual" ? "%" : "R$"}
                  </span>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    max={ajusteMode === "percentual" ? "100" : undefined}
                    step={ajusteMode === "percentual" ? "1" : "0.01"}
                    value={ajusteValor}
                    onChange={e => setAjusteValor(e.target.value)}
                    placeholder="0"
                    onKeyDown={e => {
                      if (e.key === "Enter" && parseFloat(ajusteValor) > 0) {
                        setAjusteAplicado({ tipo: ajusteTipo, mode: ajusteMode, valor: ajusteValor });
                        setShowAjuste(false);
                      }
                    }}
                    className="checkout-view__modal-input"
                    style={{
                      padding: `${sz.padSm}px ${sz.padSm}px ${sz.padSm}px 52px`,
                      border: `2px solid ${C.border}`, background: C.surface, color: C.text,
                      fontSize: sz.fontXl + 4,
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "99")}
                    onBlur={e => e.currentTarget.style.borderColor = C.border}
                  />
                </div>
              </div>

              {/* Preview */}
              {parseFloat(ajusteValor) > 0 && (() => {
                const v   = parseFloat(ajusteValor) || 0;
                const val = ajusteMode === "percentual" ? baseComTaxa * (v / 100) : v;
                const novoTotal = Math.max(0, ajusteTipo === "desconto" ? baseComTaxa - val : baseComTaxa + val);
                const cor = ajusteTipo === "desconto" ? C.red : C.green;
                return (
                  <div className="checkout-view__preview" style={{ border: `1.5px solid ${alfa(cor, "55")}`, background: alfa(cor, "0c") }}>
                    <div className="checkout-view__preview-linha" style={{ padding: `${sz.gap}px ${sz.padSm}px`, borderBottom: `1px solid ${alfa(cor, "22")}` }}>
                      <span style={{ fontSize: sz.fontBase, color: C.muted }}>Total atual</span>
                      <span style={{ fontSize: sz.fontBase, fontWeight: 700, color: C.muted }}>R$ {baseComTaxa.toFixed(2)}</span>
                    </div>
                    <div className="checkout-view__preview-linha" style={{ padding: `${sz.gap}px ${sz.padSm}px`, borderBottom: `1px solid ${alfa(cor, "22")}` }}>
                      <span style={{ fontSize: sz.fontBase, color: cor, fontWeight: 600 }}>{ajusteTipo === "desconto" ? "− Desconto" : "+ Acréscimo"}</span>
                      <span style={{ fontSize: sz.fontBase, fontWeight: 700, color: cor }}>{ajusteTipo === "desconto" ? "−" : "+"}R$ {val.toFixed(2)}</span>
                    </div>
                    <div className="checkout-view__preview-linha" style={{ alignItems: "center", padding: `${sz.padSm}px ${sz.padSm}px` }}>
                      <span style={{ fontSize: sz.fontLg, fontWeight: 700, color: C.text }}>Novo Total</span>
                      <span style={{ fontSize: sz.fontXl + 2, fontWeight: 900, color: cor }}>R$ {novoTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Ações */}
              <div className="checkout-view__modal-acoes" style={{ gap: sz.gap, paddingTop: 2 }}>
                {ajusteAplicado && (
                  <button
                    onClick={() => { setAjusteAplicado(null); setShowAjuste(false); }}
                    className="checkout-view__modal-btn-remover"
                    style={{
                      flex: 1, padding: `${sz.gap}px`,
                      border: `1.5px solid ${C.border}`, background: "none",
                      color: C.muted, fontSize: sz.fontBase,
                    }}
                  >
                    Remover
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!(parseFloat(ajusteValor) > 0)) return;
                    setAjusteAplicado({ tipo: ajusteTipo, mode: ajusteMode, valor: ajusteValor });
                    setShowAjuste(false);
                  }}
                  disabled={!(parseFloat(ajusteValor) > 0)}
                  className="checkout-view__modal-btn-aplicar"
                  style={{
                    flex: 2, padding: `${sz.gap}px`,
                    background: parseFloat(ajusteValor) > 0 ? C.accent : C.faint,
                    fontSize: sz.fontLg,
                    cursor: parseFloat(ajusteValor) > 0 ? "pointer" : "not-allowed",
                    boxShadow: parseFloat(ajusteValor) > 0 ? `0 4px 20px ${alfa(C.accent, "44")}` : "none",
                  }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
