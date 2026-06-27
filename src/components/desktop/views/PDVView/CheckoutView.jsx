import { useState } from "react";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuArrowLeft, LuBanknote, LuCreditCard, LuZap, LuSmartphone, LuPrinter, LuWallet } from "react-icons/lu";
import { useApp } from "@/context/AppContext";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

const METODOS_CATALOG = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote   },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone },
  { id: "pix",      label: "Pix",      Icon: LuZap        },
];

const METODOS_LABEL = { dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "Pix" };

function imprimirComanda({ comanda, itensVisiveis, subtotal, valorTaxa, total, metodo, valorRecebido, troco }) {
  const agora = new Date().toLocaleString("pt-BR");
  const nomeComanda = fmtComanda(comanda?.comanda);

  const cancelados = (Array.isArray(comanda?.items) ? comanda.items : []).filter(i => i.cancelado);
  const canceladosAgrupados = cancelados.reduce((acc, item) => {
    const chave = `${item.name}||${item.price}`;
    if (acc[chave]) { acc[chave].qty += (item.qty ?? 1); }
    else { acc[chave] = { ...item, qty: item.qty ?? 1 }; }
    return acc;
  }, {});
  const canceladosVisiveis = Object.values(canceladosAgrupados);

  const linhasAtivos = itensVisiveis.map(it => {
    const obs = Array.isArray(it.obs) ? it.obs : [];
    return `
      <tr>
        <td style="padding:6px 4px;border-bottom:1px dashed #ccc;">${it.emoji ?? ""} ${it.name}</td>
        <td style="padding:6px 4px;border-bottom:1px dashed #ccc;text-align:center;">${it.qty}</td>
        <td style="padding:6px 4px;border-bottom:1px dashed #ccc;text-align:right;">R$ ${Number(it.price).toFixed(2)}</td>
        <td style="padding:6px 4px;border-bottom:1px dashed #ccc;text-align:right;font-weight:bold;">R$ ${(it.price * it.qty).toFixed(2)}</td>
      </tr>
      ${obs.map(o => `<tr><td colspan="4" style="padding:2px 4px 6px 16px;font-size:11px;color:#666;">📝 ${o}</td></tr>`).join("")}
    `;
  }).join("");

  const linhasCancelados = canceladosVisiveis.map(it => `
    <tr style="color:#999;">
      <td style="padding:4px;text-decoration:line-through;">${it.emoji ?? ""} ${it.name}</td>
      <td style="padding:4px;text-align:center;text-decoration:line-through;">${it.qty}</td>
      <td colspan="2" style="padding:4px;text-align:right;font-size:11px;">
        CANCELADO${it.motivoCancelamento ? ` — ${it.motivoCancelamento}` : ""}
      </td>
    </tr>
  `).join("");

  const blocoTroco = metodo === "dinheiro" && valorRecebido > 0 ? `
    <tr><td colspan="4" style="padding:4px 4px 0;font-size:12px;color:#555;">Recebido: R$ ${Number(valorRecebido).toFixed(2)}</td></tr>
    <tr><td colspan="4" style="padding:0 4px 4px;font-size:12px;color:#555;">Troco: R$ ${Math.max(0, troco).toFixed(2)}</td></tr>
  ` : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Comanda ${nomeComanda}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; font-size: 13px; color: #111; width: 300px; margin: 0 auto; padding: 16px 8px; }
    h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
    .sub { text-align: center; color: #555; font-size: 11px; margin-bottom: 12px; }
    hr { border: none; border-top: 1px dashed #aaa; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 11px; text-align: left; padding: 4px; border-bottom: 2px solid #111; }
    th:nth-child(2) { text-align: center; }
    th:nth-child(3), th:nth-child(4) { text-align: right; }
    .total-row td { font-size: 15px; font-weight: bold; padding: 10px 4px 4px; }
    .metodo { text-align: center; font-size: 12px; color: #555; margin-top: 8px; }
    .rodape { text-align: center; font-size: 11px; color: #888; margin-top: 16px; }
    .sec-label { font-size: 11px; font-weight: bold; color: #555; padding: 8px 0 4px; letter-spacing: 1px; text-transform: uppercase; }
    @media print { body { width: 100%; } }
  </style>
</head>
<body>
  <h1>🍽 Gastromundi</h1>
  <div class="sub">${nomeComanda}${comanda?.garcom ? ` · ${comanda.garcom}` : ""}</div>
  <div class="sub">${agora}</div>
  <hr/>

  <div class="sec-label">Itens</div>
  <table>
    <thead>
      <tr>
        <th>Produto</th>
        <th>Qtd</th>
        <th>Unit.</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${linhasAtivos}
    </tbody>
    <tfoot>
      ${valorTaxa > 0 ? `
      <tr><td colspan="3" style="padding:6px 4px 2px;font-size:12px;color:#555;">Subtotal</td><td style="text-align:right;padding:6px 4px 2px;font-size:12px;color:#555;">R$ ${subtotal.toFixed(2)}</td></tr>
      <tr><td colspan="3" style="padding:2px 4px;font-size:12px;color:#555;">Taxa de Serviço (10%)</td><td style="text-align:right;padding:2px 4px;font-size:12px;color:#555;">R$ ${valorTaxa.toFixed(2)}</td></tr>
      ` : ""}
      <tr class="total-row">
        <td colspan="3">TOTAL</td>
        <td style="text-align:right;">R$ ${total.toFixed(2)}</td>
      </tr>
      ${blocoTroco}
    </tfoot>
  </table>

  ${metodo ? `<div class="metodo">Pagamento: ${METODOS_LABEL[metodo] ?? metodo}</div>` : ""}

  ${canceladosVisiveis.length > 0 ? `
  <hr/>
  <div class="sec-label">Cancelados</div>
  <table><tbody>${linhasCancelados}</tbody></table>
  ` : ""}

  <hr/>
  <div class="rodape">Obrigado pela preferência!</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=360,height=600");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

export default function CheckoutView({ comanda, items, onConfirm, onBack }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { meiosPagamento, metodosCustom, taxaServico } = useApp();
  const catalogCompleto = [
    ...METODOS_CATALOG,
    ...(metodosCustom ?? []).map(m => ({ ...m, Icon: LuWallet })),
  ];
  const ativos = meiosPagamento?.length ? meiosPagamento : METODOS_CATALOG.map(m => m.id);
  const METODOS = ativos.map(id => catalogCompleto.find(m => m.id === id)).filter(Boolean);

  const [metodo,      setMetodo]      = useState(null);
  const [recebido,    setRecebido]    = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [aplicarTaxa, setAplicarTaxa] = useState(!!taxaServico);

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
  const total         = subtotal + valorTaxa;
  const valorRecebido = parseFloat(recebido.replace(",", ".")) || 0;
  const troco         = metodo === "dinheiro" ? valorRecebido - total : 0;
  const podeConfirmar = metodo && (metodo !== "dinheiro" || valorRecebido >= total);

  const handleConfirm = async () => {
    if (!podeConfirmar || confirmando) return;
    setConfirmando(true);
    await onConfirm({ metodo, recebido: valorRecebido, troco: Math.max(0, troco), total, taxaServico: aplicarTaxa, valorTaxa });
  };

  const handlePrint = () => imprimirComanda({ comanda, itensVisiveis, subtotal, valorTaxa, total, metodo, valorRecebido, troco });

  const isMob = sz.checkoutResumo === 0;

  return (
    <>
      <style>{`
        @keyframes kora-slide-in {
          from { opacity: 0; transform: translateX(32px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
        background: C.bg,
        animation: "kora-slide-in 0.22s ease",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "16px 28px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
        }}>
          <button
            onClick={onBack}
            disabled={confirmando}
            style={{
              background: C.surface,
              border: `1.5px solid ${C.border}`,
              borderRadius: 10, color: C.text,
              cursor: confirmando ? "not-allowed" : "pointer",
              padding: "10px 18px",
              fontWeight: 700, fontSize: 18,
              display: "flex", alignItems: "center", gap: 8,
              transition: "background 0.15s, border-color 0.15s",
              opacity: confirmando ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!confirmando) { e.currentTarget.style.background = C.accent; e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = "#fff"; } }}
            onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
          >
            <LuArrowLeft size={16} /> Voltar
          </button>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Finalizar Comanda</div>
            <div style={{ color: C.muted, fontSize: 16, marginTop: 2 }}>
              {fmtComanda(comanda?.comanda)} · {itensVisiveis.reduce((s, i) => s + i.qty, 0)} {itensVisiveis.reduce((s, i) => s + i.qty, 0) === 1 ? "item" : "itens"}
            </div>
          </div>

          {/* Botão Imprimir */}
          <button
            onClick={handlePrint}
            style={{
              background: C.surface,
              border: `1.5px solid ${C.border}`,
              borderRadius: 10, color: C.text,
              cursor: "pointer",
              padding: "10px 18px",
              fontWeight: 700, fontSize: 17,
              display: "flex", alignItems: "center", gap: 8,
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
          >
            <LuPrinter size={16} /> Imprimir
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0, flexDirection: isMob ? "column" : "row" }}>

          {/* ── Resumo do pedido ── */}
          <div style={{
            width: isMob ? "100%" : sz.checkoutResumo,
            maxHeight: isMob ? "38%" : undefined,
            flexShrink: 0, overflowY: "auto",
            borderRight: isMob ? "none" : `1px solid ${C.border}`,
            borderBottom: isMob ? `1px solid ${C.border}` : "none",
            padding: isMob ? "16px 20px" : "28px 32px",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              fontSize: 16, fontWeight: 700, color: C.muted,
              textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 20,
            }}>
              Resumo · {fmtComanda(comanda?.comanda)}
            </div>

            {itensVisiveis.map((item, i) => {
              const obsArr = Array.isArray(item.obs) ? item.obs : [];
              const qty = item.qty;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 16,
                  padding: "16px 0", borderBottom: `1px solid ${C.border}`,
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: C.alow, border: `1.5px solid ${C.accent}44`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 1,
                  }}>
                    {item.emoji
                      ? <span style={{ fontSize: 20, lineHeight: 1 }}>{item.emoji}</span>
                      : null}
                    <span style={{ fontWeight: 900, fontSize: item.emoji ? 11 : 18, color: C.accent, lineHeight: 1 }}>×{qty}</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: sz.fontLg - 1, lineHeight: 1.2,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: sz.fontBase, color: C.muted, marginTop: 4 }}>
                      {qty}× R$ {Number(item.price).toFixed(2)}
                    </div>
                    {obsArr.map((obs, j) => (
                      <div key={j} style={{
                        marginTop: 5, fontSize: 18,
                        color: C.accent, background: C.alow,
                        borderRadius: 6, padding: "3px 8px", display: "inline-block",
                      }}>
                        📝 {obs}
                      </div>
                    ))}
                  </div>

                  <div style={{ fontWeight: 800, fontSize: sz.fontLg, color: C.text, textAlign: "right", flexShrink: 0 }}>
                    R$ {(item.price * qty).toFixed(2)}
                  </div>
                </div>
              );
            })}

            {/* Taxa de Serviço */}
            {taxaServico && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingTop: 14, marginTop: 4,
                borderTop: `1px solid ${C.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: sz.fontSm, color: C.muted }}>Taxa de Serviço (10%)</span>
                  <button
                    onClick={() => setAplicarTaxa(v => !v)}
                    style={{
                      fontSize: sz.fontSm - 1, fontWeight: 700, padding: "3px 10px",
                      borderRadius: 8, border: `1.5px solid ${aplicarTaxa ? C.red + "88" : C.green + "88"}`,
                      background: aplicarTaxa ? `${C.red}15` : `${C.green}15`,
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

            {/* Total */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 20, marginTop: 8,
              borderTop: `2px solid ${C.border}`,
            }}>
              <span style={{ fontWeight: 800, fontSize: sz.fontLg, color: C.muted }}>Total</span>
              <span style={{ fontWeight: 900, fontSize: sz.fontXl + 6, color: C.green }}>
                R$ {total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* ── Sidebar de pagamento ── */}
          <div style={{
            flex: 1,
            background: C.card,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{ padding: "24px 32px 18px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>
                Forma de Pagamento
              </div>
              <div style={{ fontSize: 17, color: C.muted }}>
                Selecione como o cliente vai pagar
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px", gap: 20, overflow: "hidden" }}>
              <div style={{
                flex: 1,
                display: "grid",
                gridTemplateColumns: METODOS.length === 1 ? "1fr" : "1fr 1fr",
                gridTemplateRows: `repeat(${Math.ceil(METODOS.length / 2)}, 1fr)`,
                gap: 14,
              }}>
                {METODOS.map(m => {
                  const ativo = metodo === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setMetodo(m.id); setRecebido(""); }}
                      style={{
                        borderRadius: 16,
                        border: `2px solid ${ativo ? C.accent : C.border}`,
                        background: ativo ? C.alow : C.surface,
                        color: ativo ? C.accent : C.text,
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: sz.fontLg,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
                        transition: "border-color 0.15s, background 0.15s, color 0.15s, box-shadow 0.15s",
                        boxShadow: ativo ? `0 0 0 4px ${C.accent}22` : "none",
                      }}
                    >
                      <div style={{
                        width: 52, height: 52, borderRadius: 14,
                        background: ativo ? `${C.accent}22` : C.card,
                        border: `1.5px solid ${ativo ? C.accent + "55" : C.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.15s, border-color 0.15s",
                      }}>
                        <m.Icon size={24} />
                      </div>
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {metodo === "dinheiro" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
                  <label style={{ fontSize: 16, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>
                    Valor Recebido
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
                      color: C.muted, fontSize: 18, fontWeight: 700,
                    }}>
                      R$
                    </span>
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      value={recebido}
                      onChange={e => setRecebido(e.target.value)}
                      placeholder={total.toFixed(2)}
                      style={{
                        width: "100%", padding: "16px 18px 16px 56px",
                        borderRadius: 12, border: `1.5px solid ${C.border}`,
                        background: C.surface, color: C.text,
                        fontSize: sz.fontXl - 2, fontWeight: 700,
                        boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = C.accent + "88"}
                      onBlur={e => e.currentTarget.style.borderColor = C.border}
                    />
                  </div>

                  {valorRecebido > 0 && (
                    <div style={{
                      padding: "16px 20px", borderRadius: 12,
                      background: troco >= 0 ? `${C.green}14` : `${C.red}14`,
                      border: `1.5px solid ${troco >= 0 ? C.green : C.red}55`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontSize: sz.fontBase + 1, fontWeight: 700, color: C.muted }}>
                        {troco >= 0 ? "Troco" : "Faltam"}
                      </span>
                      <span style={{ fontSize: sz.fontXl - 2, fontWeight: 900, color: troco >= 0 ? C.green : C.red }}>
                        R$ {Math.abs(troco).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{
              padding: "20px 32px 28px",
              borderTop: `1px solid ${C.border}`,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {!metodo && (
                <div style={{ fontSize: 16, color: C.muted, textAlign: "center", marginBottom: 4 }}>
                  Selecione a forma de pagamento acima
                </div>
              )}
              <button
                onClick={handleConfirm}
                disabled={!podeConfirmar || confirmando}
                style={{
                  width: "100%", padding: 18, borderRadius: 14, border: "none",
                  background: podeConfirmar ? C.green : C.faint,
                  color: "#fff", fontWeight: 800, fontSize: 18,
                  cursor: podeConfirmar ? "pointer" : "not-allowed",
                  transition: "background 0.2s, box-shadow 0.2s",
                  letterSpacing: 0.3,
                  boxShadow: podeConfirmar ? `0 4px 20px ${C.green}44` : "none",
                }}
              >
                {confirmando ? "Processando..." : "✓ Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
