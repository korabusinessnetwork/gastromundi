import { useState, useMemo } from "react";
import C from "@/constants/colors";
import { LuLock, LuBanknote, LuCreditCard, LuSmartphone, LuZap, LuPencil } from "react-icons/lu";
import { useApp } from "@/context/AppContext";

const METODOS_CATALOG = {
  dinheiro: { label: "Dinheiro", Icon: LuBanknote   },
  credito:  { label: "Crédito",  Icon: LuCreditCard },
  debito:   { label: "Débito",   Icon: LuSmartphone },
  pix:      { label: "Pix",      Icon: LuZap        },
};

function fmtR(v) { return "R$ " + Number(v ?? 0).toFixed(2); }
function parsVal(s) { return Math.max(0, parseFloat(String(s ?? "").replace(",", ".")) || 0); }

function buildSistema(sales, fundoAtual, sessaoAbertaEm, meios) {
  const inicio = sessaoAbertaEm
    ? new Date(sessaoAbertaEm).getTime()
    : new Date(new Date().toDateString()).getTime();
  const hoje = (sales ?? []).filter(s => s && new Date(s.at).getTime() >= inicio);
  const m = {};
  meios.forEach(k => { m[k] = 0; });
  hoje.forEach(v => { if (m[v.metodo] !== undefined) m[v.metodo] += v.total ?? 0; });
  if (m.dinheiro !== undefined) m.dinheiro += fundoAtual;
  return { hoje, m };
}

