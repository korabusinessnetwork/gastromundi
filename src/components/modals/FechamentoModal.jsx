import { useState, useMemo } from "react";
import { totalPorMetodo } from "@/utils/pagamentos";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuLock, LuBanknote, LuCreditCard, LuSmartphone, LuZap, LuPencil, LuTriangleAlert } from "react-icons/lu";
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
  const naoMapeados = {};
  meios.forEach(k => { m[k] = 0; });
  hoje.forEach(v => { Object.entries(totalPorMetodo(v)).forEach(([metodo, valor]) => {
    if (m[metodo] !== undefined) {
      m[metodo] += valor;
    } else {
      naoMapeados[metodo] = (naoMapeados[metodo] ?? 0) + valor;
    }
  }); });
  if (m.dinheiro !== undefined) m.dinheiro += fundoAtual;
  return { hoje, m, naoMapeados };
}

export default function FechamentoModal({ sales, fundoAtual, sessaoAbertaEm, onConfirm, onClose }) {
  const { meiosPagamento } = useApp();
  const meios = meiosPagamento?.length ? meiosPagamento : Object.keys(METODOS_CATALOG);

  const [salvando,    setSalvando]    = useState(false);
  const [observacao,  setObservacao]  = useState("");

  const { hoje, m: sistema, naoMapeados } = useMemo(
    () => buildSistema(sales, fundoAtual, sessaoAbertaEm, meios),
    [sales, fundoAtual, sessaoAbertaEm, meios]
  );

  const totalVendas = hoje.reduce((s, v) => s + (v.total ?? 0), 0);

  // M3 — o esperado só pode conter o que é conferível: soma dos métodos em
  // `meios` (fundo já embutido em sistema.dinheiro por buildSistema). Métodos
  // não mapeados aparecem no banner à parte e não podem virar falta fantasma.
  const totalSistema = meios.reduce((s, k) => s + (sistema[k] ?? 0), 0);
  const fundoConferivel = meios.includes("dinheiro") ? fundoAtual : 0;
  const totalVendasConferivel = totalSistema - fundoConferivel;

  const [conf, setConf] = useState(() => {
    const { m } = buildSistema(sales, fundoAtual, sessaoAbertaEm, meios);
    const r = {};
    meios.forEach(k => { r[k] = m[k].toFixed(2); });
    return r;
  });

  const setMetodo = (k, v) => setConf(prev => ({ ...prev, [k]: v }));

  const totalConferido = meios.reduce((s, k) => s + parsVal(conf[k] ?? "0"), 0);
  // B7 — resíduo de ponto flutuante (ex.: -1e-13) não pode rotular um caixa
  // batido como "Falta"; abaixo de meio centavo é considerado zero.
  const diferencaBruta = totalConferido - totalSistema;
  const diferencaTotal = Math.abs(diferencaBruta) < 0.005 ? 0 : diferencaBruta;

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
        background: varColor(C.card), borderRadius: 20, padding: 28,
        width: "100%", maxWidth: 520, boxSizing: "border-box",
        border: `1px solid var(${C.border})`,
        display: "flex", flexDirection: "column", gap: 22,
        maxHeight: "92vh", overflowY: "auto",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <LuLock size={22} color={varColor(C.accent)} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Fechar Caixa</div>
            <div style={{ color: varColor(C.muted), fontSize: 13, marginTop: 2 }}>
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
            borderBottom: `1px solid var(${C.border})`,
            fontSize: 11, fontWeight: 700, color: varColor(C.muted),
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
              <div key={metodo} style={{ borderBottom: `1px solid var(${C.border})` }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 90px 106px",
                  gap: 8, alignItems: "center", padding: "11px 0",
                }}>
                  {/* Nome do método */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
                      <Icon size={15} color={varColor(C.muted)} />
                      {label}
                    </div>
                    {metodo === "dinheiro" && (
                      <div style={{ fontSize: 11, color: varColor(C.muted), marginTop: 3, paddingLeft: 23 }}>
                        inclui fundo {fmtR(fundoAtual)}
                      </div>
                    )}
                  </div>

                  {/* Valor sistema (read-only) */}
                  <div style={{ textAlign: "right", fontSize: 14, color: varColor(C.muted), fontWeight: 600 }}>
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
                      border: `1.5px solid ${hasDiff ? (isPositive ? varColor(C.green) : varColor(C.red)) + "99" : varColor(C.border)}`,
                      background: hasDiff ? (isPositive ? `${alfa(C.green, "10")}` : `${alfa(C.red, "10")}`) : varColor(C.surface),
                      color: varColor(C.text), fontSize: 14, fontWeight: 700,
                      boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                    }}
                  />
                </div>

                {/* Diferença por linha */}
                {hasDiff && (
                  <div style={{
                    textAlign: "right", fontSize: 11, fontWeight: 700, paddingBottom: 6,
                    color: isPositive ? varColor(C.green) : varColor(C.red),
                  }}>
                    {isPositive ? "+" : ""}{fmtR(diff)} {isPositive ? "sobra" : "falta"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Banner de métodos não mapeados */}
        {Object.keys(naoMapeados).length > 0 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 14px", borderRadius: 12,
            background: "#f59e0b14", border: "1.5px solid #f59e0b55",
          }}>
            <LuTriangleAlert size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: "#f59e0b", lineHeight: 1.5 }}>
              <strong>
                R$ {Object.values(naoMapeados).reduce((s, v) => s + v, 0).toFixed(2)} em métodos não configurados:
              </strong>{" "}
              {Object.entries(naoMapeados).map(([metodo, valor], i, arr) =>
                `${metodo} (R$ ${valor.toFixed(2)})${i < arr.length - 1 ? ", " : ""}`
              ).join("")}
            </div>
          </div>
        )}

        {/* Resumo */}
        <div style={{
          background: varColor(C.surface), borderRadius: 14,
          border: `1px solid var(${C.border})`, padding: 16,
          display: "flex", flexDirection: "column", gap: 9,
        }}>
          <Row label="Total de Vendas (conferível)" value={fmtR(totalVendasConferivel)} muted />
          <Row label={`Fundo de Caixa`} value={fmtR(fundoConferivel)} muted />
          <div style={{ borderTop: `1px solid var(${C.border})`, paddingTop: 9, marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Total Esperado em Caixa</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: varColor(C.muted) }}>{fmtR(totalSistema)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Total Conferido</span>
            <span style={{ fontWeight: 900, fontSize: 17, color: varColor(C.green) }}>{fmtR(totalConferido)}</span>
          </div>

          {/* Diferença total */}
          <div style={{
            padding: "12px 16px", borderRadius: 10, marginTop: 4,
            background: diferencaTotal >= 0 ? `${alfa(C.green, "14")}` : `${alfa(C.red, "14")}`,
            border: `1.5px solid ${(diferencaTotal >= 0 ? varColor(C.green) : varColor(C.red))}55`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: varColor(C.muted) }}>
              {diferencaTotal >= 0 ? "Sobra no Caixa" : "Falta no Caixa"}
            </span>
            <span style={{ fontWeight: 900, fontSize: 18, color: diferencaTotal >= 0 ? varColor(C.green) : varColor(C.red) }}>
              {diferencaTotal >= 0 ? "+" : ""}{fmtR(diferencaTotal)}
            </span>
          </div>
        </div>

        {/* Observação */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: varColor(C.muted),
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
              borderRadius: 10, border: `1.5px solid ${observacao ? varColor(C.accent) + "66" : varColor(C.border)}`,
              background: varColor(C.surface), color: varColor(C.text),
              fontSize: 13, fontFamily: "inherit", outline: "none",
              resize: "none", lineHeight: 1.5,
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
          />
          {observacao && (
            <div style={{ fontSize: 11, color: varColor(C.muted), textAlign: "right" }}>
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
              border: `1px solid var(${C.border})`, background: "none",
              color: varColor(C.muted), cursor: "pointer", fontWeight: 600, fontSize: 14,
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
              background: salvando ? varColor(C.faint) : varColor(C.accent),
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
      <span style={{ fontSize: 13, color: varColor(C.muted) }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: muted ? varColor(C.muted) : varColor(C.text) }}>{value}</span>
    </div>
  );
}
