import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState, useMemo } from "react";
import { totalPorMetodo, rotuloMetodo } from "@/utils/pagamentos";
import { round2 } from "@/lib/vendas";
import { TOLERANCIA_CENTAVO, situacaoCaixa, ROTULO_SITUACAO } from "@/lib/caixa";
import { movimentosDaSessao, totalPorTipo, ajusteEsperadoDinheiro } from "@/lib/caixaMovimentos";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuLock, LuBanknote, LuCreditCard, LuSmartphone, LuZap, LuPencil, LuTriangleAlert } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import "./FechamentoModal.css";

const METODOS_CATALOG = {
  dinheiro: { label: "Dinheiro", Icon: LuBanknote   },
  credito:  { label: "Crédito",  Icon: LuCreditCard },
  debito:   { label: "Débito",   Icon: LuSmartphone },
  pix:      { label: "Pix",      Icon: LuZap        },
};

function fmtR(v) { return "R$ " + Number(v ?? 0).toFixed(2); }
function parsVal(s) { return Math.max(0, parseFloat(String(s ?? "").replace(",", ".")) || 0); }

/**
 * Início da conferência: a hora em que o caixa foi aberto. Sem sessão
 * registrada — ou com um valor ilegível guardado na config — cai no começo
 * do dia local.
 *
 * O guarda é o ponto: `new Date("qualquer coisa").getTime()` devolve NaN, e
 * toda comparação `>= NaN` é false. Uma abertura ilegível fazia o filtro
 * descartar TODAS as vendas — o modal dizia "0 vendas hoje", gravava
 * totalVendas 0 no fechamento e mostrava o caixa cheio como sobra.
 *
 * @param {string|number|null|undefined} sessaoAbertaEm
 * @param {number} [agora] timestamp de referência (injetável para teste)
 * @returns {number} timestamp em ms
 */
export function inicioSessao(sessaoAbertaEm, agora = Date.now()) {
  const abertura = sessaoAbertaEm == null || sessaoAbertaEm === ""
    ? NaN
    : new Date(sessaoAbertaEm).getTime();
  if (Number.isFinite(abertura)) return abertura;
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);
  return inicioDoDia.getTime();
}

function buildSistema(sales, fundoAtual, sessaoAbertaEm, meios, movimentosCaixa) {
  const inicio = inicioSessao(sessaoAbertaEm);
  // Leva 15.3 — vendas canceladas ficam fora do fechamento
  const hoje = (sales ?? []).filter(s => s && !s.cancelada && new Date(s.at).getTime() >= inicio);
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
  // F005 — só os movimentos desta abertura de caixa. Sem o recorte, a sangria
  // de ontem derrubaria o esperado de hoje.
  const movimentos = movimentosDaSessao(movimentosCaixa, inicio);
  const sangrias    = totalPorTipo(movimentos, "sangria");
  const suprimentos = totalPorTipo(movimentos, "suprimento");
  if (m.dinheiro !== undefined) {
    // esperado = fundo + entradas em dinheiro + suprimentos − sangrias
    // (CAIXA.md). Sem as duas últimas parcelas, todo dinheiro tirado da gaveta
    // por um motivo legítimo aparecia aqui como falta.
    m.dinheiro += fundoAtual + ajusteEsperadoDinheiro(movimentos);
  }
  return { hoje, m, naoMapeados, sangrias, suprimentos };
}

