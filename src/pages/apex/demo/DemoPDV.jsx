import { useEffect, useRef, useState } from "react";
import "./DemoPDV.css";
import {
  PRODUTOS_DEMO,
  CATEGORIAS_DEMO,
  COMANDA_INICIAL,
  TAXA_SERVICO_DEMO,
  formatarBRL,
} from "./demoDados";

/**
 * Frente de Caixa da demo — a tela interativa do protótipo: tocar num
 * produto adiciona à comanda, +/− ajustam, cobrar mostra um sucesso
 * fictício e zera. Tudo useState; nada persiste (é a graça da demo:
 * o visitante VIVE o fluxo de venda em 20 segundos).
 */

const buscarProduto = (id) => PRODUTOS_DEMO.find((p) => p.id === id);

export default function DemoPDV() {
  const [categoria, setCategoria] = useState("Todos");
  const [comanda, setComanda] = useState(COMANDA_INICIAL);
  const [sucesso, setSucesso] = useState(null); // total da venda concluída
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const produtosVisiveis =
    categoria === "Todos"
      ? PRODUTOS_DEMO
      : PRODUTOS_DEMO.filter((p) => p.categoria === categoria);

  const adicionar = (produtoId) => {
    setComanda((itens) => {
      const existente = itens.find((i) => i.produtoId === produtoId);
      if (existente) {
        return itens.map((i) =>
          i.produtoId === produtoId ? { ...i, qtd: i.qtd + 1 } : i
        );
      }
      return [...itens, { produtoId, qtd: 1 }];
    });
  };

  const remover = (produtoId) => {
    setComanda((itens) =>
      itens
        .map((i) => (i.produtoId === produtoId ? { ...i, qtd: i.qtd - 1 } : i))
        .filter((i) => i.qtd > 0)
    );
  };

  const subtotal = comanda.reduce(
    (soma, i) => soma + buscarProduto(i.produtoId).preco * i.qtd,
    0
  );
  const servico = subtotal * TAXA_SERVICO_DEMO;
  const total = subtotal + servico;

  const cobrar = () => {
    if (!comanda.length) return;
    setSucesso(total);
    setComanda([]);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSucesso(null), 2500);
  };

  return (
    <div className="demo-pdv">
      <section className="demo-pdv__produtos" aria-label="Produtos">
        <div className="demo-pdv__categorias">
          {["Todos", ...CATEGORIAS_DEMO].map((cat) => (
            <button
              key={cat}
              type="button"
              className={
                "demo-pdv__chip" + (cat === categoria ? " demo-pdv__chip--ativa" : "")
              }
              aria-pressed={cat === categoria}
              onClick={() => setCategoria(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="demo-pdv__grade">
          {produtosVisiveis.map((p) => (
            <button
              key={p.id}
              type="button"
              className="demo-pdv__produto"
              onClick={() => adicionar(p.id)}
            >
              <span className="demo-pdv__produto-emoji" aria-hidden="true">{p.emoji}</span>
              <span className="demo-pdv__produto-nome">{p.nome}</span>
              <span className="demo-pdv__produto-preco">{formatarBRL(p.preco)}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="demo-pdv__comanda" aria-label="Comanda">
        <div className="demo-pdv__comanda-topo">
          <span className="demo-pdv__mesa">Mesa 12 · Comanda aberta</span>
          <span className="demo-pdv__pessoas">2 pessoas</span>
        </div>

        {sucesso !== null && (
          <div className="demo-pdv__sucesso" role="status">
            ✅ Venda registrada — {formatarBRL(sucesso)}
          </div>
        )}

        {comanda.length === 0 && sucesso === null ? (
          <div className="demo-pdv__vazio">Toque num produto para começar</div>
        ) : (
          <ul className="demo-pdv__itens">
            {comanda.map((item) => {
              const p = buscarProduto(item.produtoId);
              return (
                <li key={item.produtoId} className="demo-pdv__item">
                  <span className="demo-pdv__item-nome">{p.nome}</span>
                  <div className="demo-pdv__item-controles">
                    <button
                      type="button"
                      className="demo-pdv__qtd-botao"
                      aria-label={`Tirar um ${p.nome}`}
                      onClick={() => remover(item.produtoId)}
                    >
                      −
                    </button>
                    <span className="demo-pdv__qtd">{item.qtd}</span>
                    <button
                      type="button"
                      className="demo-pdv__qtd-botao"
                      aria-label={`Adicionar mais um ${p.nome}`}
                      onClick={() => adicionar(item.produtoId)}
                    >
                      +
                    </button>
                  </div>
                  <span className="demo-pdv__item-valor">
                    {formatarBRL(p.preco * item.qtd)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="demo-pdv__fechamento">
          <div className="demo-pdv__linha">
            <span>Subtotal</span>
            <span className="demo-pdv__valor">{formatarBRL(subtotal)}</span>
          </div>
          <div className="demo-pdv__linha">
            <span>Serviço (10%)</span>
            <span className="demo-pdv__valor">{formatarBRL(servico)}</span>
          </div>
          <div className="demo-pdv__linha demo-pdv__linha--total">
            <span>Total</span>
            <span className="demo-pdv__valor-total">{formatarBRL(total)}</span>
          </div>

          <button
            type="button"
            className="demo-pdv__cobrar demo-pdv__cobrar--pix"
            disabled={!comanda.length}
            onClick={cobrar}
          >
            Cobrar com Pix
          </button>
          <button
            type="button"
            className="demo-pdv__cobrar demo-pdv__cobrar--cartao"
            disabled={!comanda.length}
            onClick={cobrar}
          >
            Cartão · NFC-e
          </button>
        </div>
      </aside>
    </div>
  );
}
