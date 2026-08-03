// @vitest-environment jsdom
import { useState, useMemo } from "react";
import { somar } from "@/lib/dinheiro";
import { centavosParaReais } from "@/lib/dinheiro";
import "./VendaPage.css";

/**
 * Página inicial da venda — lista de itens, total, botão de finalizar.
 * Primeira rodada do laboratório: só deixar a tela em pé, sem funcionalidade.
 * Futura implementação: CRUD de itens, carrinho, pagamento.
 */
function VendaPage() {
  const [itens, setItens] = useState([
    { id: 1, nome: "Água", preco: 500 }, // 5,00
    { id: 2, nome: "Refrigerante", preco: 800 }, // 8,00
  ]);

  const total = useMemo(() => somar(...itens.map((i) => i.preco)), [itens]);

  return (
    <div className="venda__container">
      <header className="venda__header">
        <h1>PDV</h1>
        <p className="venda__status">Conectado · Offline · Pronto</p>
      </header>

      <main className="venda__main">
        <section className="venda__itens">
          <h2>Itens</h2>
          {itens.length === 0 ? (
            <p className="venda__vazio">
              Comece adicionando itens — clique no botão acima.
            </p>
          ) : (
            <ul className="venda__lista">
              {itens.map((item) => (
                <li key={item.id} className="venda__item">
                  <span className="venda__item-nome">{item.nome}</span>
                  <span className="venda__item-preco">
                    R$ {centavosParaReais(item.preco)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="venda__resumo">
          <div className="venda__total">
            <span>Total</span>
            <strong>R$ {centavosParaReais(total)}</strong>
          </div>
        </section>
      </main>

      <footer className="venda__footer">
        <button
          className="venda__btn-primario"
          disabled={itens.length === 0}
          title={
            itens.length === 0 ? "Adicione itens antes de finalizar" : ""
          }
        >
          Finalizar venda
        </button>
      </footer>
    </div>
  );
}

export default VendaPage;
