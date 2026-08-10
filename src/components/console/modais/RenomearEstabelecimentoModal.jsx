import { useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuPencil, LuLock } from "react-icons/lu";
import {
  mensagemDeErroDoConsole,
  renomearEstabelecimento,
  validarNomeEstabelecimento,
  MAX_NOME_TENANT,
} from "@/lib/console/console";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// campo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";

/**
 * Corrige o nome de um estabelecimento já criado (Console).
 *
 * Por que existe: o Console cadastrava e nunca mais consertava. `tenants` é
 * SELECT-only sob RLS (ADR-005/008 §7) e nenhuma RPC escrevia `nome`, então um
 * erro de digitação no cadastro ficava para sempre — na lista, no texto de
 * primeiro acesso mandado ao cliente e em todo relatório da plataforma. O
 * único conserto era um UPDATE cru no SQL Editor.
 *
 * Por que é intuitivo (Princípio nº1): um campo só, já preenchido com o nome
 * de hoje — a pessoa corrige a letra errada em vez de redigitar tudo. O
 * endereço do cardápio aparece logo abaixo, travado e com o motivo escrito em
 * português, para que ninguém procure onde trocá-lo e conclua que o sistema
 * está quebrado. "Salvar" fica desabilitado enquanto o nome não mudou ou não é
 * válido (prevenção de erro > mensagem de erro), e "Salvando…" com spinner e
 * botões travados evita o clique duplo.
 *
 * O front NÃO decide autorização: a RPC `renomear_tenant` (20260919) revalida
 * o papel plataforma no banco (SECURITY DEFINER + is_super_admin()).
 */
export default function RenomearEstabelecimentoModal({ tenant, onFechar, onRenomeado }) {
  const atual = String(tenant?.nome ?? "");
  const [texto, setTexto] = useState(atual);
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const tocado = texto !== atual;
  // Espelha, em português, as recusas da RPC. Elas continuam valendo no banco —
  // isto aqui é só para a pessoa não descobrir o limite pelo erro cru.
  const { ok, erro, nome } = validarNomeEstabelecimento(texto);
  // Enquanto não mexeu no campo, não acusa nada: erro em campo intocado é
  // repreensão por algo que a pessoa nem fez.
  const erroCampo = tocado ? erro : "";
  const semMudanca = ok && nome === atual.trim();
  const podeSalvar = ok && !semMudanca;

  const submeter = async () => {
    if (enviando || !podeSalvar) return;
    setErroServidor("");
    setEnviando(true);
    const { data, error } = await renomearEstabelecimento(tenant.id, nome);
    setEnviando(false);

    if (error) {
      setErroServidor(mensagemDeErroDoConsole(error, "Não foi possível salvar o novo nome."));
      return;
    }
    onRenomeado(data);
  };

  // Esc e clique no fundo escuro saem por onde o "X" sai (CONSOLE-UX 24).
  const fundo = useFecharModal(onFechar, enviando);

  // Foco no primeiro campo ao abrir, Tab preso aqui dentro e foco devolvido
  // ao botão que abriu este modal (CONSOLE-UX 25).
  const caixa = useFocoDoModal();

  return createPortal(
    <div className="nem-overlay" {...fundo} role="dialog" aria-modal="true" aria-label="Renomear estabelecimento">
      <div className="nem-modal" ref={caixa} tabIndex={-1}>
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuPencil size={20} aria-hidden />
            <h2>Renomear estabelecimento</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <section className="nem-secao">
            <p className="nem-secao__ajuda">
              É este nome que aparece na lista do Console, nos relatórios da plataforma e no
              texto de primeiro acesso enviado ao cliente.
            </p>

            <label className="nem-campo">
              <span className="nem-label">Nome do estabelecimento</span>
              <input
                className={`nem-input${erroCampo ? " nem-input--erro" : ""}`}
                type="text"
                placeholder="Bar do Zé"
                value={texto}
                maxLength={MAX_NOME_TENANT}
                disabled={enviando}
                onChange={(e) => setTexto(e.target.value)}
              />
            </label>

            {erroCampo ? (
              <p className="nem-erro-campo" role="alert">{erroCampo}</p>
            ) : semMudanca ? (
              <p className="nem-secao__ajuda">Já é esse o nome de hoje. Mude o texto para salvar.</p>
            ) : (
              <p className="nem-secao__ajuda">Vai passar a se chamar “{nome}”.</p>
            )}
          </section>

          {/* O endereço fica à vista, travado e explicado. Escondê-lo faria a
              pessoa procurar em outra tela; mostrá-lo sem o motivo faria
              parecer defeito. Estado sempre visível (Princípio nº1). */}
          {tenant?.slug && (
            <section className="nem-secao">
              <p className="nem-secao__titulo">
                <LuLock size={14} aria-hidden /> Endereço do cardápio
              </p>
              <p className="nem-secao__ajuda">
                <strong>{tenant.slug}</strong> — o endereço não muda junto com o nome. Ele é o
                link do cardápio já entregue ao cliente, o QR code impresso na mesa e a porta
                de entrada da equipe: trocá-lo derrubaria os três de uma vez.
              </p>
            </section>
          )}

          {erroServidor && (
            <div className="nem-erro-servidor" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> {erroServidor}
            </div>
          )}
        </div>

        <footer className="nem-footer">
          <button className="nem-btn nem-btn--secundario" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button
            className="nem-btn nem-btn--primario"
            onClick={submeter}
            disabled={enviando || !podeSalvar}
          >
            {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Salvando…</>) : "Salvar nome"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
