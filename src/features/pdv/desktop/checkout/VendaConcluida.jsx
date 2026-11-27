import { LuPrinter, LuCircleCheck, LuCircleAlert } from "react-icons/lu";
import { fmtComanda } from "@/features/comandas/regras/rotuloComanda";
import { formatarReais } from "@/lib/dinheiro";
import "./VendaConcluida.css";

/**
 * Tela de sucesso do checkout, depois que a venda foi gravada. Espelha o
 * "concluído" do Palm: o operador vê que deu certo, pode imprimir o
 * comprovante, e só sai quando toca Concluir. Antes o PDV voltava direto
 * para a grade e o comprovante ficava sem caminho.
 */
export default function VendaConcluida({ venda, statusImpressao, erroImpressao, onImprimir, onConcluir }) {
  const imprimindo = statusImpressao === "imprimindo";
  return (
    <div className="checkout-view checkout-view--concluido">
      <div className="venda-concluida">
        <div className="venda-concluida__icone">
          <LuCircleCheck size={44} />
        </div>
        <div className="venda-concluida__titulo">Pagamento confirmado!</div>
        <div className="venda-concluida__sub">
          {fmtComanda(venda.comanda)} · {formatarReais(Number(venda.total ?? 0))}
        </div>

        <div className="venda-concluida__acoes">
          <button
            type="button"
            onClick={onImprimir}
            disabled={imprimindo}
            className="venda-concluida__btn venda-concluida__btn--imprimir"
          >
            <LuPrinter size={18} /> {imprimindo ? "Imprimindo…" : "Imprimir comprovante"}
          </button>
          <button
            type="button"
            onClick={onConcluir}
            className="venda-concluida__btn venda-concluida__btn--concluir"
          >
            Concluir
          </button>
        </div>

        {statusImpressao === "erro" && (
          <span className="venda-concluida__status venda-concluida__status--erro">
            <LuCircleAlert size={14} /> {erroImpressao}
          </span>
        )}
        {statusImpressao === "sucesso" && (
          <span className="venda-concluida__status venda-concluida__status--sucesso">
            <LuCircleCheck size={14} /> Enviado para impressão
          </span>
        )}
      </div>
    </div>
  );
}
