import { useState } from "react";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuArrowLeft, LuBanknote, LuCreditCard, LuZap, LuSmartphone, LuPrinter, LuWallet, LuPercent, LuX, LuUsers } from "react-icons/lu";
import { createPortal } from "react-dom";
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

function imprimirComanda({ comanda, itensVisiveis, subtotal, valorTaxa, ajusteAplicado, valorAjuste, total, pagamentos }) {
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

  const blocoTroco = (pagamentos ?? [])
    .filter(p => p.metodo === "dinheiro" && (p.recebido || 0) > 0)
    .map(p => `
      <tr><td colspan="4" style="padding:4px 4px 0;font-size:12px;color:#555;">${pagamentos.length > 1 ? "Recebido (Dinheiro)" : "Recebido"}: R$ ${Number(p.recebido).toFixed(2)}</td></tr>
      <tr><td colspan="4" style="padding:0 4px 4px;font-size:12px;color:#555;">Troco: R$ ${Math.max(0, (p.recebido || 0) - p.valor).toFixed(2)}</td></tr>
    `).join("");

  const linhasPagamento = (pagamentos ?? [])
    .filter(p => p.metodo)
    .map(p => `<div class="metodo">${pagamentos.length > 1 ? `R$ ${Number(p.valor).toFixed(2)} · ` : ""}Pagamento: ${METODOS_LABEL[p.metodo] ?? p.metodo}</div>`)
    .join("");

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
      ${(valorTaxa > 0 || (ajusteAplicado && valorAjuste !== 0)) ? `
      <tr><td colspan="3" style="padding:6px 4px 2px;font-size:12px;color:#555;">Subtotal</td><td style="text-align:right;padding:6px 4px 2px;font-size:12px;color:#555;">R$ ${subtotal.toFixed(2)}</td></tr>
      ${valorTaxa > 0 ? `<tr><td colspan="3" style="padding:2px 4px;font-size:12px;color:#555;">Taxa de Serviço (10%)</td><td style="text-align:right;padding:2px 4px;font-size:12px;color:#555;">R$ ${valorTaxa.toFixed(2)}</td></tr>` : ""}
      ${ajusteAplicado && valorAjuste !== 0 ? `<tr><td colspan="3" style="padding:2px 4px;font-size:12px;color:${valorAjuste < 0 ? "#e53e3e" : "#38a169"};">${ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo"} (${ajusteAplicado.mode === "percentual" ? ajusteAplicado.valor + "%" : "R$ " + parseFloat(ajusteAplicado.valor).toFixed(2)})</td><td style="text-align:right;padding:2px 4px;font-size:12px;color:${valorAjuste < 0 ? "#e53e3e" : "#38a169"};">${valorAjuste < 0 ? "-" : "+"}R$ ${Math.abs(valorAjuste).toFixed(2)}</td></tr>` : ""}
      ` : ""}
      <tr class="total-row">
        <td colspan="3">TOTAL</td>
        <td style="text-align:right;">R$ ${total.toFixed(2)}</td>
      </tr>
      ${blocoTroco}
    </tfoot>
  </table>

  ${linhasPagamento}

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

  const podeConfirmar = isSplit
    ? pagamentos.every(p => !!p.metodo) && Math.abs(faltaAlocar) < 0.015
    : !!singleMetodo;

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
    await onConfirm({ pagamentos: payloadPagamentos, total, taxaServico: aplicarTaxa, valorTaxa, ajuste: ajusteAplicado, valorAjuste });
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

  const handlePrint = () => imprimirComanda({ comanda, itensVisiveis, subtotal, valorTaxa, ajusteAplicado, valorAjuste, total, pagamentos: buildPrintPagamentos() });

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

          {/* Botão Desconto/Acréscimo */}
          <button
            onClick={() => { setShowAjuste(true); setAjusteValor(ajusteAplicado?.valor ?? ""); setAjusteTipo(ajusteAplicado?.tipo ?? "desconto"); setAjusteMode(ajusteAplicado?.mode ?? "percentual"); }}
            style={{
              background: ajusteAplicado ? `${ajusteAplicado.tipo === "desconto" ? C.red : C.green}18` : C.surface,
              border: `1.5px solid ${ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? C.red : C.green) + "66" : C.border}`,
              borderRadius: 10,
              color: ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? C.red : C.green) : C.text,
              cursor: "pointer", padding: "10px 18px",
              fontWeight: 700, fontSize: 17,
              display: "flex", alignItems: "center", gap: 8,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <LuPercent size={16} /> {ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo") : "Desconto / Acréscimo"}
          </button>

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
            flexShrink: 0,
            borderRight: isMob ? "none" : `1px solid ${C.border}`,
            borderBottom: isMob ? `1px solid ${C.border}` : "none",
            display: "flex", flexDirection: "column",
          }}>
            {/* Área scrollável — itens */}
            <div style={{ flex: 1, overflowY: "auto", padding: isMob ? "16px 20px" : "28px 32px" }}>
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
            </div>{/* fim área scrollável */}

            {/* Rodapé fixo — taxa, desconto, total */}
            <div style={{ flexShrink: 0, padding: isMob ? "12px 20px 16px" : "16px 32px 24px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 0 }}>

            {/* Taxa de Serviço */}
            {taxaServico && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingBottom: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: sz.fontBase, color: C.muted, fontWeight: 600 }}>Taxa de Serviço (10%)</span>
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

            {/* Desconto / Acréscimo aplicado */}
            {ajusteAplicado && valorAjuste !== 0 && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingBottom: 12,
              }}>
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
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 16, marginTop: 8,
              borderTop: `2px solid ${C.border}`,
            }}>
              <span style={{ fontWeight: 800, fontSize: sz.fontLg, color: C.muted }}>Total</span>
              <span style={{ fontWeight: 900, fontSize: sz.fontXl + 6, color: C.green }}>
                R$ {total.toFixed(2)}
              </span>
            </div>

            </div>{/* fim rodapé fixo */}
          </div>

          {/* ── Sidebar de pagamento ── */}
          <div style={{
            flex: 1,
            background: C.card,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Header da sidebar */}
            <div style={{ padding: "24px 32px 14px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>
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
                    style={{
                      background: showDivisor ? `${C.accent}18` : "none",
                      border: `1.5px solid ${showDivisor ? C.accent + "66" : C.border}`,
                      borderRadius: 8, color: showDivisor ? C.accent : C.muted,
                      cursor: "pointer", padding: "6px 12px",
                      fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "all 0.15s",
                    }}
                  >
                    <LuUsers size={14} /> Dividir pagamento
                  </button>
                )}
              </div>

              {/* Stepper inline */}
              {showDivisor && !isSplit && (
                <div style={{
                  marginTop: 14, padding: "14px 16px", borderRadius: 12,
                  background: C.surface, border: `1.5px solid ${C.accent}44`,
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.muted, whiteSpace: "nowrap" }}>Dividir entre</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => setNPessoas(n => Math.max(2, n - 1))}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${C.border}`,
                        background: C.card, color: C.text, fontSize: 18, fontWeight: 700,
                        cursor: nPessoas <= 2 ? "not-allowed" : "pointer", opacity: nPessoas <= 2 ? 0.4 : 1,
                        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
                      }}
                    >−</button>
                    <span style={{ fontSize: 20, fontWeight: 900, color: C.text, minWidth: 32, textAlign: "center" }}>{nPessoas}</span>
                    <button
                      onClick={() => setNPessoas(n => Math.min(10, n + 1))}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${C.border}`,
                        background: C.card, color: C.text, fontSize: 18, fontWeight: 700,
                        cursor: nPessoas >= 10 ? "not-allowed" : "pointer", opacity: nPessoas >= 10 ? 0.4 : 1,
                        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
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
                      boxShadow: `0 2px 8px ${C.accent}44`,
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
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                {pagamentos.map((p, idx) => {
                  const trocoP = p.metodo === "dinheiro" ? (p.recebido || 0) - p.valor : 0;
                  return (
                    <div key={idx} style={{
                      background: C.surface, borderRadius: 14,
                      border: `1.5px solid ${p.metodo ? C.accent + "44" : C.border}`,
                      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
                    }}>
                      {/* Linha 1: método + valor + remover */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {METODOS.map(m => (
                            <button
                              key={m.id}
                              onClick={() => updatePagamento(idx, { metodo: m.id })}
                              style={{
                                padding: "5px 12px", borderRadius: 8,
                                border: `1.5px solid ${p.metodo === m.id ? C.accent : C.border}`,
                                background: p.metodo === m.id ? C.alow : "transparent",
                                color: p.metodo === m.id ? C.accent : C.muted,
                                fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                                transition: "all 0.12s",
                              }}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ position: "relative", width: 120, flexShrink: 0 }}>
                          <span style={{
                            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                            fontSize: 13, color: C.muted, fontWeight: 700, pointerEvents: "none",
                          }}>R$</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={p.valor === 0 ? "" : p.valor}
                            onChange={e => updatePagamento(idx, { valor: parseFloat(e.target.value) || 0 })}
                            style={{
                              width: "100%", padding: "8px 8px 8px 34px",
                              borderRadius: 8, border: `1.5px solid ${C.border}`,
                              background: C.card, color: C.text,
                              fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                              outline: "none", boxSizing: "border-box",
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = C.accent + "88"}
                            onBlur={e => e.currentTarget.style.borderColor = C.border}
                          />
                        </div>
                        <button
                          onClick={() => removePagamento(idx)}
                          style={{
                            background: "none", border: "none", color: C.muted,
                            cursor: "pointer", padding: 4, flexShrink: 0,
                            display: "flex", alignItems: "center", borderRadius: 6,
                            transition: "color 0.12s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = C.red}
                          onMouseLeave={e => e.currentTarget.style.color = C.muted}
                        >
                          <LuX size={16} />
                        </button>
                      </div>

                      {/* Linha 2: dinheiro → recebido + troco */}
                      {p.metodo === "dinheiro" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>Recebido:</span>
                          <div style={{ position: "relative", flex: 1 }}>
                            <span style={{
                              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                              fontSize: 13, color: C.muted, fontWeight: 700, pointerEvents: "none",
                            }}>R$</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={p.recebido || ""}
                              onChange={e => updatePagamento(idx, { recebido: parseFloat(e.target.value) || 0 })}
                              placeholder={p.valor.toFixed(2)}
                              style={{
                                width: "100%", padding: "6px 8px 6px 34px",
                                borderRadius: 8, border: `1.5px solid ${C.border}`,
                                background: C.card, color: C.text,
                                fontSize: 13, fontFamily: "inherit",
                                outline: "none", boxSizing: "border-box",
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = C.accent + "88"}
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
                  <div style={{
                    padding: "10px 14px", borderRadius: 10,
                    background: faltaAlocar > 0 ? `${C.accent}14` : `${C.red}14`,
                    border: `1.5px solid ${faltaAlocar > 0 ? C.accent : C.red}55`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
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
                    style={{
                      padding: "11px", borderRadius: 10,
                      border: `1.5px dashed ${C.border}`,
                      background: "none", color: C.muted,
                      cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit",
                      transition: "border-color 0.12s, color 0.12s",
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
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px", gap: 20, overflow: "hidden" }}>
                <div style={{
                  flex: 1,
                  display: "grid",
                  gridTemplateColumns: METODOS.length === 1 ? "1fr" : "1fr 1fr",
                  gridTemplateRows: `repeat(${Math.ceil(METODOS.length / 2)}, 1fr)`,
                  gap: 14,
                }}>
                  {METODOS.map(m => {
                    const ativo = singleMetodo === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => updatePagamento(0, { metodo: m.id, recebido: 0 })}
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

                {singleMetodo === "dinheiro" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
                    <label style={{ fontSize: 16, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>
                      Calcular Troco <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 14 }}>(opcional)</span>
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
                        value={singleRecebido || ""}
                        onChange={e => updatePagamento(0, { recebido: parseFloat(e.target.value) || 0 })}
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

                    {singleRecebido > 0 && (
                      <div style={{
                        padding: "16px 20px", borderRadius: 12,
                        background: singleTroco >= 0 ? `${C.green}14` : `${C.accent}14`,
                        border: `1.5px solid ${singleTroco >= 0 ? C.green : C.accent}55`,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
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

            <div style={{
              padding: "20px 32px 28px",
              borderTop: `1px solid ${C.border}`,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {!podeConfirmar && (
                <div style={{ fontSize: 16, color: C.muted, textAlign: "center", marginBottom: 4 }}>
                  {isSplit
                    ? Math.abs(faltaAlocar) >= 0.015
                      ? `Distribua os R$ ${Math.abs(faltaAlocar).toFixed(2)} restantes`
                      : "Selecione a forma de cada pagamento"
                    : "Selecione a forma de pagamento acima"}
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
      {/* ── Popup Desconto / Acréscimo ── */}
      {showAjuste && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAjuste(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9300,
            background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20, border: `1px solid ${C.border}`,
            width: "100%", maxWidth: 420,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Header */}
            <div style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: sz.fontXl, color: "#fff" }}>Desconto / Acréscimo</div>
                <div style={{ fontSize: sz.fontBase, fontWeight: 700, color: C.muted, marginTop: 4 }}>Total atual: R$ {baseComTaxa.toFixed(2)}</div>
              </div>
              <button onClick={() => setShowAjuste(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 6 }}>
                <LuX size={sz.fontLg} />
              </button>
            </div>

            <div style={{ padding: `${sz.padSm}px ${sz.pad}px ${sz.pad}px`, display: "flex", flexDirection: "column", gap: sz.padSm }}>

              {/* Tipo */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sz.gap }}>
                {[
                  { id: "desconto",  label: "Desconto",  sub: "Reduz o valor",   color: C.red   },
                  { id: "acrescimo", label: "Acréscimo", sub: "Aumenta o valor", color: C.green },
                ].map(t => (
                  <button key={t.id} onClick={() => setAjusteTipo(t.id)} style={{
                    padding: `${sz.padSm}px 12px`, borderRadius: 12, fontFamily: "inherit", cursor: "pointer",
                    border: `2px solid ${ajusteTipo === t.id ? t.color : C.border}`,
                    background: ajusteTipo === t.id ? `${t.color}18` : C.surface,
                    textAlign: "center", transition: "all 0.15s",
                  }}>
                    <div style={{ fontWeight: 800, fontSize: sz.fontLg, color: ajusteTipo === t.id ? t.color : C.text }}>{t.label}</div>
                    <div style={{ fontSize: sz.fontSm, color: ajusteTipo === t.id ? t.color + "bb" : C.muted, marginTop: 4 }}>{t.sub}</div>
                  </button>
                ))}
              </div>

              {/* Modo */}
              <div style={{ display: "flex", background: C.surface, borderRadius: 10, padding: 4, gap: 4, border: `1px solid ${C.border}` }}>
                {[{ id: "percentual", label: "Percentual (%)" }, { id: "fixo", label: "Valor Fixo (R$)" }].map(m => (
                  <button key={m.id} onClick={() => { setAjusteMode(m.id); setAjusteValor(""); }} style={{
                    flex: 1, padding: `${sz.gap}px 8px`, borderRadius: 8, border: "none",
                    background: ajusteMode === m.id ? C.card : "transparent",
                    color: ajusteMode === m.id ? C.text : C.muted,
                    fontWeight: ajusteMode === m.id ? 700 : 500,
                    fontSize: sz.fontBase, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: ajusteMode === m.id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                    transition: "all 0.15s",
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
                <div style={{ position: "relative" }}>
                  <span style={{
                    position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
                    color: C.muted, fontSize: sz.fontLg, fontWeight: 700, pointerEvents: "none", userSelect: "none",
                  }}>
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
                    style={{
                      width: "100%", padding: `${sz.padSm}px ${sz.padSm}px ${sz.padSm}px 52px`,
                      borderRadius: 12, boxSizing: "border-box",
                      border: `2px solid ${C.border}`, background: C.surface, color: C.text,
                      fontSize: sz.fontXl + 4, fontWeight: 800, fontFamily: "inherit", outline: "none",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = C.accent + "99"}
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
                  <div style={{ borderRadius: 12, overflow: "hidden", border: `1.5px solid ${cor}55`, background: `${cor}0c` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: `${sz.gap}px ${sz.padSm}px`, borderBottom: `1px solid ${cor}22` }}>
                      <span style={{ fontSize: sz.fontBase, color: C.muted }}>Total atual</span>
                      <span style={{ fontSize: sz.fontBase, fontWeight: 700, color: C.muted }}>R$ {baseComTaxa.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: `${sz.gap}px ${sz.padSm}px`, borderBottom: `1px solid ${cor}22` }}>
                      <span style={{ fontSize: sz.fontBase, color: cor, fontWeight: 600 }}>{ajusteTipo === "desconto" ? "− Desconto" : "+ Acréscimo"}</span>
                      <span style={{ fontSize: sz.fontBase, fontWeight: 700, color: cor }}>{ajusteTipo === "desconto" ? "−" : "+"}R$ {val.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${sz.padSm}px ${sz.padSm}px` }}>
                      <span style={{ fontSize: sz.fontLg, fontWeight: 700, color: C.text }}>Novo Total</span>
                      <span style={{ fontSize: sz.fontXl + 2, fontWeight: 900, color: cor }}>R$ {novoTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Ações */}
              <div style={{ display: "flex", gap: sz.gap, paddingTop: 2 }}>
                {ajusteAplicado && (
                  <button
                    onClick={() => { setAjusteAplicado(null); setShowAjuste(false); }}
                    style={{
                      flex: 1, padding: `${sz.gap}px`, borderRadius: 10,
                      border: `1.5px solid ${C.border}`, background: "none",
                      color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit",
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
                  style={{
                    flex: 2, padding: `${sz.gap}px`, borderRadius: 10, border: "none",
                    background: parseFloat(ajusteValor) > 0 ? C.accent : C.faint,
                    color: "#fff", fontWeight: 800, fontSize: sz.fontLg,
                    cursor: parseFloat(ajusteValor) > 0 ? "pointer" : "not-allowed",
                    fontFamily: "inherit",
                    boxShadow: parseFloat(ajusteValor) > 0 ? `0 4px 20px ${C.accent}44` : "none",
                    transition: "background 0.15s, box-shadow 0.15s",
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
