import { useState } from "react";
import { LuPrinter, LuCircleCheck, LuCircleAlert } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { montarComprovantePagamento, buscarConfigImpressao } from "@/lib/impressao";
import { imprimirDocumento } from "@/lib/impressao/drivers";
import "./BotaoReimprimirComprovante.css";

/**
 * Reimpressão manual do comprovante de pagamento de uma venda já
 * finalizada, a partir do histórico de vendas (Relatório).
 *
 * O papel pode se perder, molhar ou nem sair na hora (impressora offline).
 * Sem depender de refazer a venda, o operador reimprime o comprovante
 * daquela comanda exatamente como foi paga — mesma função montadora
 * (`montarComprovantePagamento`) usada no fechamento, então o documento
 * é idêntico ao original.
 *
 * Fire-and-forget: buscarConfigImpressao nunca lança (cai no cache/local
 * offline) e imprimirDocumento devolve { error } sem lançar. O status
 * (imprimindo/erro/sucesso) fica visível ao lado do botão sem travar a tela.
 */
export default function BotaoReimprimirComprovante({ venda, compacto = false }) {
  const { tenant } = useApp();
  const [status, setStatus] = useState(null); // null | "imprimindo" | "erro" | "sucesso"
  const [mensagemErro, setMensagemErro] = useState("");

  const reimprimir = async () => {
    if (status === "imprimindo" || !venda) return;
    setStatus("imprimindo");
    setMensagemErro("");
    try {
      const { data: configImpressao } = await buscarConfigImpressao();
      const documento = montarComprovantePagamento({ venda, tenant, configImpressao });
      const { error } = await imprimirDocumento(documento, configImpressao?.perfilImpressora);
      if (error) {
        setMensagemErro(error.message ?? "Não foi possível imprimir agora.");
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
    <span className="reimprimir-comprovante">
      <button
        type="button"
        className={`reimprimir-comprovante__botao${compacto ? " reimprimir-comprovante__botao--compacto" : ""}`}
        onClick={reimprimir}
        disabled={status === "imprimindo"}
        title="Reimprimir comprovante de pagamento"
      >
        <LuPrinter size={compacto ? 15 : 16} />
        {!compacto && (
          <span>{status === "imprimindo" ? "Imprimindo…" : "Reimprimir comprovante"}</span>
        )}
      </button>
      {status === "erro" && (
        <span className="reimprimir-comprovante__status reimprimir-comprovante__status--erro">
          <LuCircleAlert size={13} /> {mensagemErro}
        </span>
      )}
      {status === "sucesso" && (
        <span className="reimprimir-comprovante__status reimprimir-comprovante__status--sucesso">
          <LuCircleCheck size={13} /> Enviado para impressão
        </span>
      )}
    </span>
  );
}