export default function FechamentoModal({ sales, fundoAtual, sessaoAbertaEm, onConfirm, onClose }) {
  const { meiosPagamento } = useApp();
  const meios = meiosPagamento?.length ? meiosPagamento : Object.keys(METODOS_CATALOG);

  const [salvando,    setSalvando]    = useState(false);
  const [observacao,  setObservacao]  = useState("");

  const { hoje, m: sistema } = useMemo(
    () => buildSistema(sales, fundoAtual, sessaoAbertaEm, meios),
    [sales, fundoAtual, sessaoAbertaEm, meios]
  );

  const totalVendas = hoje.reduce((s, v) => s + (v.total ?? 0), 0);
  const totalSistema = totalVendas + fundoAtual;

  const [conf, setConf] = useState(() => {
    const { m } = buildSistema(sales, fundoAtual, sessaoAbertaEm, meios);
    const r = {};
    meios.forEach(k => { r[k] = m[k].toFixed(2); });
    return r;
  });

  const setMetodo = (k, v) => setConf(prev => ({ ...prev, [k]: v }));

  const totalConferido = meios.reduce((s, k) => s + parsVal(conf[k] ?? "0"), 0);
  const diferencaTotal = totalConferido - totalSistema;

  const handleConfirm = async () => {
    if (salvando) return;
    setSalvando(true);
    const conferidoPorMetodo = {};
    meios.forEach(k => { conferidoPorMetodo[k] = parsVal(conf[k] ?? "0"); });
    await onConfirm({ totalVendas, totalConferido, conferidoPorMetodo, observacao: observacao.trim() || null });
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 400, fontFamily: "'Inter',system-ui,sans-serif", padding: 16,
      }}
    >
      <div style={{
        background: C.card, borderRadius: 20, padding: 28,
        width: "100%", maxWidth: 520, boxSizing: "border-box",
        border: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", gap: 22,
        maxHeight: "92vh", overflowY: "auto",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: `${C.accent}18`, border: `1.5px solid ${C.accent}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <LuLock size={22} color={C.accent} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Fechar Caixa</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
              {hoje.length} venda{hoje.length !== 1 ? "s" : ""} hoje · confira e ajuste os valores se necessário
            </div>
          </div>
        </div>

        {/* Tabela de conferência */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Cabeçalho da tabela */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 90px 106px",
            gap: 8, paddingBottom: 8, marginBottom: 2,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: 1,
          }}>
            <span>Método</span>
            <span style={{ textAlign: "right" }}>Sistema</span>
            <span style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              <LuPencil size={10} /> Conferido
            </span>
          </div>

          {meios.map(metodo => {
            const { Icon, label } = METODOS_CATALOG[metodo] ?? { label: metodo, Icon: LuBanknote };
            const sistemaVal = sistema[metodo] ?? 0;
            const confVal    = parsVal(conf[metodo]);
            const diff       = confVal - sistemaVal;
            const hasDiff    = Math.abs(diff) > 0.004;
            const isPositive = diff >= 0;

            return (
              <div key={metodo} style={{ borderBottom: `1px solid ${C.border}` }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 90px 106px",
                  gap: 8, alignItems: "center", padding: "11px 0",
                }}>
                  {/* Nome do método */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
                      <Icon size={15} color={C.muted} />
                      {label}
                    </div>
                    {metodo === "dinheiro" && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 3, paddingLeft: 23 }}>
                        inclui fundo {fmtR(fundoAtual)}
                      </div>
                    )}
                  </div>

                  {/* Valor sistema (read-only) */}
                  <div style={{ textAlign: "right", fontSize: 14, color: C.muted, fontWeight: 600 }}>
                    {fmtR(sistemaVal)}
                  </div>

                  {/* Input conferido */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={conf[metodo]}
                    onChange={e => setMetodo(metodo, e.target.value)}
                    style={{
                      width: "100%", padding: "8px 10px",
                      borderRadius: 8, textAlign: "right",
                      border: `1.5px solid ${hasDiff ? (isPositive ? C.green : C.red) + "99" : C.border}`,
                      background: hasDiff ? (isPositive ? `${C.green}10` : `${C.red}10`) : C.surface,
                      color: C.text, fontSize: 14, fontWeight: 700,
                      boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                    }}
                  />
                </div>

                {/* Diferença por linha */}
                {hasDiff && (
                  <div style={{
                    textAlign: "right", fontSize: 11, fontWeight: 700, paddingBottom: 6,
                    color: isPositive ? C.green : C.red,
                  }}>
                    {isPositive ? "+" : ""}{fmtR(diff)} {isPositive ? "sobra" : "falta"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Resumo */}
        <div style={{
          background: C.surface, borderRadius: 14,
          border: `1px solid ${C.border}`, padding: 16,
          display: "flex", flexDirection: "column", gap: 9,
        }}>
          <Row label="Total de Vendas (sistema)" value={fmtR(totalVendas)} muted />
          <Row label={`Fundo de Caixa`} value={fmtR(fundoAtual)} muted />
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9, marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Total Esperado em Caixa</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: C.muted }}>{fmtR(totalSistema)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Total Conferido</span>
            <span style={{ fontWeight: 900, fontSize: 17, color: C.green }}>{fmtR(totalConferido)}</span>
          </div>

          {/* Diferença total */}
          <div style={{
            padding: "12px 16px", borderRadius: 10, marginTop: 4,
            background: diferencaTotal >= 0 ? `${C.green}14` : `${C.red}14`,
            border: `1.5px solid ${(diferencaTotal >= 0 ? C.green : C.red)}55`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: C.muted }}>
              {diferencaTotal >= 0 ? "Sobra no Caixa" : "Falta no Caixa"}
            </span>
            <span style={{ fontWeight: 900, fontSize: 18, color: diferencaTotal >= 0 ? C.green : C.red }}>
              {diferencaTotal >= 0 ? "+" : ""}{fmtR(diferencaTotal)}
            </span>
          </div>
        </div>

        {/* Observação */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: 1,
          }}>
            Observação (opcional)
          </div>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            placeholder="Ex: sobra de R$ 10 devolvida ao caixa, cliente X pagou amanhã..."
            maxLength={400}
            rows={3}
            style={{
              width: "100%", padding: "10px 12px",
              borderRadius: 10, border: `1.5px solid ${observacao ? C.accent + "66" : C.border}`,
              background: C.surface, color: C.text,
              fontSize: 13, fontFamily: "inherit", outline: "none",
              resize: "none", lineHeight: 1.5,
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
          />
          {observacao && (
            <div style={{ fontSize: 11, color: C.muted, textAlign: "right" }}>
              {observacao.length}/400
            </div>
          )}
        </div>

        {/* Botões */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: 13, borderRadius: 10,
              border: `1px solid ${C.border}`, background: "none",
              color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={salvando}
            style={{
              flex: 2, padding: 13, borderRadius: 10, border: "none",
              background: salvando ? C.faint : C.accent,
              color: "#fff", cursor: salvando ? "not-allowed" : "pointer",
              fontWeight: 700, fontSize: 15, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              transition: "background 0.2s",
            }}
          >
            {salvando ? "Fechando..." : <><LuLock size={14} />Confirmar Fechamento</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: muted ? C.muted : C.text }}>{value}</span>
    </div>
  );
}
