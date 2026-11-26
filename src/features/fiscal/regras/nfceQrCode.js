/**
 * NFC-e (modelo 65) — QR Code 2.00 (Leva 3, parte pura/testável).
 *
 * O cupom da NFC-e precisa de um QR Code que a SEFAZ e o consumidor usam
 * para consultar a nota. A montagem do QR é DETERMINÍSTICA e testável sem
 * contatar a SEFAZ — mas o hash final depende do CSC (Código de Segurança
 * do Contribuinte), que é um SEGREDO do estabelecimento.
 *
 * SECRET BOUNDARY (decisão de segurança + Restrições de Custo):
 *   O valor do CSC entra aqui como PARÂMETRO — este módulo NUNCA o guarda,
 *   loga ou lê de tabela. Quem chama é a Edge Function (Leva 3, servidor),
 *   que lê o CSC do secret do tenant (Supabase Vault / env) só na hora de
 *   assinar/transmitir. O front NUNCA vê o CSC. Assim o código fica
 *   "pronto pra só por a chave": o algoritmo já está montado e testado; no
 *   dia da homologação injeta-se o CSC real e o idCSC do tenant.
 *
 * Referência: NT 2015.002 (QR Code versão 2.00) — leiaute NFC-e 4.00.
 * Forma ONLINE (emissão normal) e forma de CONTINGÊNCIA (offline), esta
 * última inserindo dhEmi/vNF/vICMS/digVal antes do idCSC. As duas formas
 * são puras e testáveis: o CSC segue sendo PARÂMETRO injetado e o digVal
 * (que vem da assinatura) entra também como parâmetro — nada de segredo
 * nem de certificado neste módulo.
 */

import { camposFaltantesQrContingencia } from "./nfceContingencia.js";

/**
 * SHA-1 em hexadecimal MAIÚSCULO. Usa a Web Crypto (globalThis.crypto),
 * disponível igual no Deno (Edge Function), no Node (testes) e no browser.
 * A SEFAZ exige o hash do QR Code em SHA-1 hex maiúsculo.
 *
 * @param {string} texto
 * @returns {Promise<string>} 40 caracteres hex maiúsculos
 */
export async function sha1Hex(texto) {
  const dados = new TextEncoder().encode(String(texto));
  const buffer = await globalThis.crypto.subtle.digest("SHA-1", dados);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Monta a URL do QR Code 2.00 da NFC-e (emissão normal/online).
 *
 * Estrutura do parâmetro `p` (NT 2015.002):
 *   chave | versaoQR(=2) | tpAmb | idCSC | cHashQRCode
 * onde cHashQRCode = SHA-1( "chave|versao|tpAmb|idCSC" + CSC ).
 *
 * A `urlConsulta` é por-UF e por-ambiente e vem de tenant_fiscal_config —
 * NÃO é hardcoded aqui (multi-tenant / white-label, decisão 002/017/028).
 *
 * @param {{
 *   chave: string,       // chave de acesso de 44 dígitos (Leva 1)
 *   tpAmb: 1|2|string,   // 1 = produção, 2 = homologação
 *   idCsc: string|number,// identificador do CSC (cIdToken), 6 dígitos
 *   csc: string,         // SEGREDO — valor do CSC do tenant (injetado)
 *   urlConsulta: string, // URL de consulta do QR da UF/ambiente (config)
 * }} p
 * @returns {Promise<string>} URL completa do QR Code
 */
export async function montarQrCodeNfce({ chave, tpAmb, idCsc, csc, urlConsulta }) {
  const chaveDigitos = String(chave ?? "").replace(/\D/g, "");
  if (chaveDigitos.length !== 44) {
    throw new Error("QR Code NFC-e exige a chave de acesso de 44 dígitos.");
  }
  const amb = String(tpAmb ?? "");
  if (amb !== "1" && amb !== "2") {
    throw new Error("QR Code NFC-e exige tpAmb 1 (produção) ou 2 (homologação).");
  }
  const idToken = String(idCsc ?? "").replace(/\D/g, "");
  if (!idToken) {
    throw new Error("QR Code NFC-e exige o idCSC (cIdToken) do tenant.");
  }
  if (!csc) {
    // Segredo obrigatório, mas injetado por quem chama — nunca daqui.
    throw new Error("QR Code NFC-e exige o CSC do tenant (segredo, injetado).");
  }
  if (!urlConsulta) {
    throw new Error("QR Code NFC-e exige a URL de consulta da UF (config do tenant).");
  }

  const versao = "2"; // QR Code versão 2.00
  const idTokenPad = idToken.padStart(6, "0");
  const dados = `${chaveDigitos}|${versao}|${amb}|${idTokenPad}`;
  const hash = await sha1Hex(dados + csc);
  const separador = urlConsulta.includes("?") ? "&" : "?";
  return `${urlConsulta}${separador}p=${dados}|${hash}`;
}

// ── Helpers de encoding da forma de contingência (NT 2015.002) ─────────

/** Bytes → hexadecimal MAIÚSCULO. */
function bytesParaHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * dhEmi em hexadecimal: a NT manda informar a data/hora de emissão como o
 * HEX dos bytes ASCII da string dhEmi (formato AAAA-MM-DDThh:mm:ss±hh:mm).
 */
function hexDeAscii(texto) {
  return bytesParaHex(new TextEncoder().encode(String(texto)));
}

/**
 * digVal em hexadecimal: o DigestValue da assinatura vem em Base64; a NT
 * manda convertê-lo de Base64 para HEX (os 20 bytes do SHA-1 → 40 hex).
 * `atob` existe igual no Deno, no Node e no browser.
 */
function hexDeBase64(b64) {
  const bin = atob(String(b64));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return bytesParaHex(bytes);
}

/** Valor monetário com 2 casas e ponto (formato do QR/SEFAZ). */
function money2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("Valor monetário inválido no QR de contingência.");
  return n.toFixed(2);
}

