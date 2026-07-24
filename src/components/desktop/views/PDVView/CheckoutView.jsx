import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuArrowLeft, LuBanknote, LuCreditCard, LuZap, LuSmartphone, LuWallet, LuPercent, LuX, LuUsers, LuTrash2, LuMinus, LuPlus, LuLock, LuEye, LuEyeOff } from "react-icons/lu";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { metodoUsaTef } from "@/lib/tef";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
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

export default function CheckoutView({ comanda, items, onConfirm, onBack, onRemoverItem }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { meiosPagamento, metodosCustom, taxaServico, currentUser, redeOnline, addonHabilitado, metodosTef } = useApp();
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
  const [erroConfirmar, setErroConfirmar] = useState("");
  const [aplicarTaxa,   setAplicarTaxa]   = useState(!!taxaServico);

  // Desconto / Acréscimo
  const [showAjuste,    setShowAjuste]    = useState(false);
  const [ajusteTipo,    setAjusteTipo]    = useState("desconto");
  const [ajusteMode,    setAjusteMode]    = useState("percentual");
  const [ajusteValor,   setAjusteValor]   = useState("");
  const [ajusteAplicado, setAjusteAplicado] = useState(null);

  // F010 — cliente do fiado (fiado exige cliente identificado)
  const [clienteFiado, setClienteFiado] = useState(null);

  // Leva 15.1 — remover produto na finalização. `modoRemocao` mostra a
  // lixeira em cada item; `remocao` é o popup de confirmação (qty +
  // motivo + senha de gerente, mesmo padrão do cancelamento no CartPanel).
  const [modoRemocao, setModoRemocao] = useState(false);
  const [remocao,     setRemocao]     = useState(null); // { item, qtyMax, qtySel, motivo }
  const [remSenha,     setRemSenha]     = useState("");
  const [remSenhaErro, setRemSenhaErro] = useState(false);
  const [remSenhaVis,  setRemSenhaVis]  = useState(false);
  const [remErro,      setRemErro]      = useState("");
  const [removendo,    setRemovendo]    = useState(false);

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

  // Todo valor cobrado é arredondado a centavos: taxa de 10% e ajuste
  // percentual geram frações de centavo que estouravam a tolerância do
  // split e chegavam ao pagamento com casas fantasma.
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

  const subtotal      = round2(itensVisiveis.reduce((s, i) => s + i.price * i.qty, 0));
  const valorTaxa     = aplicarTaxa ? round2(subtotal * 0.10) : 0;
  const baseComTaxa   = round2(subtotal + valorTaxa);

  const calcAjuste = (base, aj) => {
    if (!aj) return 0;
    const v = parseFloat(aj.valor) || 0;
    const val = aj.mode === "percentual" ? base * (v / 100) : v;
    return round2(aj.tipo === "desconto" ? -val : val);
  };
  const valorAjuste   = calcAjuste(baseComTaxa, ajusteAplicado);
  const total         = round2(Math.max(0, baseComTaxa + valorAjuste));

  const isSplit = pagamentos.length > 1;

  // Single-mode helpers (pagamentos[0] with total auto-synced)
  const singleMetodo   = pagamentos[0]?.metodo ?? null;
  const singleRecebido = pagamentos[0]?.recebido ?? 0;
  const singleTroco    = singleMetodo === "dinheiro" ? singleRecebido - total : 0;

  // Aggregated sum for split mode
  const somaValores = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);
  const faltaAlocar = total - somaValores;

  const usaFiado = pagamentos.some(p => p.metodo === "fiado");

  // Prevenção > erro: sem internet, métodos que passam pela maquininha
  // (TEF) ficam desabilitados na hora de escolher — em vez de deixar
  // selecionar e falhar na confirmação. Só vale com o add-on TEF ativo.
  const metodoIndisponivelOffline = (id) =>
    !redeOnline && addonHabilitado?.("tef") && metodoUsaTef(id, metodosTef);
  const tefOffline = pagamentos.some(p => p.metodo && metodoIndisponivelOffline(p.metodo));

  // No split, dinheiro com "Recebido" digitado abaixo do valor alocado
  // não pode confirmar — a tela já mostra "Falta: R$ x" e o botão guia.
  // Recebido em branco (0) segue valendo como "valor exato".
  const dinheiroInsuficiente = isSplit && pagamentos.some(
    p => p.metodo === "dinheiro" && (p.recebido || 0) > 0 && p.recebido < p.valor - 0.005
  );

  // Tolerância de meio centavo (só ruído de float): com round2 em tudo,
  // 1 centavo não alocado é diferença real e deve bloquear a confirmação.
  const podeConfirmar = itensVisiveis.length > 0 && (isSplit
    ? pagamentos.every(p => !!p.metodo) && Math.abs(faltaAlocar) < 0.005 && !dinheiroInsuficiente
    : !!singleMetodo) && (!usaFiado || !!clienteFiado) && !tefOffline;

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

  // Leva 15.1 — abre o popup de remoção para um item agrupado da lista
  const abrirRemocao = (item) => {
    setRemocao({ item, qtyMax: item.qty, qtySel: 1, motivo: "" });
    setRemSenha("");
    setRemSenhaErro(false);
    setRemSenhaVis(false);
    setRemErro("");
  };

  const confirmarRemocao = async () => {
    if (!remocao || removendo) return;
    if (!remocao.motivo.trim() || !remSenha.trim()) return;
    setRemovendo(true);
    setRemErro("");
    try {
      const autorizado = await verificarSenhaAdmin(remSenha);
      if (!autorizado) {
        setRemSenhaErro(true);
        return;
      }
      const { error } = await onRemoverItem(
        { name: remocao.item.name, price: remocao.item.price },
        remocao.qtySel,
        remocao.motivo.trim()
      );
      if (error) {
        setRemErro("Não foi possível remover o item. Tente novamente.");
        return;
      }
      // Removeu tudo que estava na lista? Sai do modo de remoção.
      const removeuTudo = itensVisiveis.length === 1 && remocao.qtySel >= remocao.qtyMax;
      if (removeuTudo) setModoRemocao(false);
      setRemocao(null);
    } finally {
      setRemovendo(false);
    }
  };

  const handleConfirm = async () => {
    if (!podeConfirmar || confirmando) return;
    setConfirmando(true);
    setErroConfirmar("");
    const payloadPagamentos = isSplit
      ? pagamentos.map(p => ({
          metodo:   p.metodo,
          valor:    p.valor,
          recebido: p.metodo === "dinheiro" ? (p.recebido || 0) : 0,
          troco:    p.metodo === "dinheiro" ? Math.max(0, (p.recebido || 0) - p.valor) : 0,
        }))
      : [{ metodo: singleMetodo, valor: total, recebido: singleRecebido, troco: Math.max(0, singleTroco) }];
    try {
      // clienteId = vínculo persistido da venda (Financeiro/fiado); cliente =
      // o objeto completo, usado só para puxar o CPF/CNPJ do destinatário da
      // NFC-e automaticamente (destDoCliente). Quando não há cliente, ambos
      // ficam nulos e a nota sai anônima, como antes.
      const resultado = await onConfirm({ pagamentos: payloadPagamentos, total, taxaServico: aplicarTaxa, valorTaxa, ajuste: ajusteAplicado, valorAjuste, clienteId: clienteFiado?.id ?? null, cliente: clienteFiado ?? null });
      if (resultado?.error) {
        setErroConfirmar(resultado.error?.message || "Não foi possível registrar o pagamento. Tente novamente.");
      }
    } catch (err) {
      setErroConfirmar(err?.message || "Não foi possível registrar o pagamento. Tente novamente.");
    } finally {
      // Sucesso navega para fora do checkout (setState pós-desmonte é no-op
      // no React 18); em falha o botão volta a ficar clicável em vez de
      // travar em "Processando..." para sempre.
      setConfirmando(false);
    }
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
      <div className="checkout-view" style={{ background: varColor(C.bg) }}>

        {/* ── Header ── */}
        <div className="checkout-view__header">
          <button
            onClick={onBack}
            disabled={confirmando}
            className="checkout-view__btn-voltar"
            style={{
              background: varColor(C.surface),
              border: `1.5px solid var(${C.border})`,
              color: varColor(C.text),
              cursor: confirmando ? "not-allowed" : "pointer",
              opacity: confirmando ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!confirmando) { e.currentTarget.style.background = varColor(C.accent); e.currentTarget.style.borderColor = varColor(C.accent); e.currentTarget.style.color = "#fff"; } }}
            onMouseLeave={e => { e.currentTarget.style.background = varColor(C.surface); e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.color = varColor(C.text); }}
          >
            <LuArrowLeft size={16} /> Voltar
          </button>

          <div style={{ flex: 1 }}>
            <div className="checkout-view__titulo">Finalizar Comanda</div>
            <div className="checkout-view__subtitulo" style={{ color: varColor(C.muted) }}>
              {fmtComanda(comanda?.comanda)} · {itensVisiveis.reduce((s, i) => s + i.qty, 0)} {itensVisiveis.reduce((s, i) => s + i.qty, 0) === 1 ? "item" : "itens"}
            </div>
          </div>

          {/* Botão Desconto/Acréscimo */}
          <button
            onClick={() => { setShowAjuste(true); setAjusteValor(ajusteAplicado?.valor ?? ""); setAjusteTipo(ajusteAplicado?.tipo ?? "desconto"); setAjusteMode(ajusteAplicado?.mode ?? "percentual"); }}
            className="checkout-view__btn-ajuste"
            style={{
              background: ajusteAplicado ? alfa(ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green), "18") : varColor(C.surface),
              border: `1.5px solid ${ajusteAplicado ? alfa(ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green), "66") : varColor(C.border)}`,
              color: ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green)) : varColor(C.text),
            }}
          >
            <LuPercent size={16} /> {ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo") : "Desconto / Acréscimo"}
          </button>

          {/* Leva 15.1 — remover produto na finalização */}
          {onRemoverItem && itensVisiveis.length > 0 && (
            <button
              onClick={() => setModoRemocao(v => !v)}
              className="checkout-view__btn-remover-item"
              style={{
                background: modoRemocao ? alfa(varColor(C.red), "18") : varColor(C.surface),
                border: `1.5px solid ${modoRemocao ? alfa(varColor(C.red), "66") : varColor(C.border)}`,
                color: modoRemocao ? varColor(C.red) : varColor(C.text),
              }}
            >
              <LuTrash2 size={16} /> {modoRemocao ? "Concluir remoção" : "Remover item"}
            </button>
          )}

          {/* F015 — imprimir comprovante ou pré-nota */}
          <ImpressaoAcoes montarVenda={montarVendaParaImpressao} />
        </div>

        {/* ── Body ── */}
        <div className="checkout-view__body" style={{ flexDirection: isMob ? "column" : "row" }}>

          {/* ── Resumo do pedido ── */}
          <div className="checkout-view__resumo" style={{
            width: isMob ? "100%" : sz.checkoutResumo,
            maxHeight: isMob ? "38%" : undefined,
            borderRight: isMob ? "none" : `1px solid var(${C.border})`,
            borderBottom: isMob ? `1px solid var(${C.border})` : "none",
          }}>
            {/* Área scrollável — itens */}
            <div className="checkout-view__resumo-lista" style={{ padding: isMob ? "16px 20px" : "28px 32px" }}>
            <div className="checkout-view__resumo-titulo" style={{ color: varColor(C.muted) }}>
              Resumo · {fmtComanda(comanda?.comanda)}
            </div>

            {itensVisiveis.map((item, i) => {
              const obsArr = Array.isArray(item.obs) ? item.obs : [];
              const qty = item.qty;
              return (
                <div key={i} className="checkout-view__item" style={{ borderBottom: `1px solid var(${C.border})` }}>
                  <div className="checkout-view__item-icone" style={{
                    background: "var(--gm-alow)", border: `1.5px solid ${alfa(C.accent, "44")}`,
                  }}>
                    {item.emoji
                      ? <span className="checkout-view__item-emoji">{item.emoji}</span>
                      : null}
                    <span className={`checkout-view__item-qtd${item.emoji ? " checkout-view__item-qtd--compacta" : ""}`} style={{ color: varColor(C.accent) }}>×{qty}</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="checkout-view__item-nome">
                      {item.name}
                    </div>
                    <div className="checkout-view__item-preco-unit" style={{ color: varColor(C.muted), marginTop: 4 }}>
                      {qty}× R$ {Number(item.price).toFixed(2)}
                    </div>
                    {obsArr.map((obs, j) => (
                      <div key={j} className="checkout-view__item-obs" style={{
                        color: varColor(C.accent), background: "var(--gm-alow)",
                      }}>
                        📝 {obs}
                      </div>
                    ))}
                  </div>

                  <div className="checkout-view__item-total" style={{ color: varColor(C.text) }}>
                    R$ {(item.price * qty).toFixed(2)}
                  </div>

                  {modoRemocao && (
                    <button
                      onClick={() => abrirRemocao(item)}
                      className="checkout-view__item-remover"
                      style={{
                        background: alfa(varColor(C.red), "14"),
                        border: `1.5px solid ${alfa(varColor(C.red), "55")}`,
                        color: varColor(C.red),
                      }}
                      aria-label={`Remover ${item.name}`}
                    >
                      <LuTrash2 size={18} />
                    </button>
                  )}
                </div>
              );
            })}

            {itensVisiveis.length === 0 && (
              <div className="checkout-view__lista-vazia" style={{ color: varColor(C.muted) }}>
                Todos os itens foram removidos. Volte para a comanda para lançar novos itens.
              </div>
            )}

            {/* Leva 15.1 — botão abaixo do último item da lista */}
            {onRemoverItem && itensVisiveis.length > 0 && (
              <div className="checkout-view__remover-rodape">
                {modoRemocao && (
                  <div className="checkout-view__remover-dica" style={{ color: varColor(C.muted) }}>
                    Toque na lixeira do item que deseja remover
                  </div>
                )}
                <button
                  onClick={() => setModoRemocao(v => !v)}
                  className="checkout-view__btn-remover-lista"
                  style={{
                    background: modoRemocao ? alfa(varColor(C.red), "18") : "transparent",
                    border: `1.5px dashed ${modoRemocao ? alfa(varColor(C.red), "66") : varColor(C.border)}`,
                    color: modoRemocao ? varColor(C.red) : varColor(C.muted),
                  }}
                >
                  <LuTrash2 size={15} /> {modoRemocao ? "Concluir remoção" : "Remover produto"}
                </button>
              </div>
            )}
            </div>{/* fim área scrollável */}

            {/* Rodapé fixo — taxa, desconto, total */}
            <div className="checkout-view__resumo-rodape" style={{ padding: isMob ? "12px 20px 16px" : "16px 32px 24px", borderTop: `1px solid var(${C.border})` }}>

            {/* Taxa de Serviço */}
            {taxaServico && (
              <div className="checkout-view__linha-ajuste">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="checkout-view__taxa-label" style={{ color: varColor(C.muted), fontWeight: 600 }}>Taxa de Serviço (10%)</span>
                  <button
                    onClick={() => setAplicarTaxa(v => !v)}
                    className="checkout-view__btn-toggle-taxa"
                    style={{
                      fontWeight: 700, padding: "3px 10px",
                      borderRadius: 8, border: `1.5px solid ${aplicarTaxa ? alfa(C.red, "88") : alfa(C.green, "88")}`,
                      background: aplicarTaxa ? alfa(C.red, "15") : alfa(C.green, "15"),
                      color: aplicarTaxa ? varColor(C.red) : varColor(C.green),
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {aplicarTaxa ? "Remover" : "Aplicar"}
                  </button>
                </div>
                <span className="checkout-view__taxa-valor" style={{ fontWeight: 700, color: aplicarTaxa ? varColor(C.text) : varColor(C.muted), textDecoration: aplicarTaxa ? "none" : "line-through" }}>
                  R$ {(subtotal * 0.10).toFixed(2)}
                </span>
              </div>
            )}

            {/* Desconto / Acréscimo aplicado */}
            {ajusteAplicado && valorAjuste !== 0 && (
              <div className="checkout-view__linha-ajuste">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="checkout-view__ajuste-aplicado-label" style={{ color: ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green) }}>
                    {ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo"}
                    {" "}({ajusteAplicado.mode === "percentual" ? `${ajusteAplicado.valor}%` : `R$ ${parseFloat(ajusteAplicado.valor).toFixed(2)}`})
                  </span>
                  <button
                    onClick={() => setAjusteAplicado(null)}
                    className="checkout-view__btn-remover-ajuste"
                    style={{
                      fontWeight: 700, padding: "2px 8px",
                      borderRadius: 6, border: `1px solid var(${C.border})`,
                      background: "transparent", color: varColor(C.muted),
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Remover
                  </button>
                </div>
                <span className="checkout-view__ajuste-aplicado-valor" style={{ fontWeight: 700, color: ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green) }}>
                  {valorAjuste < 0 ? "-" : "+"}R$ {Math.abs(valorAjuste).toFixed(2)}
                </span>
              </div>
            )}

            {/* Total */}
            <div className="checkout-view__total-linha" style={{ borderTop: `2px solid var(${C.border})` }}>
              <span className="checkout-view__total-label" style={{ fontWeight: 800, color: varColor(C.muted) }}>Total</span>
              <span className="checkout-view__total-valor" style={{ fontWeight: 900, color: varColor(C.green) }}>
                R$ {total.toFixed(2)}
              </span>
            </div>

            </div>{/* fim rodapé fixo */}
          </div>

          {/* ── Sidebar de pagamento ── */}
          <div className="checkout-view__pagamento" style={{ background: varColor(C.card) }}>
            {/* Header da sidebar */}
            <div className="checkout-view__pagamento-header" style={{ borderBottom: `1px solid var(${C.border})` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div className="checkout-view__pagamento-titulo" style={{ color: varColor(C.muted) }}>
                    Forma de Pagamento
                  </div>
                  <div className="checkout-view__pagamento-subtitulo" style={{ color: varColor(C.muted) }}>
                    {isSplit ? `${pagamentos.length} pagamentos · R$ ${total.toFixed(2)} total` : "Selecione como o cliente vai pagar"}
                  </div>
                </div>
                {isSplit ? (
                  <button
                    onClick={voltarParaUnico}
                    className="checkout-view__btn-pagamento-unico"
                    style={{
                      background: "none", border: `1px solid var(${C.border})`,
                      borderRadius: 8, color: varColor(C.muted), cursor: "pointer",
                      padding: "6px 12px", fontWeight: 600, fontFamily: "inherit",
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
                      border: `1.5px solid ${showDivisor ? alfa(C.accent, "66") : varColor(C.border)}`,
                      color: showDivisor ? varColor(C.accent) : varColor(C.muted),
                    }}
                  >
                    <LuUsers size={14} /> Dividir pagamento
                  </button>
                )}
              </div>

              {/* Stepper inline */}
              {showDivisor && !isSplit && (
                <div className="checkout-view__stepper" style={{
                  background: varColor(C.surface), border: `1.5px solid ${alfa(C.accent, "44")}`,
                }}>
                  <span className="checkout-view__stepper-label" style={{ fontWeight: 600, color: varColor(C.muted), whiteSpace: "nowrap" }}>Dividir entre</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => setNPessoas(n => Math.max(2, n - 1))}
                      className="checkout-view__stepper-btn"
                      style={{
                        border: `1.5px solid var(${C.border})`,
                        background: varColor(C.card), color: varColor(C.text),
                        cursor: nPessoas <= 2 ? "not-allowed" : "pointer", opacity: nPessoas <= 2 ? 0.4 : 1,
                      }}
                    >−</button>
                    <span className="checkout-view__stepper-valor" style={{ fontWeight: 900, color: varColor(C.text), minWidth: 32, textAlign: "center" }}>{nPessoas}</span>
                    <button
                      onClick={() => setNPessoas(n => Math.min(10, n + 1))}
                      className="checkout-view__stepper-btn"
                      style={{
                        border: `1.5px solid var(${C.border})`,
                        background: varColor(C.card), color: varColor(C.text),
                        cursor: nPessoas >= 10 ? "not-allowed" : "pointer", opacity: nPessoas >= 10 ? 0.4 : 1,
                      }}
                    >+</button>
                  </div>
                  <span className="checkout-view__stepper-unidade" style={{ color: varColor(C.muted) }}>pessoas</span>
                  <span className="checkout-view__stepper-estimativa" style={{ color: varColor(C.muted), flex: 1 }}>
                    ≈ R$ {(total / nPessoas).toFixed(2)} cada
                  </span>
                  <button
                    onClick={() => dividirPagamento(nPessoas)}
                    className="checkout-view__btn-dividir"
                    style={{
                      padding: "8px 16px", borderRadius: 8, border: "none",
                      background: varColor(C.accent), color: "#fff", fontWeight: 700,
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
                      background: varColor(C.surface),
                      border: `1.5px solid ${p.metodo ? alfa(C.accent, "44") : varColor(C.border)}`,
                    }}>
                      {/* Linha 1: método + valor + remover */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="checkout-view__split-metodos">
                          {METODOS.map(m => {
                            const indisponivel = metodoIndisponivelOffline(m.id);
                            return (
                              <button
                                key={m.id}
                                onClick={() => updatePagamento(idx, { metodo: m.id })}
                                disabled={indisponivel}
                                className="checkout-view__chip-metodo"
                                style={{
                                  border: `1.5px solid ${p.metodo === m.id ? varColor(C.accent) : varColor(C.border)}`,
                                  background: p.metodo === m.id ? "var(--gm-alow)" : "transparent",
                                  color: p.metodo === m.id ? varColor(C.accent) : varColor(C.muted),
                                  opacity: indisponivel ? 0.4 : 1,
                                  cursor: indisponivel ? "not-allowed" : "pointer",
                                }}
                                title={indisponivel ? "Maquininha (TEF) indisponível sem internet" : undefined}
                              >
                                {m.label}{indisponivel ? " · sem internet" : ""}
                              </button>
                            );
                          })}
                        </div>
                        <div className="checkout-view__split-valor-wrap">
                          <span className="checkout-view__input-prefixo" style={{ color: varColor(C.muted) }}>R$</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={p.valor === 0 ? "" : p.valor}
                            onChange={e => updatePagamento(idx, { valor: parseFloat(e.target.value) || 0 })}
                            className="checkout-view__split-input"
                            style={{
                              border: `1.5px solid var(${C.border})`,
                              background: varColor(C.card), color: varColor(C.text),
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                            onBlur={e => e.currentTarget.style.borderColor = varColor(C.border)}
                          />
                        </div>
                        <button
                          onClick={() => removePagamento(idx)}
                          className="checkout-view__btn-remover-split"
                          style={{ color: varColor(C.muted) }}
                          onMouseEnter={e => e.currentTarget.style.color = varColor(C.red)}
                          onMouseLeave={e => e.currentTarget.style.color = varColor(C.muted)}
                        >
                          <LuX size={16} />
                        </button>
                      </div>

                      {/* Linha 2: dinheiro → recebido + troco */}
                      {p.metodo === "dinheiro" && (
                        <div className="checkout-view__split-recebido">
                          <span className="checkout-view__recebido-label" style={{ color: varColor(C.muted), fontWeight: 600, whiteSpace: "nowrap" }}>Recebido:</span>
                          <div style={{ position: "relative", flex: 1 }}>
                            <span className="checkout-view__input-prefixo" style={{ color: varColor(C.muted) }}>R$</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={p.recebido || ""}
                              onChange={e => updatePagamento(idx, { recebido: parseFloat(e.target.value) || 0 })}
                              placeholder={p.valor.toFixed(2)}
                              className="checkout-view__recebido-input"
                              style={{
                                border: `1.5px solid var(${C.border})`,
                                background: varColor(C.card), color: varColor(C.text),
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                              onBlur={e => e.currentTarget.style.borderColor = varColor(C.border)}
                            />
                          </div>
                          {(p.recebido || 0) > 0 && (
                            <span className="checkout-view__split-troco" style={{
                              fontWeight: 700,
                              color: trocoP >= 0 ? varColor(C.green) : varColor(C.accent),
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
                    border: `1.5px solid ${alfa(faltaAlocar > 0 ? varColor(C.accent) : varColor(C.red), "55")}`,
                  }}>
                    <span className="checkout-view__falta-label" style={{ fontWeight: 700, color: faltaAlocar > 0 ? varColor(C.accent) : varColor(C.red) }}>
                      {faltaAlocar > 0 ? "Falta alocar" : "Valor excede o total"}
                    </span>
                    <span className="checkout-view__falta-valor" style={{ fontWeight: 900, color: faltaAlocar > 0 ? varColor(C.accent) : varColor(C.red) }}>
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
                      border: `1.5px dashed var(${C.border})`,
                      color: varColor(C.muted),
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = varColor(C.accent); e.currentTarget.style.color = varColor(C.accent); }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.color = varColor(C.muted); }}
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
                    const indisponivel = metodoIndisponivelOffline(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => updatePagamento(0, { metodo: m.id, recebido: 0 })}
                        disabled={indisponivel}
                        className="checkout-view__metodo-card"
                        style={{
                          border: `2px solid ${ativo ? varColor(C.accent) : varColor(C.border)}`,
                          background: ativo ? "var(--gm-alow)" : varColor(C.surface),
                          color: ativo ? varColor(C.accent) : varColor(C.text),
                          boxShadow: ativo ? `0 0 0 4px ${alfa(C.accent, "22")}` : "none",
                          opacity: indisponivel ? 0.4 : 1,
                          cursor: indisponivel ? "not-allowed" : "pointer",
                        }}
                        title={indisponivel ? "Maquininha (TEF) indisponível sem internet" : undefined}
                      >
                        <div className="checkout-view__metodo-icone" style={{
                          background: ativo ? alfa(C.accent, "22") : varColor(C.card),
                          border: `1.5px solid ${ativo ? alfa(C.accent, "55") : varColor(C.border)}`,
                        }}>
                          <m.Icon size={24} />
                        </div>
                        {m.label}{indisponivel && (
                          <span className="checkout-view__metodo-offline-nota" style={{ display: "block", fontWeight: 600 }}>sem internet</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {singleMetodo === "dinheiro" && (
                  <div className="checkout-view__troco">
                    <label className="checkout-view__troco-label" style={{ color: varColor(C.muted) }}>
                      Calcular Troco <span className="checkout-view__troco-opcional" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                    </label>
                    <div className="checkout-view__troco-input-wrap">
                      <span className="checkout-view__troco-prefixo" style={{ color: varColor(C.muted) }}>
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
                          border: `1.5px solid var(${C.border})`,
                          background: varColor(C.surface), color: varColor(C.text),
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                        onBlur={e => e.currentTarget.style.borderColor = varColor(C.border)}
                      />
                    </div>

                    {singleRecebido > 0 && (
                      <div className="checkout-view__troco-resultado" style={{
                        background: singleTroco >= 0 ? alfa(C.green, "14") : alfa(C.accent, "14"),
                        border: `1.5px solid ${alfa(singleTroco >= 0 ? varColor(C.green) : varColor(C.accent), "55")}`,
                      }}>
                        <span className="checkout-view__troco-resultado-label" style={{ fontWeight: 700, color: varColor(C.muted) }}>
                          {singleTroco >= 0 ? "Troco" : "Falta"}
                        </span>
                        <span className="checkout-view__troco-resultado-valor" style={{ fontWeight: 900, color: singleTroco >= 0 ? varColor(C.green) : varColor(C.accent) }}>
                          R$ {Math.abs(singleTroco).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="checkout-view__rodape-confirmar" style={{ borderTop: `1px solid var(${C.border})` }}>
              {usaFiado && (
                <div style={{ marginBottom: 4 }}>
                  <div className="checkout-view__label-fiado" style={{ fontWeight: 700, color: varColor(C.muted), marginBottom: 6 }}>
                    Cliente do fiado
                  </div>
                  <ClienteFiadoSelector
                    cliente={clienteFiado}
                    onSelecionar={setClienteFiado}
                    usuario={currentUser?.username}
                  />
                </div>
              )}
              {erroConfirmar && (
                <div className="checkout-view__aviso-confirmar" role="alert" style={{ color: varColor(C.red), fontWeight: 700 }}>
                  {erroConfirmar}
                </div>
              )}
              {!podeConfirmar && (
                <div className="checkout-view__aviso-confirmar" style={{ color: varColor(C.muted) }}>
                  {itensVisiveis.length === 0
                    ? "Todos os itens foram removidos — volte para a comanda"
                    : tefOffline
                    ? "Sem internet: a maquininha (TEF) não funciona. Troque para dinheiro, Pix ou outro método — a venda fica guardada e sobe quando a conexão voltar."
                    : usaFiado && !clienteFiado
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
                  background: podeConfirmar ? varColor(C.green) : varColor(C.faint),
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
          {...fecharAoClicarFora(() => setShowAjuste(false))}
          className="checkout-view__overlay"
        >
          <div className="checkout-view__modal" style={{
            background: varColor(C.card), border: `1px solid var(${C.border})`,
          }}>
            {/* Header */}
            <div className="checkout-view__modal-header" style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid var(${C.border})` }}>
              <div>
                <div className="checkout-view__modal-titulo" style={{ fontWeight: 800, color: "#fff" }}>Desconto / Acréscimo</div>
                <div className="checkout-view__modal-subtitulo" style={{ fontWeight: 700, color: varColor(C.muted), marginTop: 4 }}>Total atual: R$ {baseComTaxa.toFixed(2)}</div>
              </div>
              <button onClick={() => setShowAjuste(false)} className="checkout-view__modal-fechar" style={{ color: varColor(C.muted) }}>
                <LuX size={sz.fontLg} />
              </button>
            </div>

            <div style={{ padding: `${sz.padSm}px ${sz.pad}px ${sz.pad}px`, display: "flex", flexDirection: "column", gap: sz.padSm }}>

              {/* Tipo */}
              <div className="checkout-view__modal-tipo-grid" style={{ gap: sz.gap }}>
                {[
                  { id: "desconto",  label: "Desconto",  sub: "Reduz o valor",   color: varColor(C.red)   },
                  { id: "acrescimo", label: "Acréscimo", sub: "Aumenta o valor", color: varColor(C.green) },
                ].map(t => (
                  <button key={t.id} onClick={() => setAjusteTipo(t.id)} className="checkout-view__modal-tipo-card" style={{
                    padding: `${sz.padSm}px 12px`,
                    border: `2px solid ${ajusteTipo === t.id ? t.color : varColor(C.border)}`,
                    background: ajusteTipo === t.id ? alfa(t.color, "18") : varColor(C.surface),
                  }}>
                    <div className="checkout-view__modal-tipo-nome" style={{ fontWeight: 800, color: ajusteTipo === t.id ? t.color : varColor(C.text) }}>{t.label}</div>
                    <div className="checkout-view__modal-tipo-sub" style={{ color: ajusteTipo === t.id ? alfa(t.color, "bb") : varColor(C.muted), marginTop: 4 }}>{t.sub}</div>
                  </button>
                ))}
              </div>

              {/* Modo */}
              <div className="checkout-view__modal-modo" style={{ background: varColor(C.surface), border: `1px solid var(${C.border})` }}>
                {[{ id: "percentual", label: "Percentual (%)" }, { id: "fixo", label: "Valor Fixo (R$)" }].map(m => (
                  <button key={m.id} onClick={() => { setAjusteMode(m.id); setAjusteValor(""); }} className="checkout-view__modal-modo-btn" style={{
                    padding: `${sz.gap}px 8px`,
                    background: ajusteMode === m.id ? varColor(C.card) : "transparent",
                    color: ajusteMode === m.id ? varColor(C.text) : varColor(C.muted),
                    fontWeight: ajusteMode === m.id ? 700 : 500,
                    boxShadow: ajusteMode === m.id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                  }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div>
                <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {ajusteMode === "percentual" ? "Percentual de " : "Valor de "}{ajusteTipo === "desconto" ? "desconto" : "acréscimo"}
                </div>
                <div className="checkout-view__modal-input-wrap">
                  <span className="checkout-view__modal-input-prefixo" style={{ color: varColor(C.muted) }}>
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
                      border: `2px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text),
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "99")}
                    onBlur={e => e.currentTarget.style.borderColor = varColor(C.border)}
                  />
                </div>
              </div>

              {/* Preview */}
              {parseFloat(ajusteValor) > 0 && (() => {
                const v   = parseFloat(ajusteValor) || 0;
                const val = ajusteMode === "percentual" ? baseComTaxa * (v / 100) : v;
                const novoTotal = Math.max(0, ajusteTipo === "desconto" ? baseComTaxa - val : baseComTaxa + val);
                const cor = ajusteTipo === "desconto" ? varColor(C.red) : varColor(C.green);
                return (
                  <div className="checkout-view__preview" style={{ border: `1.5px solid ${alfa(cor, "55")}`, background: alfa(cor, "0c") }}>
                    <div className="checkout-view__preview-linha" style={{ padding: `${sz.gap}px ${sz.padSm}px`, borderBottom: `1px solid ${alfa(cor, "22")}` }}>
                      <span className="checkout-view__preview-label" style={{ color: varColor(C.muted) }}>Total atual</span>
                      <span className="checkout-view__preview-valor" style={{ fontWeight: 700, color: varColor(C.muted) }}>R$ {baseComTaxa.toFixed(2)}</span>
                    </div>
                    <div className="checkout-view__preview-linha" style={{ padding: `${sz.gap}px ${sz.padSm}px`, borderBottom: `1px solid ${alfa(cor, "22")}` }}>
                      <span className="checkout-view__preview-label" style={{ color: cor, fontWeight: 600 }}>{ajusteTipo === "desconto" ? "− Desconto" : "+ Acréscimo"}</span>
                      <span className="checkout-view__preview-valor" style={{ fontWeight: 700, color: cor }}>{ajusteTipo === "desconto" ? "−" : "+"}R$ {val.toFixed(2)}</span>
                    </div>
                    <div className="checkout-view__preview-linha" style={{ alignItems: "center", padding: `${sz.padSm}px ${sz.padSm}px` }}>
                      <span className="checkout-view__preview-total-label" style={{ fontWeight: 700, color: varColor(C.text) }}>Novo Total</span>
                      <span className="checkout-view__preview-total-valor" style={{ fontWeight: 900, color: cor }}>R$ {novoTotal.toFixed(2)}</span>
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
                      border: `1.5px solid var(${C.border})`, background: "none",
                      color: varColor(C.muted),
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
                    background: parseFloat(ajusteValor) > 0 ? varColor(C.accent) : varColor(C.faint),
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

      {/* ── Popup Remover produto (Leva 15.1) ── */}
      {remocao && createPortal(
        <div
          {...fecharAoClicarFora(() => setRemocao(null), !removendo)}
          className="checkout-view__overlay"
        >
          <div className="checkout-view__modal" style={{
            background: varColor(C.card), border: `1px solid var(${C.border})`,
          }}>
            <div className="checkout-view__modal-header" style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid var(${C.border})` }}>
              <div>
                <div className="checkout-view__modal-titulo" style={{ fontWeight: 800, color: varColor(C.red) }}>Remover produto</div>
                <div className="checkout-view__modal-subtitulo" style={{ fontWeight: 700, color: varColor(C.muted), marginTop: 4 }}>
                  {remocao.item.name} · R$ {Number(remocao.item.price).toFixed(2)}
                </div>
              </div>
              <button onClick={() => { if (!removendo) setRemocao(null); }} className="checkout-view__modal-fechar" style={{ color: varColor(C.muted) }}>
                <LuX size={sz.fontLg} />
              </button>
            </div>

            <div style={{ padding: `${sz.padSm}px ${sz.pad}px ${sz.pad}px`, display: "flex", flexDirection: "column", gap: sz.padSm }}>

              {/* Quantidade (só quando há mais de 1) */}
              {remocao.qtyMax > 1 && (
                <div>
                  <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Quantidade a remover
                  </div>
                  <div className="checkout-view__remocao-stepper">
                    <button
                      onClick={() => setRemocao(r => ({ ...r, qtySel: Math.max(1, r.qtySel - 1) }))}
                      className="checkout-view__stepper-btn"
                      style={{
                        border: `1.5px solid var(${C.border})`,
                        background: varColor(C.surface), color: varColor(C.text),
                        cursor: remocao.qtySel <= 1 ? "not-allowed" : "pointer",
                        opacity: remocao.qtySel <= 1 ? 0.4 : 1,
                      }}
                    ><LuMinus size={16} /></button>
                    <input
                      type="number" min="1" max={remocao.qtyMax}
                      value={remocao.qtySel}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        setRemocao(r => ({ ...r, qtySel: Math.min(r.qtyMax, Math.max(1, isNaN(v) ? 1 : v)) }));
                      }}
                      className="checkout-view__remocao-qty-input"
                      style={{ border: `1.5px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text) }}
                    />
                    <button
                      onClick={() => setRemocao(r => ({ ...r, qtySel: Math.min(r.qtyMax, r.qtySel + 1) }))}
                      className="checkout-view__stepper-btn"
                      style={{
                        border: `1.5px solid var(${C.border})`,
                        background: varColor(C.surface), color: varColor(C.text),
                        cursor: remocao.qtySel >= remocao.qtyMax ? "not-allowed" : "pointer",
                        opacity: remocao.qtySel >= remocao.qtyMax ? 0.4 : 1,
                      }}
                    ><LuPlus size={16} /></button>
                    <span className="checkout-view__remocao-qty-de" style={{ color: varColor(C.muted) }}>de {remocao.qtyMax}</span>
                  </div>
                  {remocao.qtySel >= remocao.qtyMax && (
                    <div className="checkout-view__remocao-aviso" style={{ color: varColor(C.red), fontWeight: 600, marginTop: 6 }}>
                      Todos os itens serão removidos
                    </div>
                  )}
                </div>
              )}

              {/* Motivo (obrigatório) */}
              <div>
                <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Motivo (obrigatório)
                </div>
                <textarea
                  value={remocao.motivo}
                  onChange={e => setRemocao(r => ({ ...r, motivo: e.target.value }))}
                  placeholder="Ex: cliente desistiu, pedido errado..."
                  maxLength={200}
                  rows={2}
                  className="checkout-view__remocao-motivo"
                  style={{ border: `1.5px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text) }}
                />
                <div className="checkout-view__remocao-contador" style={{ color: varColor(C.muted), textAlign: "right", marginTop: 2 }}>
                  {remocao.motivo.length}/200
                </div>
              </div>

              {/* Senha de gerente/admin */}
              <div>
                <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 6 }}>
                  <LuLock size={13} /> Senha de gerente ou admin
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={remSenhaVis ? "text" : "password"}
                    value={remSenha}
                    onChange={e => { setRemSenha(e.target.value); setRemSenhaErro(false); }}
                    placeholder="Digite a senha"
                    className="checkout-view__remocao-senha"
                    style={{
                      border: `1.5px solid ${remSenhaErro ? varColor(C.red) : varColor(C.border)}`,
                      background: varColor(C.surface), color: varColor(C.text),
                    }}
                  />
                  <button
                    onClick={() => setRemSenhaVis(v => !v)}
                    className="checkout-view__remocao-senha-olho"
                    style={{ color: varColor(C.muted) }}
                    aria-label={remSenhaVis ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {remSenhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                  </button>
                </div>
                {remSenhaErro && (
                  <div className="checkout-view__remocao-senha-erro" style={{ color: varColor(C.red), fontWeight: 600, marginTop: 6 }}>
                    Senha incorreta. Apenas admin ou gerente pode cancelar itens.
                  </div>
                )}
              </div>

              {remErro && (
                <div role="alert" className="checkout-view__remocao-erro-geral" style={{ color: varColor(C.red), fontWeight: 700 }}>
                  {remErro}
                </div>
              )}

              {/* Ações */}
              <div className="checkout-view__modal-acoes" style={{ gap: sz.gap, paddingTop: 2 }}>
                <button
                  onClick={() => setRemocao(null)}
                  disabled={removendo}
                  className="checkout-view__modal-btn-remover"
                  style={{
                    flex: 1, padding: `${sz.gap}px`,
                    border: `1.5px solid var(${C.border})`, background: "none",
                    color: varColor(C.muted),
                    cursor: removendo ? "not-allowed" : "pointer",
                  }}
                >
                  Voltar
                </button>
                <button
                  onClick={confirmarRemocao}
                  disabled={!remocao.motivo.trim() || !remSenha.trim() || removendo}
                  className="checkout-view__modal-btn-aplicar"
                  style={{
                    flex: 2, padding: `${sz.gap}px`,
                    background: remocao.motivo.trim() && remSenha.trim() && !removendo ? varColor(C.red) : varColor(C.faint),
                    cursor: remocao.motivo.trim() && remSenha.trim() && !removendo ? "pointer" : "not-allowed",
                    boxShadow: remocao.motivo.trim() && remSenha.trim() && !removendo ? `0 4px 20px ${alfa(varColor(C.red), "44")}` : "none",
                  }}
                >
                  {removendo
                    ? "Removendo..."
                    : remocao.qtyMax > 1 && remocao.qtySel >= remocao.qtyMax
                    ? "Remover tudo"
                    : remocao.qtyMax > 1
                    ? `Remover ${remocao.qtySel}`
                    : "Remover"}
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
