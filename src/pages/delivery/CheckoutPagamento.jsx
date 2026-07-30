// ──────────────────────────────────────────────────────────────────
// CheckoutPagamento — forma de pagamento NA ENTREGA (sem gateway):
// dinheiro (com "troco para quanto"), pix, cartão (levar maquininha).
// Mostra o total (subtotal + taxa) e o troco calculado só para exibir —
// o servidor revalida tudo ao gravar o pedido.
// ──────────────────────────────────────────────────────────────────
import { calcularTroco, formatarPreco, valorDigitado } from "@/lib/delivery";

const FORMAS = [
  { id: "dinheiro", nome: "Dinheiro", emoji: "💵" },
  { id: "pix", nome: "Pix na entrega", emoji: "📱" },
  { id: "cartao", nome: "Cartão na entrega", emoji: "💳" },
];

export default function CheckoutPagamento({
  dados,
  subtotal,
  taxa,
  onMudar,
  onVoltar,
  onConfirmar,
  enviando,
  erro,
}) {
  const total = (Number(subtotal) || 0) + (Number(taxa) || 0);
  const troco = calcularTroco(dados.trocoPara, total);
  const trocoDigitado = valorDigitado(dados.trocoPara);
  const trocoParaInvalido =
    dados.forma === "dinheiro" && trocoDigitado > 0 && trocoDigitado < total;

  const podeConfirmar = !!dados.forma && !trocoParaInvalido && !enviando;

  return (
    <div className="modal-fundo" onClick={onVoltar}>
      <div className="modal-painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <h2 className="modal-titulo">Pagamento</h2>
          <button className="modal-fechar" onClick={onVoltar} aria-label="Voltar">
            ×
          </button>
        </div>

        <div className="modal-corpo">
          <p className="linha-sacola__extra" style={{ marginBottom: 16 }}>
            O pagamento é na entrega. Escolha como quer pagar pro entregador.
          </p>

          {/* Botão de verdade, não <div onClick>. Como div, a forma de
              pagamento não recebia foco nem tecla: quem navega por teclado ou
              leitor de tela tabulava do × direto para o "Confirmar pedido"
              desabilitado, sem NENHUM jeito de escolher como pagar. O checkout
              inteiro ficava impossível — e a única saída era desistir. */}
          {FORMAS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`forma${dados.forma === f.id ? " forma--ativa" : ""}`}
              onClick={() => onMudar({ forma: f.id })}
              aria-pressed={dados.forma === f.id}
            >
              <span className="forma__emoji" aria-hidden="true">{f.emoji}</span>
              <span className="forma__nome">{f.nome}</span>
            </button>
          ))}

          {dados.forma === "dinheiro" && (
            <div className="campo" style={{ marginTop: 12 }}>
              <label className="campo__label" htmlFor="troco">
                Precisa de troco para quanto? (opcional)
              </label>
              <input
                id="troco"
                className="campo__input"
                inputMode="decimal"
                value={dados.trocoPara}
                onChange={(e) =>
                  onMudar({ trocoPara: e.target.value.replace(/[^\d.,]/g, "") })
                }
                placeholder="Ex.: 50"
              />
              {trocoParaInvalido && (
                <p className="linha-sacola__extra" style={{ color: "var(--gm-red)", marginTop: 6 }}>
                  O valor precisa ser maior que o total ({formatarPreco(total)}).
                </p>
              )}
              {troco > 0 && (
                <p className="linha-sacola__extra" style={{ marginTop: 6 }}>
                  Troco a levar: <strong>{formatarPreco(troco)}</strong>
                </p>
              )}
            </div>
          )}

          {dados.forma === "cartao" && (
            <button
              type="button"
              className="forma forma--toggle"
              onClick={() => onMudar({ levarMaquininha: !dados.levarMaquininha })}
              aria-pressed={!!dados.levarMaquininha}
            >
              <span
                className={`opcao__marca${dados.levarMaquininha ? " opcao__marca--marcada" : ""}`}
              >
                {dados.levarMaquininha ? "✓" : ""}
              </span>
              <span className="forma__nome">Levar a maquininha de cartão</span>
            </button>
          )}

          <div className="resumo">
            <div className="resumo__linha">
              <span>Subtotal</span>
              <span>{formatarPreco(subtotal)}</span>
            </div>
            <div className="resumo__linha">
              <span>Taxa de entrega</span>
              <span>{Number(taxa) > 0 ? formatarPreco(taxa) : "Grátis"}</span>
            </div>
            <div className="resumo__linha resumo__linha--total">
              <span>Total</span>
              <span>{formatarPreco(total)}</span>
            </div>
          </div>

          {/* Falha no envio aparece AQUI, dentro da folha de pagamento. Na
              página ela ficava atrás do modal (position:fixed) — o cliente
              clicava em confirmar e não via absolutamente nada acontecer. */}
          {erro && (
            <div className="vitrine__aviso vitrine__aviso--erro" role="alert">
              {erro}
            </div>
          )}

          <button
            className="btn btn--primario"
            onClick={onConfirmar}
            disabled={!podeConfirmar}
          >
            <span>{enviando ? "Enviando pedido…" : "Confirmar pedido"}</span>
            <span className="btn__preco">{formatarPreco(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
