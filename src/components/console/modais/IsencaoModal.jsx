import { useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuGift } from "react-icons/lu";
import { mensagemDeErroDoConsole, definirIsencao, ISENCAO_MAXIMA_ANOS } from "@/lib/console/console";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// campo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";

/** Hoje no calendário LOCAL, como "YYYY-MM-DD" — nunca via toISOString(), que
 *  converte para UTC e devolve o dia seguinte a partir das 21h no Brasil. */
function hojeIso() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Mesma conta do `c_teto_anos` da RPC, para o campo travar antes do servidor. */
function tetoIso() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear() + ISENCAO_MAXIMA_ANOS}-${mes}-${dia}`;
}

/** "2026-12-31" → "31/12/2026", pela string (date puro não passa por new Date()). */
function dataBr(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Libera um estabelecimento de pagar até uma data (Console).
 *
 * Por que existe: até a 20260918 não havia como dar cortesia. A única escrita de
 * billing era `confirmar_renovacao_assinatura`, e ela RECUSA `p_valor <= 0` de
 * propósito (20260909) — registrar "pagamento de R$ 0" para empurrar o
 * vencimento nunca foi uma opção. Cortesia é a AUSÊNCIA de cobrança, então ela
 * mora num campo próprio (`assinaturas.isento_ate`) e não no histórico de
 * pagamentos, que precisa continuar contando só dinheiro que entrou.
 *
 * Por que é intuitivo (Princípio nº1): uma pergunta só — "até quando ele não
 * paga?" — num seletor de data que já vem travado no passado e no teto de
 * {ISENCAO_MAXIMA_ANOS} anos, então não dá para digitar uma data que o banco vai
 * recusar (prevenção de erro > mensagem de erro). A data escolhida é ecoada por
 * extenso antes de salvar, e o motivo é obrigatório porque quem abrir essa
 * assinatura daqui a seis meses precisa saber por que ela não cobra. Quando já
 * existe cortesia, o mesmo modal oferece encerrá-la — com a confirmação dizendo
 * o que acontece depois: volta a valer o vencimento normal.
 *
 * O front NÃO decide autorização: a RPC `definir_isencao_tenant` revalida o
 * papel no banco (SECURITY DEFINER + is_super_admin()).
 */
export default function IsencaoModal({ linha, onFechar, onDefinido }) {
  const atual = linha?.isentoAte ?? null;
  const [ate, setAte] = useState(atual ?? "");
  const [motivo, setMotivo] = useState(linha?.isencaoMotivo ?? "");
  const [encerrando, setEncerrando] = useState(false);
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const minimo = hojeIso();
  const maximo = tetoIso();

  // Espelha, em português, as recusas da RPC (20260918). Elas continuam valendo
  // no banco — isto aqui é só para a pessoa não descobrir o limite pelo erro.
  let erroCampo = "";
  if (ate && ate < minimo) erroCampo = "A cortesia não pode terminar num dia que já passou.";
  else if (ate && ate > maximo) {
    erroCampo = `O máximo aceito é ${ISENCAO_MAXIMA_ANOS} anos de cortesia (até ${dataBr(maximo)}).`;
  }

  const motivoLimpo = motivo.trim();
  const motivoCurto = !!ate && !erroCampo && motivoLimpo.length < 3;
  const podeSalvar = !!ate && !erroCampo && !motivoCurto && (ate !== atual || motivoLimpo !== (linha?.isencaoMotivo ?? ""));

  const salvar = async (isentoAte, motivoTexto) => {
    if (enviando) return;
    setErroServidor("");
    setEnviando(true);
    const { data, error } = await definirIsencao(linha.tenantId, isentoAte, motivoTexto);
    setEnviando(false);

    if (error) {
      setErroServidor(mensagemDeErroDoConsole(error, "Não foi possível salvar a cortesia."));
      return;
    }
    onDefinido(data);
  };

  // Esc e clique no fundo escuro saem por onde o "X" sai (CONSOLE-UX 24).
  const fundo = useFecharModal(onFechar, enviando);

  // Foco no primeiro campo ao abrir, Tab preso aqui dentro e foco devolvido
  // ao botão que abriu este modal (CONSOLE-UX 25).
  const caixa = useFocoDoModal();

  return createPortal(
    <div className="nem-overlay" {...fundo} role="dialog" aria-modal="true" aria-label="Cortesia do estabelecimento">
      <div className="nem-modal" ref={caixa} tabIndex={-1}>
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuGift size={20} aria-hidden />
            <h2>{atual ? "Cortesia" : "Dar cortesia"}</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <section className="nem-secao">
            <p className="nem-secao__titulo">{linha?.nome}</p>
            <p className="nem-secao__ajuda">
              {atual
                ? `Hoje este estabelecimento está liberado de pagar até ${dataBr(atual)}.`
                : "Enquanto a cortesia valer, ele continua funcionando normalmente mesmo com a mensalidade vencida — e não entra na receita mensal."}
            </p>

            {/* Encerrar é uma escrita diferente (manda `null`), então ela pede
                a própria confirmação: o clique não pode desligar a cortesia de
                um estabelecimento por acidente. */}
            {encerrando ? (
              <p className="nem-secao__ajuda" role="status">
                Ao encerrar, volta a valer o vencimento de sempre — se ele já
                estiver vencido, o estabelecimento entra em atraso na hora.
              </p>
            ) : (
              <>
                <label className="nem-campo">
                  <span className="nem-label">Liberado até (inclusive)</span>
                  <input
                    className={`nem-input${erroCampo ? " nem-input--erro" : ""}`}
                    type="date"
                    value={ate}
                    min={minimo}
                    max={maximo}
                    disabled={enviando}
                    onChange={(e) => setAte(e.target.value)}
                  />
                </label>

                <label className="nem-campo">
                  <span className="nem-label">Por que está sendo liberado</span>
                  <input
                    className={`nem-input${motivoCurto ? " nem-input--erro" : ""}`}
                    type="text"
                    placeholder="Ex.: 3 meses de cortesia combinados na venda"
                    value={motivo}
                    maxLength={200}
                    disabled={enviando}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </label>

                {/* O eco por extenso é o coração da tela: o seletor de data
                    mostra o número, a frase mostra o que ele significa. */}
                {erroCampo ? (
                  <p className="nem-erro-campo" role="alert">{erroCampo}</p>
                ) : motivoCurto ? (
                  <p className="nem-erro-campo" role="alert">
                    Escreva o motivo da cortesia — ele fica gravado na assinatura.
                  </p>
                ) : ate ? (
                  <p className="nem-secao__ajuda">
                    Nada a pagar até {dataBr(ate)}. Depois dessa data, volta a valer o vencimento normal.
                  </p>
                ) : (
                  <p className="nem-secao__ajuda">
                    Escolha o último dia em que ele fica sem pagar.
                  </p>
                )}
              </>
            )}
          </section>

          {erroServidor && (
            <div className="nem-erro-servidor" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> {erroServidor}
            </div>
          )}
        </div>

        <footer className="nem-footer">
          {encerrando ? (
            <>
              <button className="nem-btn nem-btn--secundario" onClick={() => setEncerrando(false)} disabled={enviando}>
                Voltar
              </button>
              <button
                className="nem-btn nem-btn--primario"
                onClick={() => salvar(null, "")}
                disabled={enviando}
              >
                {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Encerrando…</>) : "Encerrar cortesia"}
              </button>
            </>
          ) : (
            <>
              <button
                className="nem-btn nem-btn--secundario"
                onClick={atual ? () => setEncerrando(true) : onFechar}
                disabled={enviando}
              >
                {atual ? "Encerrar cortesia" : "Cancelar"}
              </button>
              <button
                className="nem-btn nem-btn--primario"
                onClick={() => salvar(ate, motivoLimpo)}
                disabled={enviando || !podeSalvar}
              >
                {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Salvando…</>) : (atual ? "Salvar cortesia" : "Dar cortesia")}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
