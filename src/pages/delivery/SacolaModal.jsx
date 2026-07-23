// ──────────────────────────────────────────────────────────────────
// SacolaModal — revisão dos itens antes do checkout. Mostra cada linha
// (com complementos/observação), permite ajustar quantidade ou remover,
// e o subtotal. Bloqueia o avanço abaixo do pedido mínimo (prevenção de
// erro > mensagem de erro).
// ──────────────────────────────────────────────────────────────────
import { formatarPreco, precoLinha } from "@/lib/delivery";
import "./SacolaModal.css";

export default function SacolaModal({
  itens,
  subtotal,
  pedidoMinimo,
  onFechar,
  onAlterarQtd,
  onRemover,
  onAvancar,
}) {
  const abaixoMinimo = subtotal < (Number(pedidoMinimo) || 0);
  const faltam = (Number(pedidoMinimo) || 0) - subtotal;

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <h2 className="modal-titulo">Sua sacola</h2>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="modal-corpo">
          {itens.length === 0 ? (
            <div className="vitrine__estado">
              <div className="vitrine__estado-emoji">🛒</div>
              <p>Sua sacola está vazia. Escolha algo no cardápio!</p>
            </div>
          ) : (
            <>
              {itens.map((item) => {
                const extras = (item.complementosEscolhidos ?? [])
                  .map((c) => c.nome)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <div className="linha-sacola" key={item._linha}>
                    <div className="linha-sacola__texto">
                      <p className="linha-sacola__nome">{item.nome}</p>
                      {extras && <p className="linha-sacola__extra">{extras}</p>}
                      {item.obs && <p className="linha-sacola__extra">Obs.: {item.obs}</p>}
                      <div className="qtd" style={{ marginTop: 6 }}>
                        <button
                          className="qtd__botao"
                          onClick={() => onAlterarQtd(item._linha, -1)}
                          aria-label="Diminuir"
                        >
                          −
                        </button>
                        <span className="qtd__valor">{item.qtd}</span>
                        <button
                          className="qtd__botao"
                          onClick={() => onAlterarQtd(item._linha, +1)}
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="linha-sacola__preco">{formatarPreco(precoLinha(item))}</span>
                      <br />
                      <button
                        onClick={() => onRemover(item._linha)}
                        className="sacola-modal__remover"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--gm-red)",
                          fontWeight: 700,
                          cursor: "pointer",
                          marginTop: 8,
                          padding: 0,
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="resumo">
                <div className="resumo__linha resumo__linha--total">
                  <span>Subtotal</span>
                  <span>{formatarPreco(subtotal)}</span>
                </div>
              </div>

              {abaixoMinimo && (
                <div className="vitrine__aviso">
                  Pedido mínimo de {formatarPreco(pedidoMinimo)}. Faltam{" "}
                  {formatarPreco(faltam)} para fechar.
                </div>
              )}

              <button
                className="btn btn--primario"
                onClick={onAvancar}
                disabled={abaixoMinimo}
                style={{ marginTop: 8 }}
              >
                <span>Ir para a entrega</span>
                <span className="btn__preco">{formatarPreco(subtotal)}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
