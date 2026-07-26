/**
 * LancarSheet — bottom sheet para nomear/abrir a comanda, no fluxo de
 * lançamento do /palm (garçom). A estrela é o teclado numérico: o garçom
 * bate o número da comanda com o polegar, sem precisar do teclado do
 * celular. Puramente apresentacional: valores e callbacks vêm do shell.
 *
 * Intuitividade (princípio nº 1): o número da comanda fica sempre visível
 * em destaque (mono, grande) enquanto o garçom digita; o teclado replica
 * o layout de telefone que todo mundo já conhece; o CTA fica desabilitado
 * (previne erro) até existir um número/nome válido, em vez de deixar
 * enviar vazio e só então mostrar erro.
 *
 * `onFechar` é opcional: o passo de nomear a comanda é obrigatório no fluxo
 * (por isso o "*" no rótulo), então por padrão a sheet não oferece saída.
 * Quando o shell passa `onFechar`, um "×" discreto aparece no cabeçalho —
 * útil para desistir do lançamento sem confirmar. Backward compatible.
 */
import { LuCheck, LuDelete, LuLoaderCircle, LuPause, LuX } from "react-icons/lu";
import "./lancamento.css";

const TECLAS_NUMERICAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function LancarSheet({
  aberto,
  titulo,
  comanda,
  mesa,
  onComanda,
  onMesa,
  onConfirmar,
  onEspera,
  onFechar,
  erro,
  salvando,
  textoConfirmar,
  mostrarEspera,
}) {
  const valorComanda = comanda ?? "";
  const semValor = valorComanda.trim().length === 0;
  const ctaDesabilitado = salvando || semValor;

  function digitar(d) {
    onComanda(`${valorComanda}${d}`);
  }

  function apagar() {
    onComanda(valorComanda.slice(0, -1));
  }

  function limpar() {
    onComanda("");
  }

  return (
    <div
      className={aberto ? "lancar-sheet lancar-sheet--aberto" : "lancar-sheet"}
      aria-hidden={!aberto}
    >
      <div className="lancar-sheet__backdrop" aria-hidden="true" />

      <div
        className="lancar-sheet__painel"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <span className="lancar-sheet__puxador" aria-hidden="true" />

        <header className="lancar-sheet__cabecalho">
          <h2 className="lancar-sheet__titulo">{titulo}</h2>
          {onFechar ? (
            <button
              type="button"
              className="lancar-sheet__fechar"
              onClick={onFechar}
              disabled={salvando}
              aria-label="Fechar"
            >
              <LuX aria-hidden="true" />
            </button>
          ) : null}
        </header>

        <div className="lancar-sheet__corpo">
          <div className="lancar-sheet__campos">
            <div className="lancar-sheet__campo">
              <label
                className="lancar-sheet__rotulo"
                htmlFor="lancar-sheet-comanda-display"
              >
                Número da Comanda *
              </label>
              <div
                id="lancar-sheet-comanda-display"
                className="lancar-sheet__display"
                aria-live="polite"
              >
                {valorComanda ? (
                  valorComanda
                ) : (
                  <span className="lancar-sheet__display-placeholder">
                    Toque nos números
                  </span>
                )}
              </div>
            </div>

            <div className="lancar-sheet__campo">
              <label className="lancar-sheet__rotulo" htmlFor="lancar-sheet-mesa">
                Mesa (opcional)
              </label>
              <input
                id="lancar-sheet-mesa"
                type="text"
                inputMode="text"
                maxLength={20}
                placeholder="Ex: 5"
                className="lancar-sheet__input"
                value={mesa ?? ""}
                onChange={(e) => onMesa(e.target.value)}
              />
            </div>
          </div>

          <div className="lancar-sheet__teclado" role="group" aria-label="Teclado numérico da comanda">
            {TECLAS_NUMERICAS.map((d) => (
              <button
                key={d}
                type="button"
                className="lancar-sheet__tecla"
                onClick={() => digitar(d)}
              >
                {d}
              </button>
            ))}

            <button
              type="button"
              className="lancar-sheet__tecla lancar-sheet__tecla--texto"
              onClick={limpar}
            >
              Limpar
            </button>
            <button
              type="button"
              className="lancar-sheet__tecla"
              onClick={() => digitar("0")}
            >
              0
            </button>
            <button
              type="button"
              className="lancar-sheet__tecla lancar-sheet__tecla--apagar"
              onClick={apagar}
              aria-label="Apagar último dígito"
            >
              <LuDelete aria-hidden="true" />
            </button>
          </div>

          <div className="lancar-sheet__campo lancar-sheet__campo--nome">
            <label className="lancar-sheet__rotulo" htmlFor="lancar-sheet-nome">
              Ou digite um nome (ex: Mesa VIP)
            </label>
            <input
              id="lancar-sheet-nome"
              type="text"
              maxLength={40}
              placeholder="Nº ou nome"
              className="lancar-sheet__input"
              value={valorComanda}
              onChange={(e) => onComanda(e.target.value)}
            />
          </div>

          {erro ? (
            <div className="lancar-sheet__erro" role="alert">
              <LuX aria-hidden="true" />
              <span>{erro}</span>
            </div>
          ) : null}

          <button
            type="button"
            className="lancar-sheet__cta"
            onClick={onConfirmar}
            disabled={ctaDesabilitado}
          >
            {salvando ? (
              <>
                <LuLoaderCircle
                  className="lancar-sheet__spinner"
                  aria-hidden="true"
                />
                <span>Enviando…</span>
              </>
            ) : (
              <>
                <LuCheck aria-hidden="true" />
                <span>{textoConfirmar}</span>
              </>
            )}
          </button>

          {mostrarEspera ? (
            <button
              type="button"
              className="lancar-sheet__espera"
              onClick={onEspera}
              disabled={salvando}
            >
              <LuPause aria-hidden="true" />
              <span>Deixar em espera e ir pra próxima</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
