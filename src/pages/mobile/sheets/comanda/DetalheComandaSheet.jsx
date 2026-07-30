import { useEffect, useState } from "react";
import {
  LuUser, LuClock, LuLock, LuPlus, LuX,
  LuTrash2, LuEye, LuEyeOff, LuLoaderCircle, LuTriangleAlert,
} from "react-icons/lu";
import { fmtComanda, fmtDinheiro } from "@/pages/mobile/fmt";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
import "./DetalheComandaSheet.css";

/**
 * DetalheComandaSheet — folha inferior com os itens já lançados de uma
 * comanda. O shell resolve `order` (dados), `travada`/`nomeTrava` (trava de
 * uso) e faz a persistência via `onExcluirItem`; aqui ficam o layout e a
 * confirmação de exclusão.
 *
 * Exclusão de item (sensível → prevenção de erro, Princípio nº 1): cada item
 * lançado tem um botão de lixeira que abre um pop-up pedindo MOTIVO + SENHA de
 * administrador/gerente. Só quem tem a senha autoriza — verificada no servidor
 * (verificarSenhaAdmin), sem derrubar a sessão do garçom. O item não é apagado
 * de fato: fica cancelado (riscado) para a trilha de auditoria, igual ao PDV.
 * Com a comanda travada por outro dispositivo, a lixeira some (não dá pra
 * excluir o que outro está editando).
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

function LinhaItem({ item, podeExcluir, onExcluir }) {
  const { name, qty, price, emoji, launched_at, cancelado, motivoCancelamento } = item;

  return (
    <li
      className={
        cancelado
          ? "detalhe-comanda-sheet__item detalhe-comanda-sheet__item--cancelado"
          : "detalhe-comanda-sheet__item"
      }
    >
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
          {cancelado ? (
            <span className="detalhe-comanda-sheet__item-badge-cancelado">
              Cancelado{motivoCancelamento ? ` · ${motivoCancelamento}` : ""}
            </span>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <span className="detalhe-comanda-sheet__item-preco">
        {fmtDinheiro(price * qty)}
      </span>

      {podeExcluir && !cancelado ? (
        <button
          type="button"
          className="detalhe-comanda-sheet__item-excluir"
          onClick={onExcluir}
          aria-label={`Excluir ${name}`}
        >
          <LuTrash2 aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}

export default function DetalheComandaSheet({
  order,
  visivel,
  onFechar,
  onAdicionar,
  onExcluirItem,
  travada,
  nomeTrava,
}) {
  // Pop-up de exclusão: qual item está em confirmação + os campos do fluxo.
  // `excluindo` guarda o índice (posição em order.items) e o item, para o
  // shell cancelar o item certo mesmo com cancelados intercalados na lista.
  const [excluindo, setExcluindo] = useState(null); // { indice, item } | null
  const [motivo, setMotivo] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVis, setSenhaVis] = useState(false);
  // Texto: "senha errada" e "não deu para verificar agora" são coisas diferentes.
  const [senhaErro, setSenhaErro] = useState("");
  const [verificando, setVerificando] = useState(false);

  // Ao fechar a folha, descarta qualquer confirmação pela metade — abrir
  // outra comanda nunca herda o pop-up nem a senha digitada antes.
  useEffect(() => {
    if (!visivel) {
      setExcluindo(null);
      setMotivo("");
      setSenha("");
      setSenhaVis(false);
      setSenhaErro("");
      setVerificando(false);
    }
  }, [visivel]);

  if (!order) return null;

  const { comanda, mesa, garcom, created_at, total, items = [] } = order;
  const podeExcluir = !travada && typeof onExcluirItem === "function";

  const abrirExcluir = (indice, item) => {
    setExcluindo({ indice, item });
    setMotivo("");
    setSenha("");
    setSenhaVis(false);
    setSenhaErro("");
    setVerificando(false);
  };

  const fecharExcluir = () => {
    if (verificando) return; // não interrompe uma verificação em andamento
    setExcluindo(null);
  };

  const motivoValido = motivo.trim().length > 0;
  const confirmarDesabilitado = verificando || !motivoValido || senha.length === 0;

  const confirmarExclusao = async () => {
    if (!excluindo || confirmarDesabilitado) return;
    setVerificando(true);
    const { ok, erro } = await verificarSenhaAdmin(senha);
    if (!ok) {
      setSenhaErro(erro || "Senha incorreta. Só admin ou gerente pode excluir itens.");
      setVerificando(false);
      return;
    }
    try {
      await onExcluirItem(excluindo.indice, motivo.trim());
    } finally {
      setVerificando(false);
      setExcluindo(null);
    }
  };

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
            <LinhaItem
              key={`${item.name}-${indice}`}
              item={item}
              podeExcluir={podeExcluir}
              onExcluir={() => abrirExcluir(indice, item)}
            />
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

        {excluindo ? (
          <div
            className="detalhe-comanda-sheet__excluir"
            role="dialog"
            aria-modal="true"
            aria-label="Excluir item"
          >
            <button
              type="button"
              className="detalhe-comanda-sheet__excluir-backdrop"
              onClick={fecharExcluir}
              aria-label="Cancelar exclusão"
            />
            <div className="detalhe-comanda-sheet__excluir-card">
              <div className="detalhe-comanda-sheet__excluir-icone" aria-hidden="true">
                <LuTriangleAlert />
              </div>

              <h3 className="detalhe-comanda-sheet__excluir-titulo">Excluir item</h3>
              <p className="detalhe-comanda-sheet__excluir-item">
                {excluindo.item.emoji ? `${excluindo.item.emoji} ` : ""}
                {excluindo.item.qty}× {excluindo.item.name}
              </p>
              <p className="detalhe-comanda-sheet__excluir-ajuda">
                Só administrador ou gerente autoriza. O item fica cancelado na
                comanda (registrado para conferência), não sai da conta por conta própria.
              </p>

              <label className="detalhe-comanda-sheet__excluir-rotulo" htmlFor="excluir-motivo">
                Motivo *
              </label>
              <input
                id="excluir-motivo"
                type="text"
                maxLength={80}
                placeholder="Ex: cliente desistiu, lançado errado"
                className="detalhe-comanda-sheet__excluir-input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                autoComplete="off"
              />

              <label className="detalhe-comanda-sheet__excluir-rotulo" htmlFor="excluir-senha">
                <LuLock aria-hidden="true" /> Senha do administrador / gerente
              </label>
              <div className="detalhe-comanda-sheet__excluir-senha-wrap">
                <input
                  id="excluir-senha"
                  type={senhaVis ? "text" : "password"}
                  placeholder="Digite a senha…"
                  className={
                    senhaErro
                      ? "detalhe-comanda-sheet__excluir-input detalhe-comanda-sheet__excluir-input--erro"
                      : "detalhe-comanda-sheet__excluir-input"
                  }
                  value={senha}
                  onChange={(e) => { setSenha(e.target.value); setSenhaErro(""); }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="detalhe-comanda-sheet__excluir-olho"
                  onClick={() => setSenhaVis((v) => !v)}
                  aria-label={senhaVis ? "Ocultar senha" : "Mostrar senha"}
                >
                  {senhaVis ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
                </button>
              </div>
              {senhaErro ? (
                <p className="detalhe-comanda-sheet__excluir-erro" role="alert">
                  {senhaErro}
                </p>
              ) : null}

              <div className="detalhe-comanda-sheet__excluir-acoes">
                <button
                  type="button"
                  className="detalhe-comanda-sheet__excluir-cancelar"
                  onClick={fecharExcluir}
                  disabled={verificando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="detalhe-comanda-sheet__excluir-confirmar"
                  onClick={confirmarExclusao}
                  disabled={confirmarDesabilitado}
                >
                  {verificando ? (
                    <>
                      <LuLoaderCircle className="detalhe-comanda-sheet__excluir-spinner" aria-hidden="true" />
                      Verificando…
                    </>
                  ) : (
                    <>
                      <LuTrash2 aria-hidden="true" />
                      Excluir item
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
