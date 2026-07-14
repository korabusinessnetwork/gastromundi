/**
 * NFC-e (modelo 65) — núcleo da ASSINATURA XML-DSig (Leva 6, parte pura).
 *
 * A NFC-e assina o elemento <infNFe Id="NFe<chave>"> com XML-DSig
 * *enveloped*. Este módulo faz TUDO o que NÃO depende da chave privada:
 * canonicaliza, calcula o DigestValue, monta o <SignedInfo> e o bloco
 * <Signature>. A operação que exige o SEGREDO (o RSA-sign do SignedInfo)
 * entra por um CALLBACK injetado por quem tem o certificado (a Edge
 * Function) — este módulo NUNCA vê a chave privada, o .pfx nem a senha.
 *
 * FRONTEIRA DE SEGREDO intacta: sem imports externos, sem certificado, sem
 * I/O. Roda igual no Deno (Edge) e no Node (Vitest) porque usa só o que
 * existe nos dois: Web Crypto (globalThis.crypto.subtle) e btoa/atob.
 *
 * ── C14N: qual algoritmo (decisão documentada) ─────────────────────────
 * O leiaute NFe 4.00 (MOC — Manual de Orientação do Contribuinte) assina
 * com **Canonical XML 1.0 (inclusiva)**:
 *     CanonicalizationMethod = http://www.w3.org/TR/2001/REC-xml-c14n-20010315
 *     Transforms = enveloped-signature + a MESMA C14N 1.0
 *     SignatureMethod = rsa-sha1 · DigestMethod = sha1
 * É o que a SEFAZ VALIDA — por isso usamos essa URI (e não a exclusiva
 * `xml-exc-c14n#` citada no pedido). Para o nosso XML — gerado por
 * montarXmlNfce, com UM único namespace default, SEM prefixos, SEM
 * comentários e SEM whitespace entre tags — a saída em bytes das duas
 * canonicalizações é idêntica; muda só a URI declarada, que precisa casar
 * com a da SEFAZ. Isolamos a C14N atrás de `canonicalizarInfNfe`: como o
 * documento é controlado e restrito, implementamos a C14N 1.0 do próprio
 * subconjunto (parser + serializador determinístico), testada por vetores
 * conhecidos — sem depender de lib externa que teria de rodar no Deno E no
 * Node. Se algum dia o XML ganhar prefixos/comentários, é AQUI que troca.
 */

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

// URIs dos algoritmos (leiaute NFe 4.00 — o que a SEFAZ valida).
const ALG_C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ALG_ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const ALG_SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const ALG_RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";

// ── C14N (Canonical XML 1.0) do subconjunto controlado do infNFe ───────

/** Decodifica as entidades que o gerador (escaparXml) pode ter produzido. */
function decodificarEntidades(texto) {
  return String(texto)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&"); // por último, para não re-decodificar
}

/** Escapa um NÓ DE TEXTO conforme a C14N 1.0 (nota: ' e " ficam literais). */
function escaparTextoC14n(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#xD;");
}

