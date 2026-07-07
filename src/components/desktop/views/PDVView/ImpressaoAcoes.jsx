import { useState } from "react";
import { LuPrinter, LuReceipt, LuCircleCheck, LuCircleAlert } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { montarComprovantePagamento, montarCupomPreNota, buscarConfigImpressao } from "@/lib/impressao";
import { imprimirDocumento } from "@/lib/impressao/drivers";
import "./ImpressaoAcoes.css";

/**
 * Ações de impressão do checkout — F015. Dois templates lado a lado,
 * sempre visíveis (nada escondido em menu — princípio nº 1):
 * "Comprovante" (recibo de pagamento) e "Pré-nota" (cupom não fiscal,
 * base para o futuro add-on fiscal, F019). Estados de carregando/erro/
 * sucesso ficam visíveis ao lado dos botões, sem travar o checkout.
 *
 * `montarVenda()` é fornecido pelo `CheckoutView` — ele já sabe montar
 * o formato de venda a partir do estado local do carrinho/pagamento;
 * este componente só cuida de buscar a config de impressão, montar o
 * template certo e abrir a janela de impressão.
 */
export default function ImpressaoAcoes({ montarVenda }) {
  const { tenant } = useApp();
  const [status, setStatus] = useState(null); // null | "imprimindo" | "erro" | "sucesso"
  const [mensagemErro, setMensagemErro] = useState("");

  const imprimir = async (tipo) => {
    if (status === "imprimindo") return;
    setStatus("imprimindo");
    try {
      const { data: configImpressao } = await buscarConfigImpressao();
      const venda = montarVenda();
      const dados = tipo === "cupom"
        ? montarCupomPreNota({ venda, tenant, configImpressao })
        : montarComprovantePagamento({ venda, tenant, configImpressao });
      const { error } = await imprimirDocumento(dados, configImpressao?.perfilImpressora);
      if (error) {
        setMensagemErro(error.message);
        setStatus("erro");
        return;
      }
      setStatus("sucesso");
      setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
    } catch (err) {
      setMensagemErro(err?.message ?? "Não foi possível imprimir agora.");
      setStatus("erro");
    }
  };

  return (
    <div className="impressao-acoes">
      <button
        type="button"
        className="impressao-acoes__botao"
        onClick={() => imprimir("comprovante")}
        disabled={status === "imprimindo"}
      >
        <LuPrinter size={16} /> {status === "imprimindo" ? "Imprimindo…" : "Comprovante"}
      </button>
      <button
        type="button"
        className="impressao-acoes__botao"
        onClick={() => imprimir("cupom")}
        disabled={status === "imprimindo"}
      >
        <LuReceipt size={16} /> Pré-nota
      </button>
      {status === "erro" && (
        <span className="impressao-acoes__status impressao-acoes__status--erro">
          <LuCircleAlert size={13} /> {mensagemErro}
        </span>
      )}
      {status === "sucesso" && (
        <span className="impressao-acoes__status impressao-acoes__status--sucesso">
          <LuCircleCheck size={13} /> Enviado para impressão
        </span>
      )}
    </div>
  );
}
