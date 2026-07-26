/**
 * LancarSheet — bottom sheet para nomear/abrir a comanda, no fluxo de
 * lançamento do /palm (garçom). A estrela é o teclado na tela: o garçom
 * bate o número da comanda com o polegar, sem depender do teclado do
 * celular. Puramente apresentacional: valores e callbacks vêm do shell;
 * o único estado local é qual campo o teclado está editando (comanda x
 * mesa) e, na mesa, se o teclado está em modo número ou ABC.
 *
 * Intuitividade (princípio nº 1):
 * - Comanda e Mesa aparecem como duas "telinhas" idênticas (mesmo estilo
 *   mono, grande); tocar numa delas escolhe qual o teclado edita, com
 *   destaque visível de qual está ativa (previne erro de digitar no campo
 *   errado).
 * - A Mesa ganha um botão 123 ↔ ABC pra alternar o teclado sem sumir com
 *   a telinha: número pra "Mesa 5", letras pra "Varanda"/"Balcão".
 * - O "nome" é um complemento OPCIONAL e separado do número da comanda —
 *   sai impresso na via de produção como referência, sem se misturar com
 *   o número. Rótulo deixa isso claro na tela.
 * - O CTA fica desabilitado (previne erro) até existir um número de
 *   comanda válido, em vez de deixar enviar vazio e só então mostrar erro.
 *
 * `onFechar` é opcional: o passo de nomear a comanda é obrigatório no fluxo
 * (por isso o "*" no rótulo), então por padrão a sheet não oferece saída.
 * Quando o shell passa `onFechar`, um "×" discreto aparece no cabeçalho —
 * útil para desistir do lançamento sem confirmar. Backward compatible.
 */
import { useState } from "react";
import { LuCheck, LuDelete, LuLoaderCircle, LuPause, LuX } from "react-icons/lu";
import "./lancamento.css";

const TECLAS_NUMERICAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// Teclado ABC no estilo do numérico — layout QWERTY, que todo mundo já
// reconhece de qualquer celular. Só usado quando a Mesa está em modo ABC.
const LINHAS_ABC = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

