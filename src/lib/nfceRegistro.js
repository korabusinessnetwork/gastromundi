/**
 * NFC-e (modelo 65) — registro da nota emitida (Leva 8, pura/testável).
 *
 * Normaliza o desfecho TERMINAL de uma emissão (autorizada/rejeitada) no
 * objeto pronto para o INSERT em public.nfce_emitidas (migration 20260733).
 * Espelha o rigor de montarNotaPendenteTransmissao (nfceContingencia.js):
 * números coeridos, dhEmi em ISO, status validado contra o MESMO conjunto
 * do CHECK, chave só dígitos com validação de 44.
 *
 * Divisão de responsabilidade:
 *   • desfechos terminais (autorizada/rejeitada) → montarRegistroNfceEmitida
 *     (aqui): guarda o nfeProc autorizado (xml_tipo='proc') ou a trilha da
 *     rejeição;
 *   • fila de contingência/reenvio (pendente) → montarNotaPendenteTransmissao
 *     (nfceContingencia.js), que guarda o xmlAssinado (xml_tipo='assinado').
 *
 * FRONTEIRA DE SEGREDO intacta: só documento PÚBLICO entra aqui (nfeProc,
 * chave, protocolo, urlQrCode já hasheada, motivo). Nada de certificado,
 * CSC, .pfx ou senha — nem como parâmetro. Sem I/O, sem React.
 *
 * Multi-tenant: tudo por `tenantId`; nada de marca/CNPJ/UF hardcodado.
 */

// Mesmo conjunto do CHECK nfce_emitidas_status_valido. Os desfechos
// terminais deste builder são 'autorizada' e 'rejeitada' — 'pendente' e
// 'cancelada' são cobertos por outros caminhos, mas aceitos aqui para não
// duplicar a validação (o CHECK do banco é a barreira final).
const STATUS_VALIDOS = Object.freeze(["autorizada", "rejeitada", "pendente", "cancelada"]);

/** Número finito ou null (campos opcionais null-safe). */
function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** tpAmb normalizado: 1 = produção, 2 = homologação (default seguro). */
function tpAmbNormalizado(valor) {
  return Number(valor) === 1 ? 1 : 2;
}

/** Data → ISO; ausente/ inválida → null (não inventa "agora" num registro). */
function isoOuNull(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Texto aparado ou null. */
function textoOuNull(valor) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === "" ? null : s;
}

/**
 * Monta o objeto normalizado do registro de uma NFC-e emitida (desfecho
 * terminal) pronto para o insert em nfce_emitidas.
 *
 * @param {{
 *   tenantId: string,
 *   vendaId?: string|null,
 *   chave: string,
 *   numero?: number|string|null,
 *   serie?: number|string|null,
 *   status: "autorizada"|"rejeitada"|"pendente"|"cancelada",
 *   tpAmb?: number|string,
 *   tpEmis?: number|string,
 *   protocolo?: string|null,
 *   cStat?: string|null,
 *   xMotivo?: string|null,
 *   vNF?: number|string|null,
 *   dhEmi?: Date|string|null,
 *   urlQrCode?: string|null,
 *   xmlProc?: string|null,     // nfeProc autorizado (documento final)
 * }} dados
 * @returns {{
 *   tenant_id:string, venda_id:string|null, chave:string,
 *   numero:number|null, serie:number|null, status:string,
 *   tp_amb:number, tp_emis:number, protocolo:string|null,
 *   c_stat:string|null, x_motivo:string|null, v_nf:number|null,
 *   dh_emi:string|null, url_qrcode:string|null, xml:string|null,
 *   xml_tipo:"proc"|null, tentativas:number, motivo:string|null,
 *   transmitida_em:string|null
 * }}
 */
export function montarRegistroNfceEmitida(dados = {}) {
  const tenantId = textoOuNull(dados.tenantId);
  if (!tenantId) {
    throw new Error("Registro de NFC-e exige o tenantId.");
  }

  const status = String(dados.status ?? "");
  if (!STATUS_VALIDOS.includes(status)) {
    throw new Error(`status inválido para registro de NFC-e: "${dados.status}".`);
  }

  const chave = String(dados.chave ?? "").replace(/\D/g, "");
  if (chave.length !== 44) {
    throw new Error("Registro de NFC-e exige a chave de acesso de 44 dígitos.");
  }

  const xmlProc = textoOuNull(dados.xmlProc);
  const dhEmiIso = isoOuNull(dados.dhEmi);
  const autorizada = status === "autorizada";

  return {
    tenant_id: tenantId,
    venda_id: textoOuNull(dados.vendaId),
    chave,
    numero: numeroOuNull(dados.numero),
    serie: numeroOuNull(dados.serie),
    status,
    tp_amb: tpAmbNormalizado(dados.tpAmb),
    tp_emis: Number(dados.tpEmis) === 9 ? 9 : 1,
    protocolo: textoOuNull(dados.protocolo),
    c_stat: textoOuNull(dados.cStat),
    x_motivo: textoOuNull(dados.xMotivo),
    v_nf: numeroOuNull(dados.vNF),
    dh_emi: dhEmiIso,
    url_qrcode: textoOuNull(dados.urlQrCode),
    // nfeProc só faz sentido guardar quando ele existe (nota autorizada).
    xml: xmlProc,
    xml_tipo: xmlProc ? "proc" : null,
    tentativas: 0,
    motivo: textoOuNull(dados.motivo),
    // Só a nota autorizada foi "transmitida com sucesso" de fato.
    transmitida_em: autorizada ? (dhEmiIso ?? new Date().toISOString()) : null,
  };
}
