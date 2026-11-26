/**
 * NFC-e (modelo 65) — núcleo puro, sem I/O.
 *
 * Integração DIRETA com a SEFAZ (caminho gratuito, sem provedor pago —
 * Restrições de Custo). Esta é a Leva 1: só o que é determinístico e
 * testável SEM certificado nem SEFAZ — a chave de acesso de 44 dígitos e
 * o seu dígito verificador (mód 11). A montagem do XML (Leva 2), a
 * assinatura/transmissão via Edge Function (Leva 3) e a DANFE/contingência
 * (Leva 4) vêm depois e dependem dos secrets do estabelecimento.
 *
 * Multi-tenant (decisão 002/028): nada aqui é específico de um
 * estabelecimento — cUF, CNPJ, série e ambiente entram como parâmetros,
 * vindos da config fiscal do tenant (tabela tenant_fiscal_config).
 *
 * Referência: Manual de Orientação do Contribuinte (MOC) NFC-e 4.00,
 * Anexo — formação da Chave de Acesso e cálculo do DV (módulo 11).
 */

// Códigos de UF do IBGE (cUF, 2 dígitos) — usados na chave de acesso.
// O cliente-alvo é o RS (43); o mapa cobre o Brasil para o white-label.
const CODIGOS_UF = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27",
  SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41",
  SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
};

/**
 * Código IBGE (cUF) da unidade federativa. Aceita a sigla em qualquer
 * caixa. Lança para UF desconhecida (erro claro > chave inválida silenciosa).
 *
 * @param {string} uf sigla da UF (ex.: "RS")
 * @returns {string} cUF de 2 dígitos (ex.: "43")
 */
export function codigoUf(uf) {
  const sigla = String(uf ?? "").trim().toUpperCase();
  const codigo = CODIGOS_UF[sigla];
  if (!codigo) throw new Error(`UF inválida para NFC-e: "${uf}".`);
  return codigo;
}

/**
 * Só os dígitos de um texto (remove máscara de CNPJ, série etc.).
 * @param {string|number} v
 * @returns {string}
 */
function apenasDigitos(v) {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Zero-padding à esquerda até `tamanho`. Lança se o valor já não couber
 * (um número de nota com mais de 9 dígitos, por ex., é erro de entrada,
 * não algo a truncar silenciosamente).
 *
 * @param {string|number} valor
 * @param {number} tamanho
 * @param {string} campo nome do campo para a mensagem de erro
 * @returns {string}
 */
function preencherZeros(valor, tamanho, campo) {
  const s = apenasDigitos(valor);
  if (s.length > tamanho) {
    throw new Error(`Campo "${campo}" excede ${tamanho} dígitos: "${valor}".`);
  }
  return s.padStart(tamanho, "0");
}

/**
 * Dígito verificador da chave de acesso (módulo 11, pesos 2..9 cíclicos
 * da direita para a esquerda). Regra da SEFAZ: resto 0 ou 1 → DV = 0.
 *
 * @param {string} chave43 os 43 primeiros dígitos da chave
 * @returns {string} o 44º dígito (DV)
 */
export function calcularDigitoVerificador(chave43) {
  const digitos = apenasDigitos(chave43);
  if (digitos.length !== 43) {
    throw new Error(`DV da chave exige 43 dígitos, recebeu ${digitos.length}.`);
  }
  let soma = 0;
  let peso = 2;
  // Da direita (menos significativo) para a esquerda.
  for (let i = digitos.length - 1; i >= 0; i--) {
    soma += Number(digitos[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto <= 1 ? 0 : 11 - resto;
  return String(dv);
}

/**
 * Monta a chave de acesso de 44 dígitos da NFC-e.
 *
 * Layout (MOC 4.00): cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9)
 * tpEmis(1) cNF(8) cDV(1) = 44.
 *
 * @param {{
 *   uf: string,               // sigla da UF do emitente (ex.: "RS")
 *   dataEmissao: Date,        // data/hora de emissão (para AAMM)
 *   cnpj: string,             // CNPJ do emitente (com ou sem máscara)
 *   modelo?: number|string,   // 65 para NFC-e (padrão)
 *   serie: number|string,     // série da nota
 *   numero: number|string,    // nNF — número sequencial da nota
 *   tpEmis?: number|string,   // 1 = emissão normal (padrão)
 *   codigoNumerico: string|number, // cNF — código numérico (8 dígitos)
 * }} p
 * @returns {string} chave de acesso de 44 dígitos
 */
export function montarChaveAcesso(p) {
  const cUF = codigoUf(p.uf);

  const data = p.dataEmissao instanceof Date ? p.dataEmissao : new Date(p.dataEmissao);
  if (Number.isNaN(data.getTime())) {
    throw new Error("dataEmissao inválida para a chave de acesso.");
  }
  const aa = String(data.getFullYear()).slice(-2);
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const aamm = `${aa}${mm}`;

  const cnpj = preencherZeros(p.cnpj, 14, "cnpj");
  const modelo = preencherZeros(p.modelo ?? 65, 2, "modelo");
  const serie = preencherZeros(p.serie, 3, "serie");
  const numero = preencherZeros(p.numero, 9, "numero");
  const tpEmis = preencherZeros(p.tpEmis ?? 1, 1, "tpEmis");
  const cNF = preencherZeros(p.codigoNumerico, 8, "codigoNumerico");

  const chave43 = `${cUF}${aamm}${cnpj}${modelo}${serie}${numero}${tpEmis}${cNF}`;
  const dv = calcularDigitoVerificador(chave43);
  return `${chave43}${dv}`;
}