export default function LancarSheet({
  aberto,
  titulo,
  comanda,
  mesa,
  nome,
  onComanda,
  onMesa,
  onNome,
  onConfirmar,
  onEspera,
  onFechar,
  erro,
  salvando,
  textoConfirmar,
  mostrarEspera,
}) {
  const valorComanda = comanda ?? "";
  const valorMesa = mesa ?? "";
  const valorNome = nome ?? "";
  const semValor = valorComanda.trim().length === 0;
  const ctaDesabilitado = salvando || semValor;

  // Qual campo o teclado na tela edita, e — quando é a mesa — se ele está
  // em modo número ou ABC. Estado só de UI: não sobe pro shell.
  const [campoAtivo, setCampoAtivo] = useState("comanda"); // "comanda" | "mesa"
  const [modoMesa, setModoMesa] = useState("num"); // "num" | "abc"

  const editandoComanda = campoAtivo === "comanda";
  const valorAtivo = editandoComanda ? valorComanda : valorMesa;
  const onAtivo = editandoComanda ? onComanda : onMesa;

  function digitar(d) {
    onAtivo(`${valorAtivo}${d}`);
  }

  function apagar() {
    onAtivo(valorAtivo.slice(0, -1));
  }

  function limpar() {
    onAtivo("");
  }

  function ativarMesa(modo) {
    setCampoAtivo("mesa");
    if (modo) setModoMesa(modo);
  }

  // Teclado ABC só faz sentido com a mesa selecionada; a comanda é sempre
  // numérica (é um número de comanda, não um nome).
  const tecladoAbc = !editandoComanda && modoMesa === "abc";

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
              <span className="lancar-sheet__rotulo">Número da Comanda *</span>
              <button
                type="button"
                className={
                  editandoComanda
                    ? "lancar-sheet__display lancar-sheet__display--ativo"
                    : "lancar-sheet__display"
                }
                onClick={() => setCampoAtivo("comanda")}
                aria-pressed={editandoComanda}
                aria-label="Editar número da comanda"
              >
                {valorComanda || (
                  <span className="lancar-sheet__display-placeholder">
                    Toque nos números
                  </span>
                )}
              </button>
            </div>

            <div className="lancar-sheet__campo">
              <div className="lancar-sheet__rotulo-linha">
                <span className="lancar-sheet__rotulo">Mesa (opcional)</span>
                <div
                  className="lancar-sheet__toggle"
                  role="group"
                  aria-label="Teclado da mesa"
                >
                  <button
                    type="button"
                    className={
                      !editandoComanda && modoMesa === "num"
                        ? "lancar-sheet__toggle-opcao lancar-sheet__toggle-opcao--ativa"
                        : "lancar-sheet__toggle-opcao"
                    }
                    onClick={() => ativarMesa("num")}
                    aria-pressed={!editandoComanda && modoMesa === "num"}
                  >
                    123
                  </button>
                  <button
                    type="button"
                    className={
                      !editandoComanda && modoMesa === "abc"
                        ? "lancar-sheet__toggle-opcao lancar-sheet__toggle-opcao--ativa"
                        : "lancar-sheet__toggle-opcao"
                    }
                    onClick={() => ativarMesa("abc")}
                    aria-pressed={!editandoComanda && modoMesa === "abc"}
                  >
                    ABC
                  </button>
                </div>
              </div>
              <button
                type="button"
                className={
                  !editandoComanda
                    ? "lancar-sheet__display lancar-sheet__display--ativo"
                    : "lancar-sheet__display"
                }
                onClick={() => ativarMesa()}
                aria-pressed={!editandoComanda}
                aria-label="Editar mesa"
              >
                {valorMesa || (
                  <span className="lancar-sheet__display-placeholder">
                    Toque para digitar
                  </span>
                )}
              </button>
            </div>
          </div>

          {tecladoAbc ? (
            <div
              className="lancar-sheet__teclado-abc"
              role="group"
              aria-label="Teclado ABC da mesa"
            >
              {LINHAS_ABC.map((linha, i) => (
                <div key={i} className="lancar-sheet__abc-linha">
                  {linha.map((l) => (
                    <button
                      key={l}
                      type="button"
                      className="lancar-sheet__tecla lancar-sheet__tecla--abc"
                      onClick={() => digitar(l)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              ))}
              <div className="lancar-sheet__abc-linha lancar-sheet__abc-linha--acoes">
                <button
                  type="button"
                  className="lancar-sheet__tecla lancar-sheet__tecla--texto"
                  onClick={limpar}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className="lancar-sheet__tecla lancar-sheet__tecla--espaco"
                  onClick={() => digitar(" ")}
                >
                  Espaço
                </button>
                <button
                  type="button"
                  className="lancar-sheet__tecla lancar-sheet__tecla--apagar"
                  onClick={apagar}
                  aria-label="Apagar último caractere"
                >
                  <LuDelete aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="lancar-sheet__teclado"
              role="group"
              aria-label={
                editandoComanda
                  ? "Teclado numérico da comanda"
                  : "Teclado numérico da mesa"
              }
            >
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
          )}

          <div className="lancar-sheet__campo lancar-sheet__campo--nome">
            <label className="lancar-sheet__rotulo" htmlFor="lancar-sheet-nome">
              Nome / complemento (opcional)
            </label>
            <input
              id="lancar-sheet-nome"
              type="text"
              maxLength={40}
              placeholder="Ex: Mesa VIP, João da esquina"
              className="lancar-sheet__input"
              value={valorNome}
              onChange={(e) => onNome(e.target.value)}
            />
            <span className="lancar-sheet__ajuda">
              Sai impresso na comanda como referência. Não substitui o número.
            </span>
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
