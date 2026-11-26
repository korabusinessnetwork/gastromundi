import { LuX, LuUsers } from "react-icons/lu";
import ClienteFiadoSelector from "../ClienteFiadoSelector";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.
import { valorRecebido } from "./apoio";

// Painel de pagamento: métodos, valores, troco, divisão e o botão de confirmar.
export default function PainelPagamento({ tela }) {
  const {
    pagamentos, showDivisor, setShowDivisor, nPessoas, setNPessoas, confirmando, erroConfirmar, clienteFiado, setClienteFiado, currentUser, METODOS, itensVisiveis, total, isSplit, singleMetodo, singleRecebido, singleTroco, faltaAlocar, usaFiado, metodoIndisponivelOffline, tefOffline, dinheiroInsuficiente, faltaEmDinheiro, podeConfirmar, updatePagamento, removePagamento, addPagamento, dividirPagamento, voltarParaUnico, handleConfirm,
  } = tela;
  return (
    <div className="checkout-view__pagamento">
      {/* Header da sidebar */}
      <div className="checkout-view__pagamento-header">
        <div className="checkout-view__pagamento-topo">
          <div>
            <div className="checkout-view__pagamento-titulo">
              Forma de Pagamento
            </div>
            <div className="checkout-view__pagamento-subtitulo">
              {isSplit ? `${pagamentos.length} pagamentos · R$ ${total.toFixed(2)} total` : "Selecione como o cliente vai pagar"}
            </div>
          </div>
          {isSplit ? (
            <button
              onClick={voltarParaUnico}
              className="checkout-view__btn-pagamento-unico"
            >
              Pagamento único
            </button>
          ) : (
            <button
              onClick={() => setShowDivisor(v => !v)}
              className={`checkout-view__btn-divisor${showDivisor ? " checkout-view__btn-divisor--ativo" : ""}`}
            >
              <LuUsers size={14} /> Dividir pagamento
            </button>
          )}
        </div>

        {/* Stepper inline */}
        {showDivisor && !isSplit && (
          <div className="checkout-view__stepper">
            <span className="checkout-view__stepper-label">Dividir entre</span>
            <div className="checkout-view__stepper-controles">
              <button
                onClick={() => setNPessoas(n => Math.max(2, n - 1))}
                className={`checkout-view__stepper-btn checkout-view__stepper-btn--divisor${nPessoas <= 2 ? " checkout-view__stepper-btn--limite" : ""}`}
              >−</button>
              <span className="checkout-view__stepper-valor">{nPessoas}</span>
              <button
                onClick={() => setNPessoas(n => Math.min(10, n + 1))}
                className={`checkout-view__stepper-btn checkout-view__stepper-btn--divisor${nPessoas >= 10 ? " checkout-view__stepper-btn--limite" : ""}`}
              >+</button>
            </div>
            <span className="checkout-view__stepper-unidade">pessoas</span>
            <span className="checkout-view__stepper-estimativa">
              ≈ R$ {(total / nPessoas).toFixed(2)} cada
            </span>
            <button
              onClick={() => dividirPagamento(nPessoas)}
              className="checkout-view__btn-dividir"
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
              <div key={p.uid} className={`checkout-view__split-item${p.metodo ? " checkout-view__split-item--escolhido" : ""}`}>
                {/* Linha 1: método + valor + remover */}
                <div className="checkout-view__split-linha">
                  <div className="checkout-view__split-metodos">
                    {METODOS.map(m => {
                      const indisponivel = metodoIndisponivelOffline(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => updatePagamento(idx, { metodo: m.id })}
                          disabled={indisponivel}
                          className={`checkout-view__chip-metodo${p.metodo === m.id ? " checkout-view__chip-metodo--ativo" : ""}`}
                          title={indisponivel ? "Maquininha (TEF) indisponível sem internet" : undefined}
                        >
                          {m.label}{indisponivel ? " · sem internet" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <div className="checkout-view__split-valor-wrap">
                    <span className="checkout-view__input-prefixo">R$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={p.valor === 0 ? "" : p.valor}
                      onChange={e => updatePagamento(idx, { valor: parseFloat(e.target.value) || 0 })}
                      className="checkout-view__split-input"
                    />
                  </div>
                  <button
                    onClick={() => removePagamento(idx)}
                    className="checkout-view__btn-remover-split"
                  >
                    <LuX size={16} />
                  </button>
                </div>

                {/* Linha 2: dinheiro → recebido + troco */}
                {p.metodo === "dinheiro" && (
                  <div className="checkout-view__split-recebido">
                    <span className="checkout-view__recebido-label">Recebido:</span>
                    <div className="checkout-view__recebido-campo">
                      <span className="checkout-view__input-prefixo">R$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={p.recebido || ""}
                        onChange={e => updatePagamento(idx, { recebido: valorRecebido(e.target.value) })}
                        placeholder={p.valor.toFixed(2)}
                        className="checkout-view__recebido-input"
                      />
                    </div>
                    {(p.recebido || 0) > 0 && (
                      <span className={`checkout-view__split-troco checkout-view__split-troco--${trocoP >= 0 ? "troco" : "falta"}`}>
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
            <div className={`checkout-view__falta-alocar checkout-view__falta-alocar--${faltaAlocar > 0 ? "falta" : "excede"}`}>
              <span className="checkout-view__falta-label">
                {faltaAlocar > 0 ? "Falta alocar" : "Valor excede o total"}
              </span>
              <span className="checkout-view__falta-valor">
                R$ {Math.abs(faltaAlocar).toFixed(2)}
              </span>
            </div>
          )}

          {/* + Adicionar outro */}
          {pagamentos.length < 10 && (
            <button
              onClick={addPagamento}
              className="checkout-view__btn-adicionar-outro"
            >
              + Adicionar outro
            </button>
          )}
        </div>
      ) : (
        /* ── Modo single: grid original ── */
        <div className="checkout-view__single">
          <div className="checkout-view__metodos-grid" style={{
            "--metodos-colunas": METODOS.length === 1 ? "1fr" : "1fr 1fr",
            "--metodos-linhas": Math.ceil(METODOS.length / 2),
          }}>
            {METODOS.map(m => {
              const ativo = singleMetodo === m.id;
              const indisponivel = metodoIndisponivelOffline(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => updatePagamento(0, { metodo: m.id, recebido: 0 })}
                  disabled={indisponivel}
                  className={`checkout-view__metodo-card${ativo ? " checkout-view__metodo-card--ativo" : ""}`}
                  title={indisponivel ? "Maquininha (TEF) indisponível sem internet" : undefined}
                >
                  <div className="checkout-view__metodo-icone">
                    <m.Icon size={24} />
                  </div>
                  {m.label}{indisponivel && (
                    <span className="checkout-view__metodo-offline-nota">sem internet</span>
                  )}
                </button>
              );
            })}
          </div>

          {singleMetodo === "dinheiro" && (
            <div className="checkout-view__troco">
              <label className="checkout-view__troco-label">
                Calcular Troco <span className="checkout-view__troco-opcional">(opcional)</span>
              </label>
              <div className="checkout-view__troco-input-wrap">
                <span className="checkout-view__troco-prefixo">
                  R$
                </span>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.01"
                  value={singleRecebido || ""}
                  onChange={e => updatePagamento(0, { recebido: valorRecebido(e.target.value) })}
                  placeholder={total.toFixed(2)}
                  className="checkout-view__troco-input"
                />
              </div>

              {singleRecebido > 0 && (
                <div className={`checkout-view__troco-resultado checkout-view__troco-resultado--${singleTroco >= 0 ? "troco" : "falta"}`}>
                  <span className="checkout-view__troco-resultado-label">
                    {singleTroco >= 0 ? "Troco" : "Falta"}
                  </span>
                  <span className="checkout-view__troco-resultado-valor">
                    R$ {Math.abs(singleTroco).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="checkout-view__rodape-confirmar">
        {usaFiado && (
          <div className="checkout-view__fiado">
            <div className="checkout-view__label-fiado">
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
          <div className="checkout-view__aviso-confirmar checkout-view__aviso-confirmar--erro" role="alert">
            {erroConfirmar}
          </div>
        )}
        {!podeConfirmar && (
          <div className="checkout-view__aviso-confirmar">
            {itensVisiveis.length === 0
              ? "Todos os itens foram removidos, volte para a comanda"
              : tefOffline
              ? "Sem internet: a maquininha (TEF) não funciona. Troque para dinheiro, Pix ou outro método, a venda fica guardada e sobe quando a conexão voltar."
              : usaFiado && !clienteFiado
              ? "Busque ou cadastre o cliente do fiado acima"
              : dinheiroInsuficiente
              ? `Faltam R$ ${faltaEmDinheiro.toFixed(2)} em dinheiro, corrija o valor recebido ou divida o pagamento`
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
          className={`checkout-view__btn-confirmar${podeConfirmar ? " checkout-view__btn-confirmar--pode" : ""}`}
        >
          {confirmando ? "Processando..." : "✓ Confirmar Pagamento"}
        </button>
      </div>
    </div>
  );
}
