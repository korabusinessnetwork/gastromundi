import { useState } from "react";
import { LuPrinter, LuCircleCheck, LuCircleAlert } from "react-icons/lu";
import { enviarViaProducao } from "@/lib/impressao/despacho";
import "./BotaoReimprimirVia.css";

/**
 * Reimpressão manual da via de produção (comanda da cozinha) de uma
 * comanda aberta no PDV.
 *
 * A via pode se perder na correria, a impressora da cozinha pode ter
 * ficado sem papel no lançamento, ou a bancada simplesmente precisa de
 * outra cópia. Em vez de relançar itens (o que duplicaria o pedido),
 * o operador reimprime a via da comanda como está — mesmo caminho de
 * `enviarViaProducao` usado no lançamento, então o roteamento por ponto
 * de impressão e o formato são idênticos.
 *
 * Fire-and-forget: `enviarViaProducao` busca a config (nunca lança, cai
 * no cache/local offline) e devolve { error } sem lançar. O status
 * (imprimindo/erro/sucesso) fica visível ao lado do botão sem travar a
 * comanda.
 */
export default function BotaoReimprimirVia({ pedido }) {
  const [status, setStatus] = useState(null); // null | "imprimindo" | "erro" | "sucesso"
  const [mensagemErro, setMensagemErro] = useState("");

  const reimprimir = async () => {
    if (status === "imprimindo" || !pedido) return;
    setStatus("imprimindo");
    setMensagemErro("");
    const { error } = await enviarViaProducao(pedido);
    if (error) {
      setMensagemErro(error.message ?? "Não foi possível imprimir agora.");
      setStatus("erro");
      return;
    }
    setStatus("sucesso");
    setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
  };

  return (
    <span className="reimprimir-via">
      <button
        type="button"
        className="reimprimir-via__botao"
        onClick={reimprimir}
        disabled={status === "imprimindo"}
        title="Reimprimir via de produção (comanda da cozinha)"
      >
        <LuPrinter size={15} />
        {status === "imprimindo" ? "Imprimindo…" : "Reimprimir comanda"}
      </button>
      {status === "erro" && (
        <span className="reimprimir-via__status reimprimir-via__status--erro">
          <LuCircleAlert size={13} /> {mensagemErro}
        </span>
      )}
      {status === "sucesso" && (
        <span className="reimprimir-via__status reimprimir-via__status--sucesso">
          <LuCircleCheck size={13} /> Enviado para a cozinha
        </span>
      )}
    </span>
  );
}
