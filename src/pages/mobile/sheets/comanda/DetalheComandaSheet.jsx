import { LuUser, LuClock, LuLock, LuPlus, LuX } from "react-icons/lu";
import { fmtComanda, fmtDinheiro } from "@/pages/mobile/fmt";
import "./DetalheComandaSheet.css";

/**
 * DetalheComandaSheet — folha inferior com os itens já lançados de uma
 * comanda. Puramente apresentacional: o shell resolve `order` (dados) e
 * `travada`/`nomeTrava` (trava de uso); aqui só existe layout e callbacks.
 *
 * Fica sempre montado pelo shell — anima entrando/saindo conforme
 * `visivel`, sem desmontar no meio da transição de saída.
 */

/** Formatação leve "DD/MM às HH:MM" a partir de um ISO string; se o parse
 * falhar, devolve a string original sem tentar adivinhar o formato. */
function formatDataHora(iso) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return String(iso);

  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const hora = String(data.getHours()).padStart(2, "0");
  const min = String(data.getMinutes()).padStart(2, "0");
  return `${dia}/${mes} às ${hora}:${min}`;
}

function formatHora(iso) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return String(iso);

  const hora = String(data.getHours()).padStart(2, "0");
  const min = String(data.getMinutes()).padStart(2, "0");
  return `${hora}:${min}`;
}

function LinhaItem({ item }) {
  const { name, qty, price, emoji, launched_at } = item;

  return (
    <li className="detalhe-comanda-sheet__item">
      <div className="detalhe-comanda-sheet__item-qtd">
        <span className="detalhe-comanda-sheet__item-qtd-num">{qty}</span>
        <span className="detalhe-comanda-sheet__item-qtd-un">un</span>
      </div>

      <div className="detalhe-comanda-sheet__item-info">
        <span className="detalhe-comanda-sheet__item-nome">
          {emoji ? `${emoji} ` : ""}
          {name}
        </span>
        <div className="detalhe-comanda-sheet__item-sub">
          {launched_at ? (
            <span className="detalhe-comanda-sheet__item-hora">
              <LuClock aria-hidden="true" />
              {formatHora(launched_at)}
            </span>
          ) : null}
          {qty > 1 ? (
            <span className="detalhe-comanda-sheet__item-unitario">
              {qty}× {fmtDinheiro(price)}
            </span>
          ) : null}
        </div>
      </div>

      <span className="detalhe-comanda-sheet__item-preco">
        {fmtDinheiro(price * qty)}
      </span>
    </li>
  );
}

export default function DetalheComandaSheet({
  order,
  visivel,
  onFechar,
  onAdicionar,
  travada,
  nomeTrava,
}) {
  if (!order) return null;

  const { comanda, mesa, garcom, created_at, total, items = [] } = order;

  return (
    <div
      className={`detalhe-comanda-sheet${
        visivel ? " detalhe-comanda-sheet--visivel" : ""
      }`}
      aria-hidden={!visivel}
    >
      <button
        type="button"
        className="detalhe-comanda-sheet__backdrop"
        onClick={onFechar}
        aria-label="Fechar detalhe da comanda"
        tabIndex={visivel ? 0 : -1}
      />

      <div
        className="detalhe-comanda-sheet__painel"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhe de ${fmtComanda(comanda)}`}
      >
        <div className="detalhe-comanda-sheet__alca" aria-hidden="true" />

        <header className="detalhe-comanda-sheet__header">
          <div className="detalhe-comanda-sheet__header-texto">
            <h2 className="detalhe-comanda-sheet__numero">
              {fmtComanda(comanda)}
            </h2>
            <div className="detalhe-comanda-sheet__meta">
              {mesa ? (
                <span className="detalhe-comanda-sheet__meta-item">
                  Mesa {mesa}
                </span>
              ) : null}
              {garcom ? (
                <span className="detalhe-comanda-sheet__meta-item">
                  <LuUser aria-hidden="true" />
                  {garcom}
                </span>
              ) : null}
              {created_at ? (
                <span className="detalhe-comanda-sheet__meta-item detalhe-comanda-sheet__meta-item--hora">
                  <LuClock aria-hidden="true" />
                  {formatDataHora(created_at)}
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className="detalhe-comanda-sheet__fechar"
            onClick={onFechar}
            aria-label="Fechar"
          >
            <LuX aria-hidden="true" />
          </button>
        </header>

        {travada ? (
          <div className="detalhe-comanda-sheet__trava">
            <LuLock aria-hidden="true" />
            Em uso por {nomeTrava}
          </div>
        ) : null}

        <ul className="detalhe-comanda-sheet__lista">
          {items.map((item, indice) => (
            <LinhaItem key={`${item.name}-${indice}`} item={item} />
          ))}
        </ul>

        <footer className="detalhe-comanda-sheet__footer">
          <div className="detalhe-comanda-sheet__total">
            <span className="detalhe-comanda-sheet__total-rotulo">Total</span>
            <span className="detalhe-comanda-sheet__total-valor">
              {fmtDinheiro(total)}
            </span>
          </div>

          {travada ? (
            <button
              type="button"
              className="detalhe-comanda-sheet__adicionar detalhe-comanda-sheet__adicionar--travado"
              disabled
            >
              <LuLock aria-hidden="true" />
              Em uso
            </button>
          ) : (
            <button
              type="button"
              className="detalhe-comanda-sheet__adicionar"
              onClick={onAdicionar}
            >
              <LuPlus aria-hidden="true" />
              Adicionar itens
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