/** Escapa um VALOR DE ATRIBUTO conforme a C14N 1.0 (' fica literal). */
function escaparAtributoC14n(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

/**
 * Parser mínimo e correto para o subconjunto gerado por montarXmlNfce:
 * elementos, atributos, nós de texto — sem comentários, PIs, CDATA nem
 * prefixos. Devolve a árvore de UM elemento a partir de `s`/`pos`.
 */
function parseElemento(s, pos) {
  if (s[pos] !== "<") throw new Error("C14N: esperado início de elemento.");
  pos++;
  let nome = "";
  while (pos < s.length && !/[\s>\/]/.test(s[pos])) nome += s[pos++];

  const atributos = [];
  while (pos < s.length) {
    while (/\s/.test(s[pos])) pos++;
    if (s[pos] === ">" || s[pos] === "/") break;
    let attrNome = "";
    while (pos < s.length && s[pos] !== "=") attrNome += s[pos++];
    pos++; // '='
    const aspas = s[pos++]; // ' ou "
    let attrValor = "";
    while (pos < s.length && s[pos] !== aspas) attrValor += s[pos++];
    pos++; // aspas de fechamento
    atributos.push({ nome: attrNome.trim(), valor: decodificarEntidades(attrValor) });
  }

  // Elemento vazio <x/>
  if (s[pos] === "/") {
    pos += 2; // '/>'
    return { no: { nome, atributos, filhos: [] }, pos };
  }
  pos++; // '>'

  const filhos = [];
  while (pos < s.length) {
    if (s[pos] === "<") {
      if (s[pos + 1] === "/") {
        // fecha o elemento atual
        pos += 2;
        while (pos < s.length && s[pos] !== ">") pos++;
        pos++; // '>'
        return { no: { nome, atributos, filhos }, pos };
      }
      const r = parseElemento(s, pos);
      filhos.push(r.no);
      pos = r.pos;
    } else {
      let texto = "";
      while (pos < s.length && s[pos] !== "<") texto += s[pos++];
      filhos.push({ texto: decodificarEntidades(texto) });
    }
  }
  throw new Error("C14N: elemento não fechado.");
}

/**
 * Serializa um nó em C14N 1.0. `nsDefaultRenderizada` = a URI do namespace
 * default já emitida por um ancestral DENTRO do subárvore canonizado
 * (null no ápice). Como o documento tem UM só namespace default e nenhum
 * prefixo, basta declarar `xmlns` no ÁPICE (visivelmente utilizado) e
 * herdar nos descendentes — comportamento tanto da C14N 1.0 quanto da
 * exclusiva para este subconjunto.
 */
function serializarC14n(no, nsAplicavel, nsDefaultRenderizada) {
  if (no.texto !== undefined) return escaparTextoC14n(no.texto);

  let out = "<" + no.nome;
  // Declaração de namespace (antes dos atributos), só quando muda.
  if (nsAplicavel && nsAplicavel !== nsDefaultRenderizada) {
    out += ` xmlns="${escaparAtributoC14n(nsAplicavel)}"`;
  }
  // Atributos ordenados por nome (todos sem namespace neste subconjunto).
  const attrs = [...no.atributos].sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
  for (const a of attrs) out += ` ${a.nome}="${escaparAtributoC14n(a.valor)}"`;
  out += ">";
  const nsFilhos = nsAplicavel ?? nsDefaultRenderizada;
  for (const f of no.filhos ?? []) out += serializarC14n(f, nsAplicavel, nsFilhos);
  out += `</${no.nome}>`;
  return out;
}

/**
 * Recorta a substring do único elemento <tag>…</tag> do XML. Agnóstico ao
 * elemento (Leva 10): serve tanto ao <infNFe> da NFe quanto ao <infEvento> do
 * evento de cancelamento — a C14N do subconjunto é a mesma.
 */
function extrairElemento(xml, tag) {
  const m = String(xml ?? "").match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`));
  if (!m) throw new Error(`Assinatura: <${tag}> não encontrado no XML.`);
  return m[0];
}

/**
 * Canonicaliza (C14N 1.0) o elemento <tag> do XML. O default namespace da NFe
 * (`NFE_NS`), herdado do elemento pai (<NFe> ou <evento>), é declarado no
 * ápice do subárvore canonizado.
 * @param {string} xml XML completo (não-assinado)
 * @param {string} [tag] elemento a canonizar (default: infNFe)
 * @returns {string} C14N do elemento
 */
export function canonicalizarElemento(xml, tag = "infNFe") {
  const { no } = parseElemento(extrairElemento(xml, tag), 0);
  return serializarC14n(no, NFE_NS, null);
}

/** Compat: canonicaliza o <infNFe> (mesma saída de sempre — testes verdes). */
export function canonicalizarInfNfe(xml) {
  return canonicalizarElemento(xml, "infNFe");
}

// ── Digest ─────────────────────────────────────────────────────────────

function bytesParaBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * DigestValue (SHA-1, Base64) de um elemento canonizado (C14N 1.0). Genérico
 * (Leva 10): <infNFe> (NFe) ou <infEvento> (cancelamento).
 * @param {string} xml XML completo (não-assinado)
 * @param {string} [tag] elemento a digerir (default: infNFe)
 * @returns {Promise<{digestValue:string, c14n:string}>}
 */
export async function digestElemento(xml, tag = "infNFe") {
  const c14n = canonicalizarElemento(xml, tag);
  const buffer = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode(c14n));
  return { digestValue: bytesParaBase64(new Uint8Array(buffer)), c14n };
}

/**
 * DigestValue do <infNFe>. O `digestValue` é também o insumo do `digVal` do QR
 * de contingência (nfceQrCode). Mantido para compat (mesma saída de sempre).
 * @param {string} xml XML completo da NFC-e (não-assinado)
 * @returns {Promise<{digestValue:string, c14n:string}>}
 */
export async function digestInfNfe(xml) {
  return digestElemento(xml, "infNFe");
}

// ── SignedInfo e Signature ─────────────────────────────────────────────

/**
 * Monta o <SignedInfo> JÁ canonizado (C14N 1.0) — string exata que será
 * assinada (RSA-SHA1). Declara o namespace xmldsig no ápice, como a C14N
 * faz ao canonizar o SignedInfo isolado para a assinatura.
 * @param {{referenceUri:string, digestValue:string}} p
 * @returns {string}
 */
export function montarSignedInfo({ referenceUri, digestValue }) {
  if (!referenceUri || !/^#NFe\d{44}$/.test(referenceUri)) {
    throw new Error('SignedInfo exige referenceUri no formato "#NFe<44 dígitos>".');
  }
  if (!digestValue) throw new Error("SignedInfo exige o DigestValue do infNFe.");
  return construirSignedInfo({ referenceUri, digestValue });
}

/**
 * Monta o <SignedInfo> canonizado para QUALQUER Reference URI (Leva 10) — os
 * algoritmos (C14N 1.0, RSA-SHA1, enveloped, SHA1) são os mesmos da NFe e do
 * evento de cancelamento. Sem a validação estrita do formato #NFe (essa fica
 * em montarSignedInfo, que delega aqui): o evento usa #ID110111….
 */
function construirSignedInfo({ referenceUri, digestValue }) {
  return (
    `<SignedInfo xmlns="${DSIG_NS}">` +
    `<CanonicalizationMethod Algorithm="${ALG_C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${ALG_RSA_SHA1}"></SignatureMethod>` +
    `<Reference URI="${referenceUri}">` +
    `<Transforms>` +
    `<Transform Algorithm="${ALG_ENVELOPED}"></Transform>` +
    `<Transform Algorithm="${ALG_C14N}"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="${ALG_SHA1}"></DigestMethod>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`
  );
}

/**
 * Monta o bloco <Signature> completo. O <SignedInfo> é embutido BYTE-A-BYTE
 * igual ao que foi assinado (o xmlns xmldsig repetido é redundante e válido;
 * a canonicalização de verificação o reproduz de forma idempotente).
 * @param {{signedInfo:string, signatureValue:string, certificadoX509Base64:string}} p
 * @returns {string}
 */
export function montarAssinatura({ signedInfo, signatureValue, certificadoX509Base64 }) {
  if (!signedInfo) throw new Error("Signature exige o SignedInfo.");
  if (!signatureValue) throw new Error("Signature exige o SignatureValue (RSA-SHA1).");
  if (!certificadoX509Base64) throw new Error("Signature exige o certificado X509 (Base64).");
  return (
    `<Signature xmlns="${DSIG_NS}">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certificadoX509Base64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`
  );
}

/** Lê a chave de acesso (44 díg) do atributo Id="NFe…" do <infNFe>. */
function lerChave(xml) {
  const m = String(xml ?? "").match(/<infNFe\b[^>]*\bId="NFe(\d{44})"/);
  if (!m) throw new Error("Assinatura: Id=\"NFe<chave>\" ausente no <infNFe>.");
  return m[1];
}

/** Lê o valor do atributo Id="…" de um elemento (ex.: infEvento → ID110111…). */
function lerId(xml, tag) {
  const m = String(xml ?? "").match(new RegExp(`<${tag}\\b[^>]*\\bId="([^"]+)"`));
  if (!m) throw new Error(`Assinatura: Id ausente no <${tag}>.`);
  return m[1];
}

