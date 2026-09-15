import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { LuMessageSquare, LuX, LuCheck } from "react-icons/lu";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { enviarFeedbackEquipe, validarFeedbackEquipe, LIMITE_TEXTO } from "@/lib/feedback";
import "./BotaoFeedback.css";

/**
 * Botão de feedback da EQUIPE — quem opera relata o que quebrou sem sair
 * de onde está.
 *
 * Por que existe: quem vê o problema é quem está no balcão às 20h de
 * sexta, e não havia caminho nenhum entre essa pessoa e o dono. O relato
 * virava mensagem solta no WhatsApp, ou não virava nada.
 *
 * Vai junto a TELA em que a pessoa estava, tirada da rota — é o dado que
 * ela mais esquece de contar e o que mais ajuda quem vai consertar. Sem
 * isso, "não está salvando" chega sem dizer onde.
 *
 * Por que é intuitivo (princípio nº 1): um campo só, rótulo em português
 * do dia a dia, o botão só acende quando dá para enviar, e o sucesso é
 * dito na própria caixa — quem relatou precisa saber que chegou, senão
 * relata de novo.
 */

/** Nome humano da tela, a partir da rota. Rota desconhecida vai crua. */
function nomeDaTela(pathname) {
  const mapa = {
    "/app/pdv": "Frente de Caixa",
    "/app/cozinha": "Cozinha",
    "/app/delivery": "Delivery",
    "/app/produtos": "Produtos",
    "/app/estoque": "Estoque",
    "/app/clientes": "Clientes",
    "/app/financeiro": "Financeiro",
    "/app/relatorios": "Relatórios",
    "/app/caixa": "Caixa",
    "/app/configuracoes": "Configurações",
  };
  return mapa[pathname] ?? pathname ?? "";
}

export default function BotaoFeedback({ usuario }) {
  const location = useLocation();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  const tela = nomeDaTela(location?.pathname);
  const { valido } = validarFeedbackEquipe(texto);
  const bloqueado = enviando || !valido;

  const abrir = () => {
    setTexto("");
    setErro("");
    setEnviado(false);
    setAberto(true);
  };

  const enviar = async () => {
    if (bloqueado) return;
    setEnviando(true);
    setErro("");
    const { error } = await enviarFeedbackEquipe({ texto, tela, autor: usuario });
    setEnviando(false);
    if (error) {
      setErro("Não deu para enviar agora. Tente de novo em instantes.");
      return;
    }
    setEnviado(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="btn-feedback"
        title="Relatar um problema ou dar uma ideia"
      >
        <LuMessageSquare size={14} />
        <span>Reportar algo</span>
      </button>

      {aberto && createPortal(
        <div {...fecharAoClicarFora(() => setAberto(false))} className="feedback__overlay">
          <div className="feedback__modal">
            <div className="feedback__topo">
              <div className="feedback__titulo">
                {enviado ? "Obrigado!" : "O que aconteceu?"}
              </div>
              <button onClick={() => setAberto(false)} className="feedback__fechar" aria-label="Fechar">
                <LuX size={18} />
              </button>
            </div>

            {enviado ? (
              <>
                <div className="feedback__sucesso">
                  <LuCheck size={18} />
                  <span>Seu relato chegou. O dono vê na lista de feedbacks.</span>
                </div>
                <div className="feedback__botoes">
                  <button onClick={() => setAberto(false)} className="feedback__btn-confirmar">Fechar</button>
                </div>
              </>
            ) : (
              <>
                <p className="feedback__ajuda">
                  Conte o problema ou a ideia com suas palavras. Vai junto que você
                  estava em <strong>{tela}</strong> — não precisa explicar isso.
                </p>
                <textarea
                  autoFocus
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={LIMITE_TEXTO}
                  rows={5}
                  placeholder="Ex: a impressora da cozinha não puxa quando o pedido vem do delivery"
                  className="feedback__texto"
                  aria-label="O que aconteceu"
                />
                {erro && <div className="feedback__erro">{erro}</div>}
                <div className="feedback__botoes">
                  <button onClick={() => setAberto(false)} className="feedback__btn-cancelar">Cancelar</button>
                  <button
                    onClick={enviar}
                    disabled={bloqueado}
                    className="feedback__btn-confirmar"
                    style={{ cursor: bloqueado ? "not-allowed" : "pointer" }}
                  >
                    {enviando ? "Enviando…" : "Enviar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
