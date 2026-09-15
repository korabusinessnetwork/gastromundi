import { useState } from "react";
import { enviarAvaliacaoCliente, LIMITE_TEXTO } from "@/lib/feedback";
import "./AvaliacaoPedido.css";

/**
 * Avaliação do cliente, na tela de confirmação do pedido.
 *
 * Por que aqui e não depois: é o único momento em que o cliente ainda está
 * na página. Não existe conta, e-mail nem push para chamá-lo de volta —
 * ou ele avalia agora, ou não avalia. Num delivery sem salão, essa é a
 * única leitura de qualidade que o estabelecimento consegue ter.
 *
 * O comentário é OPCIONAL de propósito. Obrigar a escrever depois de a
 * comida chegar é o jeito mais rápido de não receber avaliação nenhuma: a
 * nota sozinha já é informação.
 *
 * Escreve anônimo, por RPC (migração 20261010) — a vitrine não tem sessão.
 *
 * LIMITAÇÃO CONHECIDA: a avaliação não fica ligada ao PEDIDO, porque
 * `criar_pedido_delivery` devolve só o número, não o id. A coluna
 * `feedbacks.pedido_id` existe para quando essa ponta for fechada (o
 * caminho natural é avaliar a partir de "Meus pedidos", que tem os ids).
 *
 * Por que é intuitivo (princípio nº 1): cinco estrelas grandes de tocar,
 * a nota escolhida dita por extenso (não só pintada — cor sozinha não é
 * informação), comentário claramente opcional, e um agradecimento que
 * encerra em vez de deixar a pessoa sem saber se foi.
 */

const ROTULOS = ["", "Ruim", "Fraco", "Ok", "Bom", "Ótimo"];

export default function AvaliacaoPedido({ slug }) {
  const [nota, setNota] = useState(0);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  if (enviado) {
    return (
      <div className="avaliacao avaliacao--pronta" role="status">
        <strong>Obrigado pela avaliação!</strong>
        <span>O estabelecimento vai ler.</span>
      </div>
    );
  }

  const enviar = async () => {
    if (nota < 1 || enviando) return;
    setEnviando(true);
    setErro("");
    const { error } = await enviarAvaliacaoCliente({ slug, nota, texto });
    setEnviando(false);
    if (error) {
      setErro("Não deu para enviar agora.");
      return;
    }
    setEnviado(true);
  };

  return (
    <div className="avaliacao">
      <p className="avaliacao__pergunta">Como foi seu pedido?</p>

      <div className="avaliacao__estrelas" role="group" aria-label="Nota de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNota(n)}
            aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"} — ${ROTULOS[n]}`}
            aria-pressed={nota === n}
            className={`avaliacao__estrela${n <= nota ? " avaliacao__estrela--cheia" : ""}`}
          >
            ★
          </button>
        ))}
      </div>

      {/* A nota por extenso: cor e preenchimento sozinhos não são
          informação para quem não distingue bem as duas coisas. */}
      {nota > 0 && <p className="avaliacao__rotulo">{ROTULOS[nota]}</p>}

      {nota > 0 && (
        <>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={LIMITE_TEXTO}
            rows={3}
            placeholder="Quer contar mais? (opcional)"
            aria-label="Comentário, opcional"
            className="avaliacao__texto"
          />
          {erro && <p className="avaliacao__erro">{erro}</p>}
          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="btn btn--principal avaliacao__enviar"
          >
            {enviando ? "Enviando…" : "Enviar avaliação"}
          </button>
        </>
      )}
    </div>
  );
}
