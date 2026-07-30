import { useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuWallet } from "react-icons/lu";
import { definirMensalidade, MENSALIDADE_MAXIMA } from "@/lib/console";
import { valorDigitado } from "@/lib/delivery";
import { formatarReais } from "@/lib/deliveryPedidos";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// campo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";

/**
 * Define quanto a plataforma cobra por mês deste estabelecimento (Console).
 *
 * Por que existe: `assinaturas.valor_mensal` nasce em 0 (20260719/20260908) e
 * até a 20260911 NADA no sistema o escrevia — a própria migration dizia que "o
 * preço é combinado depois, na tela do Console" e essa tela não existia. O
 * resultado é que o cartão "Receita mensal" mostrava R$ 0,00 com clientes
 * pagantes na base, sem nada na tela explicando por quê.
 *
 * Por que é intuitivo (Princípio nº1): uma coisa só na tela. O campo aceita o
 * jeito que o teclado brasileiro digita ("300,00") e ECOA de volta em reais o
 * valor entendido — "Vai ficar R$ 300,00 por mês" — antes de salvar, então
 * ninguém grava 30000 por ter errado a vírgula (prevenção de erro > mensagem de
 * erro). As mesmas recusas da RPC (negativo, acima do teto) aparecem aqui como
 * frase em português, e "Salvar" fica travado enquanto o valor não é válido ou
 * não mudou. "Salvando…" com spinner e botões travados — sem clique duplo.
 *
 * O front NÃO decide autorização: a RPC `definir_mensalidade_tenant` revalida o
 * papel `plataforma` no banco (SECURITY DEFINER + is_super_admin()).
 */
export default function DefinirMensalidadeModal({ linha, onFechar, onDefinido }) {
  const atual = Number(linha?.valorMensal) || 0;
  const [texto, setTexto] = useState(atual > 0 ? String(atual).replace(".", ",") : "");
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const valor = valorDigitado(texto);
  const vazio = !texto.trim();

  // Espelha, em português, as recusas da RPC (20260911). Elas continuam valendo
  // no banco — isto aqui é só para a pessoa não descobrir o limite pelo erro.
  let erroCampo = "";
  if (!vazio && valor === null) erroCampo = "Digite só números, com vírgula nos centavos. Exemplo: 300,00";
  else if (valor !== null && valor < 0) erroCampo = "A mensalidade não pode ser negativa.";
  else if (valor !== null && valor > MENSALIDADE_MAXIMA) {
    erroCampo = `O máximo aceito é ${formatarReais(MENSALIDADE_MAXIMA)} por mês.`;
  }

  const valorOk = !vazio && !erroCampo && valor !== null;
  const semMudanca = valorOk && valor === atual;
  const podeSalvar = valorOk && !semMudanca;

  const submeter = async () => {
    if (enviando || !podeSalvar) return;
    setErroServidor("");
    setEnviando(true);
    const { data, error } = await definirMensalidade(linha.tenantId, valor);
    setEnviando(false);

    if (error) {
      setErroServidor(error.message ?? "Não foi possível salvar a mensalidade.");
      return;
    }
    onDefinido(data);
  };

  return createPortal(
    <div className="nem-overlay" role="dialog" aria-modal="true" aria-label="Definir mensalidade do estabelecimento">
      <div className="nem-modal">
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuWallet size={20} aria-hidden />
            <h2>Definir mensalidade</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <section className="nem-secao">
            <p className="nem-secao__titulo">{linha?.nome}</p>
            <p className="nem-secao__ajuda">
              {atual > 0
                ? `Hoje este estabelecimento paga ${formatarReais(atual)} por mês.`
                : "Este estabelecimento ainda não tem mensalidade definida, então ele não entra na receita mensal da plataforma."}
            </p>

            <label className="nem-campo">
              <span className="nem-label">Mensalidade (R$)</span>
              <input
                className={`nem-input${erroCampo ? " nem-input--erro" : ""}`}
                type="text"
                inputMode="decimal"
                placeholder="300,00"
                value={texto}
                maxLength={12}
                disabled={enviando}
                onChange={(e) => setTexto(e.target.value)}
              />
            </label>

            {/* O eco em reais é o coração da tela: mostra o que o sistema
                ENTENDEU antes de gravar. "300,00" e "300" dão o mesmo valor;
                "30000" salta aos olhos como errado.

                O ramo do `semMudanca` existe porque "Salvar" travado sem nada
                escrito na tela é beco sem saída: quem abre o "—" e digita 0
                aceitando a cortesia via o botão morto e nenhuma explicação.
                Estado sempre visível (Princípio nº1). */}
            {erroCampo ? (
              <p className="nem-erro-campo" role="alert">{erroCampo}</p>
            ) : semMudanca ? (
              <p className="nem-secao__ajuda">
                {atual > 0
                  ? "Já é esse o valor de hoje. Mude o número para salvar."
                  : "Este estabelecimento já está sem mensalidade. Digite um valor para começar a cobrar."}
              </p>
            ) : valorOk ? (
              <p className="nem-secao__ajuda">
                {valor > 0
                  ? `Vai ficar ${formatarReais(valor)} por mês.`
                  : "Vai ficar sem mensalidade (cortesia). Ele continua funcionando, mas não entra na receita mensal."}
              </p>
            ) : (
              <p className="nem-secao__ajuda">
                Pode digitar com vírgula, como você escreveria no papel: 300,00
              </p>
            )}
          </section>

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
            {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Salvando…</>) : "Salvar mensalidade"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