/**
 * Monta a URL do QR Code 2.00 na forma de CONTINGÊNCIA (offline, tpEmis=9).
 *
 * Estrutura do parâmetro `p` (NT 2015.002 — difere da online: entram
 * dhEmi/vNF/vICMS/digVal ANTES do idCSC):
 *   chave | versao(=2) | tpAmb | dhEmi(hex) | vNF | vICMS | digVal(hex) | idCSC | cHashQRCode
 * onde cHashQRCode = SHA-1( "tudo-antes-do-hash" + CSC ) em hex MAIÚSCULO.
 *
 * O `digVal` (DigestValue da assinatura, Base64) entra como PARÂMETRO —
 * quem assina (Edge Function) o extrai da assinatura e injeta aqui. O CSC
 * segue sendo segredo injetado. Este módulo continua sem tocar em segredo
 * nem em certificado.
 *
 * ⚠️ Encoding dos campos hex (dhEmi/digVal): seguimos a NT 2015.002 em hex
 * MAIÚSCULO, coerente com o cHashQRCode. Caso a homologação da SEFAZ-RS
 * acuse divergência de caixa, é o único ponto a ajustar (bytesParaHex).
 *
 * @param {{
 *   chave:string, tpAmb:1|2|string, idCsc:string|number, csc:string,
 *   urlConsulta:string, dhEmi:string, vNF:number|string,
 *   vICMS:number|string, digVal:string
 * }} p
 * @returns {Promise<string>} URL completa do QR Code de contingência
 */
export async function montarQrCodeNfceContingencia({
  chave, tpAmb, idCsc, csc, urlConsulta, dhEmi, vNF, vICMS, digVal,
}) {
  const chaveDigitos = String(chave ?? "").replace(/\D/g, "");
  if (chaveDigitos.length !== 44) {
    throw new Error("QR Code NFC-e exige a chave de acesso de 44 dígitos.");
  }
  const amb = String(tpAmb ?? "");
  if (amb !== "1" && amb !== "2") {
    throw new Error("QR Code NFC-e exige tpAmb 1 (produção) ou 2 (homologação).");
  }
  const idToken = String(idCsc ?? "").replace(/\D/g, "");
  if (!idToken) {
    throw new Error("QR Code NFC-e exige o idCSC (cIdToken) do tenant.");
  }
  if (!csc) {
    throw new Error("QR Code NFC-e exige o CSC do tenant (segredo, injetado).");
  }
  if (!urlConsulta) {
    throw new Error("QR Code NFC-e exige a URL de consulta da UF (config do tenant).");
  }

  // Campos exclusivos da contingência — reaproveita a lista de referência
  // de nfceContingencia.js para um erro claro e completo (prevenção de erro).
  const faltando = camposFaltantesQrContingencia({ tpEmis: 9, dhEmi, vNF, vICMS, digVal });
  if (faltando.length > 0) {
    throw new Error(
      `QR Code de contingência exige ${faltando.join(", ")} (dependem da assinatura/totais).`,
    );
  }

  const versao = "2";
  const idTokenPad = idToken.padStart(6, "0");
  const dados =
    `${chaveDigitos}|${versao}|${amb}|${hexDeAscii(dhEmi)}|` +
    `${money2(vNF)}|${money2(vICMS)}|${hexDeBase64(digVal)}|${idTokenPad}`;
  const hash = await sha1Hex(dados + csc);
  const separador = urlConsulta.includes("?") ? "&" : "?";
  return `${urlConsulta}${separador}p=${dados}|${hash}`;
}
