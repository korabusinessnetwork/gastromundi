import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuPrinter, LuClock, LuCircleX, LuLoaderCircle } from "react-icons/lu";
import { buscarNfcePorVenda } from "@/lib/nfceEmitidasRepo";
import { podeReimprimir, montarResultadoReimpressao, descreverEstadoReimpressao } from "@/lib/nfceReimpressao";
import ModalCupomNfce from "./ModalCupomNfce";
import "./BotaoReimprimirNfce.css";

/**
 * <BotaoReimprimirNfce> — reimprime o cupom fiscal (2ª via) de uma venda já
 * feita, a partir da nota guardada em nfce_emitidas (Leva 9).
 *
 * Por que é intuitiva (Princípio nº1): o operador acha a reimpressão JUNTO da
 * venda que procura (histórico/detalhe), com rótulo claro "Reimprimir cupom".
 * O botão só aparece habilitado quando existe NFC-e AUTORIZADA guardada
 * (prevenção de erro > botão morto); quando a nota está pendente/rejeitada ou
 * não existe, mostra o ESTADO HUMANO da nota — nunca um clique que não faz
 * nada. Ao clicar, reabre exatamente o mesmo <CupomNfce> da emissão (não há
 * um segundo cupom), já com o botão Imprimir.
 *
 * Reuso: monta o `resultado` da nota guardada (montarResultadoReimpressao) e
 * entrega a <ModalCupomNfce> em 'concluido' — o mesmo componente da Leva 7.
 *
 * FRONTEIRA DE SEGREDO intacta: só campos públicos (chave, protocolo,
 * urlQrCode já hasheada). Nunca toca em certificado/CSC.
 *
 * @param {{
 *   venda: { id?: string, items?: Array, pagamentos?: Array, dest?: object },
 *   emit?: object|null,   // identidade do emitente (config do tenant)
 *   className?: string,
 * }} props
 */
export default function BotaoReimprimirNfce({ venda, emit = null, className = "" }) {
  const vendaId = venda?.id ?? null;
  const [carregando, setCarregando] = useState(true);
  const [registro, setRegistro] = useState(null);
  const [modalAberta, setModalAberta] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    buscarNfcePorVenda(vendaId).then(({ data }) => {
      if (!ativo) return;
      setRegistro(data);
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [vendaId]);

  if (carregando) {
    return (
      <span className={`reimprimir-nfce reimprimir-nfce--carregando ${className}`}>
        <LuLoaderCircle size={15} className="reimprimir-nfce__spinner" /> Verificando NFC-e…
      </span>
    );
  }

  const habilitado = podeReimprimir(registro);

  if (!habilitado) {
    // Estado humano — nada de botão morto (Princípio nº1).
    const pendente = registro?.status === "pendente";
    const rejeitada = registro?.status === "rejeitada";
    const Icone = pendente ? LuClock : rejeitada ? LuCircleX : LuPrinter;
    return (
      <span
        className={`reimprimir-nfce reimprimir-nfce--estado ${pendente ? "reimprimir-nfce--pendente" : ""} ${rejeitada ? "reimprimir-nfce--rejeitada" : ""} ${className}`}
      >
        <Icone size={15} /> {descreverEstadoReimpressao(registro)}
      </span>
    );
  }

  const resultado = montarResultadoReimpressao(registro, { emit });

  return (
    <>
      <button
        type="button"
        className={`reimprimir-nfce reimprimir-nfce__botao ${className}`}
        onClick={() => setModalAberta(true)}
      >
        <LuPrinter size={16} /> Reimprimir cupom
      </button>

      {modalAberta && createPortal(
        <ModalCupomNfce
          estadoEmissao="concluido"
          resultado={resultado}
          venda={venda}
          onFechar={() => setModalAberta(false)}
        />,
        document.body,
      )}
    </>
  );
}
