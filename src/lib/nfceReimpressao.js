/**
 * NFC-e (modelo 65) — reimpressão do cupom a partir da nota guardada
 * (Leva 9, pura/testável). Ponte entre uma linha de public.nfce_emitidas
 * (o registro DURÁVEL da Leva 8) e o `resultado` que <ModalCupomNfce>/
 * <CupomNfce> já consomem — sem criar um segundo cupom.
 *
 * Preferimos REMONTAR a DANFE dos campos já persistidos (chave, protocolo,
 * url_qrcode, tp_amb, tp_emis, dh_emi) + os itens/pagamentos da venda, em
 * vez de reparsear o nfeProc: é o mesmo caminho da emissão (Leva 7), então
 * o cupom reimpresso é idêntico ao original. Não inventamos dado que não
 * está guardado — a identidade do emitente (emit) vem da config do tenant,
 * e os itens/pagamentos vêm da venda (passados por quem chama).
 *
 * Só a nota AUTORIZADA tem cupom fiscal para reimprimir. Pendente/rejeitada
 * não são erro de código — são estados humanos que a UI mostra (nada de
 * botão morto); por isso `podeReimprimir` é explícito.
 *
 * FRONTEIRA DE SEGREDO intacta: só documento público entra/sai (chave,
 * protocolo, urlQrCode já hasheada). Nada de certificado/CSC. Sem I/O.
 */

/**
 * True se o registro tem cupom fiscal para reimprimir (autorizada com chave).
 * @param {{status?:string, chave?:string}|null} registro
 * @returns {boolean}
 */
export function podeReimprimir(registro) {
  if (!registro) return false;
  const chave = String(registro.chave ?? "").replace(/\D/g, "");
  return registro.status === "autorizada" && chave.length === 44;
}

/**
 * Monta o `resultado` (mesmo formato de emitirDocumentoFiscal) para reabrir
 * <ModalCupomNfce> em modo de reimpressão a partir de um registro guardado.
 *
 * @param {{
 *   venda_id?:string|null, chave?:string, protocolo?:string|null,
 *   tp_amb?:number|null, tp_emis?:number|null, dh_emi?:string|null,
 *   url_qrcode?:string|null, status?:string,
 * }} registro  linha de nfce_emitidas
 * @param {{ emit?: object|null }} [opts]  identidade do emitente (config do tenant)
 * @returns {{status:"autorizada", vendaId:string|null, chave:string|null,
 *   protocolo:string|null, emit:object|null, tpAmb:number|null,
 *   tpEmis:number|null, dhEmi:string|null, urlQrCode:string|null,
 *   reimpressao:true}}
 */
export function montarResultadoReimpressao(registro, { emit = null } = {}) {
  if (!podeReimprimir(registro)) {
    throw new Error("Só é possível reimprimir uma NFC-e autorizada com chave de acesso.");
  }
  return {
    status: "autorizada",
    vendaId: registro.venda_id ?? null,
    chave: registro.chave ?? null,
    protocolo: registro.protocolo ?? null,
    emit: emit ?? null,
    tpAmb: registro.tp_amb ?? null,
    tpEmis: registro.tp_emis ?? null,
    dhEmi: registro.dh_emi ?? null,
    urlQrCode: registro.url_qrcode ?? null,
    // Marca a origem (reimpressão x emissão) — a UI pode rotular "2ª via".
    reimpressao: true,
  };
}

/**
 * Texto humano do estado de uma nota que NÃO pode ser reimpressa — para a UI
 * mostrar em vez de um botão morto (prevenção de erro > erro, Princípio nº1).
 *
 * @param {{status?:string}|null} registro
 * @returns {string}
 */
export function descreverEstadoReimpressao(registro) {
  if (!registro) return "Esta venda ainda não tem NFC-e emitida.";
  switch (registro.status) {
    case "autorizada":
      return "NFC-e autorizada — pronta para reimprimir.";
    case "pendente":
      return "NFC-e na fila de contingência, aguardando autorização da SEFAZ.";
    case "rejeitada":
      return "NFC-e rejeitada pela SEFAZ — não há cupom válido para reimprimir.";
    case "cancelada":
      return "NFC-e cancelada.";
    default:
      return "Esta venda ainda não tem NFC-e emitida.";
  }
}