export default function FechamentoModal({ sales, fundoAtual, sessaoAbertaEm, onConfirm, onClose }) {
  const { meiosPagamento, metodosCustom, movimentosCaixa } = useApp();
  const meios = meiosPagamento?.length ? meiosPagamento : Object.keys(METODOS_CATALOG);
  const customLabels = useMemo(
    () => Object.fromEntries((metodosCustom ?? []).map(m => [m.id, m.label])),
    [metodosCustom]
  );

  const [salvando,    setSalvando]    = useState(false);
  const [observacao,  setObservacao]  = useState("");

  const { hoje, m: sistema, naoMapeados, sangrias, suprimentos } = useMemo(
    () => buildSistema(sales, fundoAtual, sessaoAbertaEm, meios, movimentosCaixa),
    [sales, fundoAtual, sessaoAbertaEm, meios, movimentosCaixa]
  );

  const totalVendas = round2(hoje.reduce((s, v) => s + (v.total ?? 0), 0));

  // Método ainda não digitado mostra o valor do sistema. Derivado na hora, e
  // não congelado num `useState`, para acompanhar meio de pagamento que só
  // apareceu depois de o modal abrir (config chega por realtime): com o
  // retrato antigo a linha nova ficava vazia e o total conferido acusava uma
  // falta que não existia. String vazia é escolha do operador e vale zero.
  const [conf, setConf] = useState({});
  const confDe = (k) => conf[k] ?? (sistema[k] ?? 0).toFixed(2);

  const setMetodo = (k, v) => setConf(prev => ({ ...prev, [k]: v }));

  // O esperado em caixa é a soma da coluna "Sistema" — só entra o que tem
  // linha para conferir. Antes era `totalVendas + fundo`, que incluía o valor
  // de método NÃO configurado (fiado, método removido da config): esse valor
  // não tem campo onde ser digitado, então o caixa exato era acusado de falta
  // pelo valor inteiro do método, e a falsa falta ficava gravada no
  // fechamento. round2 em toda ponta: sem ele, 16.10 × 3 dá 48.300000000000004
  // e o caixa conferido no centavo aparecia em vermelho como "Falta R$ 0.00".
  const totalSistema   = round2(meios.reduce((s, k) => s + (sistema[k] ?? 0), 0));
  const totalConferido = round2(meios.reduce((s, k) => s + parsVal(confDe(k)), 0));
  const diferencaTotal = round2(totalConferido - totalSistema);
  const situacao       = situacaoCaixa(diferencaTotal);
  const semDiferenca   = situacao === "conferido";
  const corDiferenca   = situacao === "falta" ? C.red : C.green;
  const totalNaoMapeado = round2(Object.values(naoMapeados).reduce((s, v) => s + v, 0));

  const handleConfirm = async () => {
    if (salvando) return;
    setSalvando(true);
    const conferidoPorMetodo = {};
    meios.forEach(k => { conferidoPorMetodo[k] = parsVal(confDe(k)); });
    try {
      // `totalEsperado` é o que o relatório, a exportação e o Jarvas precisam
      // para não recalcularem `totalVendas + fundo` e ressuscitarem a falsa
      // falta dos métodos sem linha de conferência.
      await onConfirm({
        totalVendas, totalEsperado: totalSistema, totalConferido, conferidoPorMetodo,
        observacao: observacao.trim() || null,
      });
    } finally {
      // Quem chama mantém o modal aberto quando a gravação falha, para o
      // operador saber que NÃO registrou. Sem liberar o botão aqui, o "tente
      // novamente" do aviso era impossível: travava em "Fechando..." de vez.
      setSalvando(false);
    }
  };

  return (
    <div
      {...fecharAoClicarFora(onClose)}
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
            <div className="fechamento-modal__titulo" style={{ fontWeight: 800 }}>Fechar Caixa</div>
            <div className="fechamento-modal__subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
              {hoje.length} venda{hoje.length !== 1 ? "s" : ""} hoje · confira e ajuste os valores se necessário
            </div>
          </div>
        </div>

        {/* Tabela de conferência */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Cabeçalho da tabela */}
          <div className="fechamento-modal__tabela-cabecalho" style={{
            display: "grid", gridTemplateColumns: "1fr 90px 106px",
            gap: 8, paddingBottom: 8, marginBottom: 2,
            borderBottom: `1px solid var(${C.border})`,
            fontWeight: 700, color: varColor(C.muted),
            textTransform: "uppercase", letterSpacing: 1,
          }}>
            <span>Método</span>
            <span style={{ textAlign: "right" }}>Sistema</span>
            <span style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              <LuPencil size={10} /> Conferido
            </span>
          </div>

          {meios.map(metodo => {
            const { Icon, label } = METODOS_CATALOG[metodo] ?? { label: rotuloMetodo(metodo, customLabels), Icon: LuBanknote };
            const sistemaVal = sistema[metodo] ?? 0;
            const confVal    = parsVal(confDe(metodo));
            const diff       = round2(confVal - sistemaVal);
            const hasDiff    = Math.abs(diff) > TOLERANCIA_CENTAVO;
            const isPositive = diff >= 0;

            return (
              <div key={metodo} style={{ borderBottom: `1px solid var(${C.border})` }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 90px 106px",
                  gap: 8, alignItems: "center", padding: "11px 0",
                }}>
                  {/* Nome do método */}
                  <div>
                    <div className="fechamento-modal__metodo-nome" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                      <Icon size={15} color={varColor(C.muted)} />
                      {label}
                    </div>
                    {metodo === "dinheiro" && (
                      <div className="fechamento-modal__fundo-nota" style={{ color: varColor(C.muted), marginTop: 3, paddingLeft: 23 }}>
                        inclui fundo {fmtR(fundoAtual)}
                        {/* Sem dizer aqui de onde veio o desconto, o operador
                            só via um esperado menor e não sabia por quê. */}
                        {sangrias    > 0 && <> · − retiradas {fmtR(sangrias)}</>}
                        {suprimentos > 0 && <> · + reforços {fmtR(suprimentos)}</>}
                      </div>
                    )}
                  </div>

                  {/* Valor sistema (read-only) */}
                  <div className="fechamento-modal__valor-sistema" style={{ textAlign: "right", color: varColor(C.muted), fontWeight: 600 }}>
                    {fmtR(sistemaVal)}
                  </div>

                  {/* Input conferido */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={confDe(metodo)}
                    onChange={e => setMetodo(metodo, e.target.value)}
                    className="fechamento-modal__input-conferido"
                    style={{
                      width: "100%", padding: "8px 10px",
                      borderRadius: 8, textAlign: "right",
                      border: `1.5px solid ${hasDiff ? alfa(isPositive ? C.green : C.red, "99") : "var(--gm-input-border)"}`,
                      background: hasDiff ? (isPositive ? `${alfa(C.green, "10")}` : `${alfa(C.red, "10")}`) : "var(--gm-input-bg)",
                      color: varColor(C.text), fontWeight: 700,
                      boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                    }}
                  />
                </div>

                {/* Diferença por linha */}
                {hasDiff && (
                  <div className="fechamento-modal__diferenca-linha" style={{
                    textAlign: "right", fontWeight: 700, paddingBottom: 6,
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
            <div className="fechamento-modal__banner-texto" style={{ color: "#f59e0b" }}>
              <strong>
                R$ {totalNaoMapeado.toFixed(2)} em métodos não configurados:
              </strong>{" "}
              {Object.entries(naoMapeados).map(([metodo, valor], i, arr) =>
                `${rotuloMetodo(metodo, customLabels)} (R$ ${valor.toFixed(2)})${i < arr.length - 1 ? ", " : ""}`
              ).join("")}
              {/* Sem esta frase o operador via o aviso e não entendia por que a
                  diferença não fechava — agora fica claro que o valor está
                  fora da conferência, e o que fazer para trazê-lo para dentro. */}
              <div style={{ marginTop: 4 }}>
                Fica fora da conferência do caixa. Ative o método em Configurações para conferi-lo aqui.
              </div>
            </div>
          </div>
        )}

        {/* Resumo */}
        <div style={{
          background: varColor(C.surface), borderRadius: 14,
          border: `1px solid var(${C.border})`, padding: 16,
          display: "flex", flexDirection: "column", gap: 9,
        }}>
          <Row label="Total de Vendas (sistema)" value={fmtR(totalVendas)} muted />
          <Row label={`Fundo de Caixa`} value={fmtR(fundoAtual)} muted />
          {/* F005 — as duas parcelas do meio da fórmula do CAIXA.md só
              aparecem quando existem, para não poluir o caixa que não
              movimentou nada. */}
          {suprimentos > 0 && <Row label="Reforços de troco (entrou)" value={`+ ${fmtR(suprimentos)}`} muted />}
          {sangrias    > 0 && <Row label="Retiradas do caixa (saiu)"  value={`− ${fmtR(sangrias)}`}    muted />}
          <div style={{ borderTop: `1px solid var(${C.border})`, paddingTop: 9, marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="fechamento-modal__total-esperado-label" style={{ fontWeight: 700 }}>Total Esperado em Caixa</span>
            <span className="fechamento-modal__total-esperado-valor" style={{ fontWeight: 800, color: varColor(C.muted) }}>{fmtR(totalSistema)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="fechamento-modal__total-conferido-label" style={{ fontWeight: 800 }}>Total Conferido</span>
            <span className="fechamento-modal__total-conferido-valor" style={{ fontWeight: 900, color: varColor(C.green) }}>{fmtR(totalConferido)}</span>
          </div>

          {/* Diferença total */}
          <div style={{
            padding: "12px 16px", borderRadius: 10, marginTop: 4,
            background: `${alfa(corDiferenca, "14")}`,
            border: `1.5px solid ${alfa(corDiferenca, "55")}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span className="fechamento-modal__diferenca-label" style={{ fontWeight: 600, color: varColor(C.muted) }}>
              {ROTULO_SITUACAO[situacao]}
            </span>
            <span className="fechamento-modal__diferenca-valor" style={{ fontWeight: 900, color: varColor(corDiferenca) }}>
              {situacao === "sobra" ? "+" : ""}{fmtR(diferencaTotal)}
            </span>
          </div>
        </div>

        {/* Observação */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="fechamento-modal__obs-label" style={{
            fontWeight: 700, color: varColor(C.muted),
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
            className="fechamento-modal__obs-textarea"
            style={{
              width: "100%", padding: "10px 12px",
              borderRadius: 10, border: `1.5px solid ${observacao ? alfa(C.accent, "66") : "var(--gm-input-border)"}`,
              background: "var(--gm-input-bg)", color: varColor(C.text),
              fontFamily: "inherit", outline: "none",
              resize: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
          />
          {observacao && (
            <div className="fechamento-modal__obs-contador" style={{ color: varColor(C.muted), textAlign: "right" }}>
              {observacao.length}/400
            </div>
          )}
        </div>

        {/* Botões */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            className="fechamento-modal__btn-cancelar"
            style={{
              flex: 1, padding: 13, borderRadius: 10,
              border: `1px solid var(${C.border})`, background: "none",
              color: varColor(C.muted), cursor: "pointer", fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={salvando}
            className="fechamento-modal__btn-confirmar"
            style={{
              flex: 2, padding: 13, borderRadius: 10, border: "none",
              background: salvando ? varColor(C.faint) : varColor(C.accent),
              color: "#fff", cursor: salvando ? "not-allowed" : "pointer",
              fontWeight: 700, fontFamily: "inherit",
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
      <span className="fechamento-modal__row-label" style={{ color: varColor(C.muted) }}>{label}</span>
      <span className="fechamento-modal__row-valor" style={{ fontWeight: 600, color: muted ? varColor(C.muted) : varColor(C.text) }}>{value}</span>
    </div>
  );
}