/**
 * Assinador GENÉRICO enveloped (Leva 10). Canoniza/digere/assina o elemento
 * `tagAlvo` e insere a <Signature> pelo `inserirAssinatura`. O RSA-sign é
 * injetado pelo callback `assinarSignedInfo` (quem tem o certificado, na
 * Edge) — este módulo NUNCA toca na chave privada. `assinarInfNfe` e
 * `assinarInfEvento` são casos particulares deste.
 *
 * @param {string} xml XML não-assinado
 * @param {{
 *   tagAlvo: string,          // "infNFe" | "infEvento"
 *   referenceUri: string,     // "#NFe<44>" | "#ID110111…"
 *   assinarSignedInfo: (signedInfoC14n:string) => Promise<{signatureValue:string, certificadoX509Base64:string}>,
 *   inserirAssinatura: (xml:string, signature:string) => string,
 * }} deps
 * @returns {Promise<{xmlAssinado:string, digestValue:string}>}
 */
export async function assinarElemento(xml, { tagAlvo, referenceUri, assinarSignedInfo, inserirAssinatura } = {}) {
  if (typeof assinarSignedInfo !== "function") {
    throw new Error("assinarElemento exige o callback assinarSignedInfo (injeta o RSA-sign com a chave).");
  }
  const { digestValue } = await digestElemento(xml, tagAlvo);
  const signedInfo = construirSignedInfo({ referenceUri, digestValue });

  const assinado = await assinarSignedInfo(signedInfo);
  if (!assinado?.signatureValue || !assinado?.certificadoX509Base64) {
    throw new Error("assinarSignedInfo deve devolver { signatureValue, certificadoX509Base64 }.");
  }
  const signature = montarAssinatura({
    signedInfo,
    signatureValue: assinado.signatureValue,
    certificadoX509Base64: assinado.certificadoX509Base64,
  });
  return { xmlAssinado: inserirAssinatura(xml, signature), digestValue };
}

