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
 * Forma ONLINE (emissão normal). A forma de CONTINGÊNCIA (offline), que
 * insere dhEmi/vNF/vICMS/digVal antes do idCSC, fica para a Leva 4 junto
 * com o resto da contingência.
 */

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
