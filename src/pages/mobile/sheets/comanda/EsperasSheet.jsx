import { LuPause, LuLock, LuTrash2, LuSend, LuInbox } from "react-icons/lu";
import { fmtComanda, fmtDinheiro } from "@/pages/mobile/fmt";
import "./EsperasSheet.css";

/**
 * EsperasSheet — bottom sheet com os "pedidos em espera" (comandas
 * represadas pelo garçom para enviar em lote para a cozinha).
 *
 * Puramente apresentacional: o shell já resolve a lista (`esperas`) e o
 * resumo pronto (`resumo`); aqui só existe layout e callbacks de clique.
 * Fecha ao tocar no backdrop — sem "X" extra, pra não duplicar affordance
 * (o toque fora já é o gesto universal de fechar folha inferior).
 */
function LinhaEspera({ espera, onRemover }) {
  const { id, nome, itensTexto, total, erro } = espera;

  return (
    <li
      className={`esperas-sheet__linha${
        erro ? " esperas-sheet__linha--erro" : ""
      }`}
    >
      <div className="esperas-sheet__info">
        <span className="esperas-sheet__nome">{fmtComanda(nome)}</span>
        <span className="esperas-sheet__itens">{itensTexto}</span>
        {erro ? (
          <span className="esperas-sheet__erro">
            <LuLock aria-hidden="true" />
            {erro}
          </span>
        ) : null}
      </div>

      <div className="esperas-sheet__aside">
        <span className="esperas-sheet__total">{fmtDinheiro(total)}</span>
        <button
          type="button"
          className="esperas-sheet__remover"
          onClick={() => onRemover(id)}
          aria-label={`Remover ${fmtComanda(nome)} da fila de espera`}
        >
          <LuTrash2 aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export default function EsperasSheet({
  aberto,
  esperas,
  resumo,
  onFechar,
  onRemover,
  onEnviarTodos,
  enviando,
}) {
  const vazio = !esperas || esperas.length === 0;

  return (
    <div
      className={`esperas-sheet${aberto ? " esperas-sheet--aberto" : ""}`}
      aria-hidden={!aberto}
    >
      <button
        type="button"
        className="esperas-sheet__backdrop"
        onClick={onFechar}
        aria-label="Fechar pedidos em espera"
        tabIndex={aberto ? 0 : -1}
      />

      <div
        className="esperas-sheet__painel"
        role="dialog"
        aria-modal="true"
        aria-label="Pedidos em espera"
      >
        <div className="esperas-sheet__alca" aria-hidden="true" />

        <header className="esperas-sheet__header">
          <h2 className="esperas-sheet__titulo">
            <LuPause aria-hidden="true" />
            Pedidos em espera
          </h2>
          <span className="esperas-sheet__resumo">{resumo}</span>
        </header>

        {vazio ? (
          <div className="esperas-sheet__vazio">
            <LuInbox aria-hidden="true" className="esperas-sheet__vazio-icone" />
            <p className="esperas-sheet__vazio-titulo">
              Nenhum pedido em espera
            </p>
            <p className="esperas-sheet__vazio-dica">
              Pedidos represados para enviar juntos aparecem aqui.
            </p>
          </div>
        ) : (
          <ul className="esperas-sheet__lista">
            {esperas.map((espera) => (
              <LinhaEspera
                key={espera.id}
                espera={espera}
                onRemover={onRemover}
              />
            ))}
          </ul>
        )}

        {vazio ? null : (
          <footer className="esperas-sheet__footer">
            <button
              type="button"
              className="esperas-sheet__enviar"
              onClick={onEnviarTodos}
              disabled={enviando}
              aria-busy={enviando}
            >
              <LuSend aria-hidden="true" />
              {enviando ? "Enviando…" : `Enviar todos (${esperas.length})`}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
