// ──────────────────────────────────────────────────────────────────
// SacolaModal — revisão dos itens antes do checkout. Mostra cada linha
// (com complementos/observação), permite ajustar quantidade ou remover,
// e o subtotal. Bloqueia o avanço abaixo do pedido mínimo (prevenção de
// erro > mensagem de erro).
//
// Também é AQUI que a sacola velha encara o cardápio de agora: as linhas
// chegam já revisadas (revisarSacola), com `situacao` dizendo se o item
// saiu do ar ou mudou de preço. Sem isso o cliente só descobria no último
// clique, por uma recusa do servidor que não diz qual item é.
// ──────────────────────────────────────────────────────────────────
import { formatarPreco, precoLinha } from "@/lib/delivery";
import { useSairDoModal } from "./useSairDoModal";
import "./SacolaModal.css";

export default function SacolaModal({
  itens,
  subtotal,
  pedidoMinimo,
  temFora = false,
  temPrecoNovo = false,
  onFechar,
  onAlterarQtd,
  onRemover,
  onAvancar,
}) {
  // Sair daqui: tocar fora ou apertar Esc. Arrastar para selecionar
  // texto dentro do painel NÃO fecha — era esse o defeito.
  const fundo = useSairDoModal(onFechar);
  const abaixoMinimo = subtotal < (Number(pedidoMinimo) || 0);
  const faltam = (Number(pedidoMinimo) || 0) - subtotal;

  return (
    <div className="modal-fundo" {...fundo}>
      <div className="modal-painel">
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
                const fora = item.situacao === "fora";
                return (
                  <div
                    className={`linha-sacola${fora ? " linha-sacola--fora" : ""}`}
                    key={item._linha}
                  >
                    {/* Cabeça da linha: o que é, e quanto custa. O ícone dá à
                        sacola a mesma cara do cardápio de onde o item veio —
                        uma lista de texto puro não parece a escolha que a
                        pessoa acabou de fazer. */}
                    <div className="linha-sacola__cabeca">
                      <span className="linha-sacola__emoji" aria-hidden="true">
                        {item.emoji || "🍽️"}
                      </span>
                      <div className="linha-sacola__texto">
                        <p className="linha-sacola__nome">{item.nome}</p>
                        {extras && <p className="linha-sacola__extra">{extras}</p>}
                        {item.obs && <p className="linha-sacola__extra">Obs.: {item.obs}</p>}
                        {fora && (
                          <p className="linha-sacola__selo linha-sacola__selo--fora">
                            Saiu do cardápio — remova para continuar
                          </p>
                        )}
                        {item.situacao === "preco" && (
                          <p className="linha-sacola__selo">Preço atualizado pelo estabelecimento</p>
                        )}
                      </div>
                      <span className="linha-sacola__preco">{formatarPreco(precoLinha(item))}</span>
                    </div>

                    {/* Pé da linha: as duas ações, separadas nas pontas. Antes
                        "Remover" ficava logo abaixo do preço, em vermelho, e
                        disputava o olhar com o valor do item. */}
                    <div className="linha-sacola__acoes">
                      {/* Mexer na quantidade de um item que saiu do ar não leva
                          a lugar nenhum. A única saída é "Remover", e ela fica
                          sozinha na linha para não competir com nada. */}
                      {!fora && (
                        <div className="qtd qtd--sacola">
                          {/* Trancado na quantidade 1. Antes o "−" ali
                              apagava o item da sacola sem uma palavra —
                              um toque a mais no botão de diminuir e o
                              produto sumia. Tirar da sacola é destrutivo
                              e agora tem lugar próprio: o "Remover" ao
                              lado (prevenção de erro > mensagem de erro). */}
                          <button
                            className="qtd__botao"
                            onClick={() => onAlterarQtd(item._linha, -1)}
                            disabled={item.qtd <= 1}
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
                      )}
                      <button
                        type="button"
                        onClick={() => onRemover(item._linha)}
                        className="sacola-modal__remover"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="resumo">
                {/* Subtotal, não total: a taxa de entrega entra na tela
                    seguinte. Ele vinha com o peso de TOTAL e parecia o valor
                    final do pedido — quem lia isso levava um susto no
                    pagamento. */}
                <div className="resumo__linha">
                  <span>Subtotal</span>
                  <span className="resumo__valor">{formatarPreco(subtotal)}</span>
                </div>
                <p className="sacola-modal__nota">
                  A taxa de entrega é calculada no passo seguinte, pelo seu endereço.
                </p>
              </div>

              {temFora && (
                <div className="vitrine__aviso vitrine__aviso--erro">
                  Um item da sua sacola saiu do cardápio enquanto você escolhia.
                  Remova o item marcado para seguir com o pedido.
                </div>
              )}

              {temPrecoNovo && (
                <div className="vitrine__aviso">
                  O preço de um item mudou desde que você escolheu. O valor abaixo já
                  é o novo.
                </div>
              )}

              {abaixoMinimo && (
                <div className="vitrine__aviso">
                  Pedido mínimo de {formatarPreco(pedidoMinimo)}. Faltam{" "}
                  {formatarPreco(faltam)} para fechar.
                </div>
              )}

              <button
                className="btn btn--primario sacola-modal__avancar"
                onClick={onAvancar}
                disabled={abaixoMinimo || temFora}
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
