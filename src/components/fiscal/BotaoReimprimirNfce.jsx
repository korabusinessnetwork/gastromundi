import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuPrinter, LuClock, LuCircleX, LuLoaderCircle } from "react-icons/lu";
import { buscarNfcePorVenda } from "@/lib/nfceEmitidasRepo";
import { buscarVendaCompleta } from "@/lib/vendasRepo";
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
 * Numa LISTA (histórico, Leva 12), passe `registroInicial` (a linha que a lista
 * já tem) para EVITAR N+1 — o componente pula o fetch da nota por venda. Sem a
 * prop, mantém o comportamento original (busca por `venda.id`). E como a lista
 * não traz os itens da venda, os itens/pagamentos para remontar a DANFE são
 * carregados SOB DEMANDA (ao clicar em "Reimprimir"), nunca eager por linha.
 *
 * FRONTEIRA DE SEGREDO intacta: só campos públicos (chave, protocolo,
 * urlQrCode já hasheada). Nunca toca em certificado/CSC.
 *
 * @param {{
 *   venda: { id?: string, items?: Array, pagamentos?: Array, dest?: object },
 *   emit?: object|null,          // identidade do emitente (config do tenant)
 *   registroInicial?: object,    // linha de nfce_emitidas já carregada (evita N+1)
 *   className?: string,
 * }} props
 */
export default function BotaoReimprimirNfce({ venda, emit = null, registroInicial, className = "" }) {
  const vendaId = venda?.id ?? null;
  const temRegistroInicial = registroInicial !== undefined;
  const [carregando, setCarregando] = useState(!temRegistroInicial);
  const [registro, setRegistro] = useState(registroInicial ?? null);
  const [modalAberta, setModalAberta] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  // Venda completa (itens/pagamentos) usada no cupom — pode ser a prop `venda`
  // (quando já vem com itens) ou a carregada sob demanda a partir do venda_id.
  const [vendaCupom, setVendaCupom] = useState(null);

  useEffect(() => {
    // Registro veio pronto da lista (Leva 12) — não busca (evita N+1).
    if (temRegistroInicial) {
      setRegistro(registroInicial ?? null);
      setCarregando(false);
      return;
    }
    let ativo = true;
    setCarregando(true);
    buscarNfcePorVenda(vendaId).then(({ data }) => {
      if (!ativo) return;
      setRegistro(data);
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [vendaId, temRegistroInicial, registroInicial]);

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

  // A venda já tem itens? usa direto. Senão, carrega SOB DEMANDA (ao clicar)
  // a partir do venda_id — evita N buscas de venda ao abrir a lista.
  const temItens = Array.isArray(venda?.items) && venda.items.length > 0;
  const idVendaCupom = venda?.id ?? registro?.venda_id ?? null;

  const abrirCupom = async () => {
    if (temItens || !idVendaCupom) {
      setVendaCupom(venda ?? null);
      setModalAberta(true);
      return;
    }
    setAbrindo(true);
    const { data } = await buscarVendaCompleta(idVendaCupom);
    setAbrindo(false);
    // Sem a venda (apagada/sem itens): abre mesmo assim — a modal mostra o
    // estado humano em vez de quebrar.
    setVendaCupom(data ?? venda ?? null);
    setModalAberta(true);
  };

  return (
    <>
      <button
        type="button"
        className={`reimprimir-nfce reimprimir-nfce__botao ${className}`}
        onClick={abrirCupom}
        disabled={abrindo}
      >
        {abrindo
          ? (<><LuLoaderCircle size={16} className="reimprimir-nfce__spinner" /> Abrindo…</>)
          : (<><LuPrinter size={16} /> Reimprimir cupom</>)}
      </button>

      {modalAberta && createPortal(
        <ModalCupomNfce
          estadoEmissao="concluido"
          resultado={resultado}
          venda={vendaCupom ?? venda}
          onFechar={() => setModalAberta(false)}
        />,
        document.body,
      )}
    </>
  );
}
