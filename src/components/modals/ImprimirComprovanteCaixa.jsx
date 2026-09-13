import { useState } from "react";
import { LuPrinter, LuCircleCheck, LuCircleAlert } from "react-icons/lu";
import { buscarConfigImpressao } from "@/lib/impressao";
import { imprimirDocumento } from "@/lib/impressao/drivers";
import "./ImprimirComprovanteCaixa.css";

/**
 * Botão de imprimir comprovante de caixa (F005) — usado na tela de
 * sucesso da sangria/suprimento e do fechamento. Fire-and-forget: a
 * impressão nunca trava o operador, o erro aparece ao lado do botão sem
 * desfazer o registro que já foi salvo.
 *
 * O documento só é montado na hora do clique, com a config de impressão
 * recém-buscada — quem sabe montar (movimento × fechamento) é o
 * chamador, via `montarDocumento(configImpressao)`.
 *
 * @param {{ montarDocumento: (configImpressao: object) => object, rotulo?: string }} props
 */
export default function ImprimirComprovanteCaixa({ montarDocumento, rotulo = "Imprimir comprovante" }) {
  const [status, setStatus] = useState(null); // null | "imprimindo" | "erro" | "sucesso"
  const [mensagemErro, setMensagemErro] = useState("");

  const imprimir = async () => {
    if (status === "imprimindo") return;
    setStatus("imprimindo");
    try {
      const { data: configImpressao } = await buscarConfigImpressao();
      const documento = montarDocumento(configImpressao);
      const { error } = await imprimirDocumento(documento, configImpressao?.perfilImpressora);
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
    <div className="imprimir-comprovante-caixa">
      <button
        type="button"
        className="imprimir-comprovante-caixa__botao"
        onClick={imprimir}
        disabled={status === "imprimindo"}
      >
        <LuPrinter size={16} /> {status === "imprimindo" ? "Imprimindo…" : rotulo}
      </button>
      {status === "erro" && (
        <span className="imprimir-comprovante-caixa__status imprimir-comprovante-caixa__status--erro">
          <LuCircleAlert size={13} /> {mensagemErro}
        </span>
      )}
      {status === "sucesso" && (
        <span className="imprimir-comprovante-caixa__status imprimir-comprovante-caixa__status--sucesso">
          <LuCircleCheck size={13} /> Enviado para impressão
        </span>
      )}
    </div>
  );
}