/**
 * Orquestra a assinatura enveloped do <infNFe>. O RSA-sign é injetado pelo
 * callback `assinarSignedInfo` (implementado por quem tem o certificado, na
 * Edge Function) — este módulo NUNCA toca na chave privada.
 *
 * @param {string} xml XML completo <NFe>…</NFe> não-assinado
 * @param {{
 *   assinarSignedInfo: (signedInfoC14n:string) => Promise<{signatureValue:string, certificadoX509Base64:string}>,
 *   infNFeSupl?: string   // bloco <infNFeSupl> (qrCode/urlChave) a inserir entre </infNFe> e a assinatura
 * }} deps
 * @returns {Promise<{xmlAssinado:string, digestValue:string}>}
 */
export async function assinarInfNfe(xml, { assinarSignedInfo, infNFeSupl = "" } = {}) {
  if (typeof assinarSignedInfo !== "function") {
    throw new Error("assinarInfNfe exige o callback assinarSignedInfo (injeta o RSA-sign com a chave).");
  }
  const referenceUri = `#NFe${lerChave(xml)}`;
  return assinarElemento(xml, {
    tagAlvo: "infNFe",
    referenceUri,
    assinarSignedInfo,
    // Ordem NFe: <NFe> infNFe · infNFeSupl · Signature </NFe>. A assinatura
    // cobre só o infNFe (enveloped); infNFeSupl é irmão não-assinado.
    inserirAssinatura: (x, signature) => String(x).replace("</NFe>", `${infNFeSupl}${signature}</NFe>`),
  });
}

/**
 * Assina o <infEvento> do evento de cancelamento (Leva 10). Mesma C14N 1.0 /
 * RSA-SHA1 da NFe; a Reference é o Id do infEvento (#ID110111…). A <Signature>
 * entra DENTRO do <evento>, após o </infEvento>.
 *
 * @param {string} xml XML <evento>…</evento> não-assinado (montarXmlEventoCancelamento)
 * @param {{ assinarSignedInfo: (signedInfoC14n:string) => Promise<{signatureValue:string, certificadoX509Base64:string}> }} deps
 * @returns {Promise<{xmlAssinado:string, digestValue:string}>}
 */
export async function assinarInfEvento(xml, { assinarSignedInfo } = {}) {
  if (typeof assinarSignedInfo !== "function") {
    throw new Error("assinarInfEvento exige o callback assinarSignedInfo (injeta o RSA-sign com a chave).");
  }
  const referenceUri = `#${lerId(xml, "infEvento")}`;
  return assinarElemento(xml, {
    tagAlvo: "infEvento",
    referenceUri,
    assinarSignedInfo,
    inserirAssinatura: (x, signature) => String(x).replace("</evento>", `${signature}</evento>`),
  });
}
