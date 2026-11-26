/**
 * NFC-e (modelo 65) — enriquece um item da venda com os DADOS FISCAIS DO
 * PRODUTO (Leva 5, pura/testável). Liga o cadastro `itens_fiscal` (uma
 * linha por produto) ao que o montador do XML (`montarDet`, nfceXml.js)
 * exige por item: NCM, CFOP e os grupos icms/pis/cofins.
 *
 * DIVISÃO DE VERDADE (por que existe):
 *   - nfceVenda.js mapeia o que a VENDA tem (nome, qtd, preço). NÃO inventa
 *     tributação — deixa o grupo fiscal de fora (ponto de extensão).
 *   - AQUI entra o cadastro fiscal do PRODUTO. É o encaixe daquele ponto.
 *
 * O GRUPO DE ICMS é escolhido pelo CRT do EMITENTE (tenant_fiscal_config),
 * não pelo regime por produto: Simples (CRT 1/2) → CSOSN; Regime Normal
 * (CRT 3) → CST. Um cliente do Simples e um do Normal usam o MESMO código,
 * só muda o dado — nada de marca/estabelecimento hardcoded (white-label).
 *
 * PREVENÇÃO DE ERRO > ERRO (CLAUDE.md, Princípio nº1): se faltar um campo
 * que a NFC-e exige pro regime (NCM, CFOP, CSOSN no Simples, CST no
 * Normal), lança Error nomeando o campo — quem chama barra a emissão ANTES
 * de consumir número/ir à SEFAZ, e mostra ao operador o que cadastrar.
 *
 * FRONTEIRA DE SEGREDO intacta: nada aqui depende do certificado A1 nem do
 * CSC. É só transformação determinística de dado fiscal → grupo do XML.
 */

// ── Formatação determinística (sem locale) ─────────────────────────────

/** Arredonda para 2 casas (valor monetário) sem viés de ponto flutuante. */
function money2(v) {
  return Number((Math.round((Number(v) + Number.EPSILON) * 100) / 100).toFixed(2));
}

/** Percentual do cadastro (aceita "18", "18,00", 18) → número. */
function pct(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Campo de código: trim, string vazia vira null. */
function texto(v) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

// ── Mapeador ───────────────────────────────────────────────────────────

/**
 * Constrói os campos fiscais do item para o `montarDet` a partir de uma
 * linha de `itens_fiscal` e do contexto da venda.
 *
 * @param {{
 *   ncm?:string, cfop?:string, cest?:string, origem_mercadoria?:string,
 *   csosn?:string, cst_icms?:string, aliquota_icms?:number|string,
 *   reducao_base_icms?:number|string,
 *   cst_pis?:string, aliquota_pis?:number|string,
 *   cst_cofins?:string, aliquota_cofins?:number|string
 * }} fiscal  linha de itens_fiscal do produto
 * @param {{ crt:1|2|3, qCom:number, vUnCom:number, vProd?:number }} contexto
 * @returns {{ ncm:string, cfop:string, cest?:string, icms:object, pis:object, cofins:object }}
 * @throws {Error} com mensagem clara quando falta campo obrigatório do regime
 */
export function montarItemFiscal(fiscal = {}, contexto = {}) {
  const crt = Number(contexto.crt);
  if (![1, 2, 3].includes(crt)) {
    throw new Error("Contexto fiscal inválido: CRT do emitente (1, 2 ou 3) é obrigatório.");
  }

  const ncm = texto(fiscal.ncm);
  const cfop = texto(fiscal.cfop);
  if (!ncm) throw new Error("Cadastro fiscal incompleto: falta o NCM do produto.");
  if (!cfop) throw new Error("Cadastro fiscal incompleto: falta o CFOP do produto.");

  const qCom = Number(contexto.qCom ?? 1) || 1;
  const vUnCom = Number(contexto.vUnCom ?? 0) || 0;
  const vProd = contexto.vProd != null ? Number(contexto.vProd) : money2(qCom * vUnCom);

  const orig = Number(fiscal.origem_mercadoria ?? 0) || 0;
  const aliqIcms = pct(fiscal.aliquota_icms);
  const reducao = pct(fiscal.reducao_base_icms);

  const icms = montarIcms({ crt, fiscal, orig, aliqIcms, reducao, vProd });
  const pis = montarPisCofins(fiscal.cst_pis, fiscal.aliquota_pis, vProd);
  const cofins = montarPisCofins(fiscal.cst_cofins, fiscal.aliquota_cofins, vProd);

  const resultado = { ncm, cfop, icms, pis, cofins };
  const cest = texto(fiscal.cest);
  if (cest) resultado.cest = cest;
  return resultado;
}

/**
 * Grupo de ICMS conforme o CRT. Simples → CSOSN (101/201 carregam crédito);
 * Normal → CST (00 carrega base/alíquota/valor calculados). Valida a
 * presença do código obrigatório do regime.
 */
function montarIcms({ crt, fiscal, orig, aliqIcms, reducao, vProd }) {
  // ── Simples Nacional (CRT 1/2): CSOSN ──
  if (crt === 1 || crt === 2) {
    const csosn = texto(fiscal.csosn);
    if (!csosn) {
      throw new Error("Cadastro fiscal incompleto: falta o CSOSN (Simples Nacional) do produto.");
    }
    const icms = { orig, csosn };
    // 101/201: com permissão de crédito → informa o percentual e o valor.
    if (csosn === "101" || csosn === "201") {
      icms.pCredSN = aliqIcms;
      icms.vCredICMSSN = money2((vProd * aliqIcms) / 100);
    }
    return icms;
  }

  // ── Regime Normal (CRT 3): CST ──
  const cst = texto(fiscal.cst_icms);
  if (!cst) {
    throw new Error("Cadastro fiscal incompleto: falta o CST de ICMS (Regime Normal) do produto.");
  }
  const icms = { orig, cst };
  // 00: tributado integralmente → base de cálculo (com redução), alíquota
  // e valor, todos determinísticos a partir de vProd.
  if (cst === "00") {
    const vBC = money2(vProd * (1 - reducao / 100));
    icms.modBC = 3; // 3 = valor da operação
    icms.vBC = vBC;
    icms.pICMS = aliqIcms;
    icms.vICMS = money2((vBC * aliqIcms) / 100);
  }
  return icms;
}

/**
 * Grupo de PIS/COFINS. CST tributado (01/02) → base/alíquota/valor;
 * demais CST → só o CST (não tributado/isento/suspenso). Sem CST cadastrado
 * cai no padrão seguro "07" (isenta) — mesmo default do montador do XML.
 */
function montarPisCofins(cstBruto, aliquotaBruta, vProd) {
  const cst = texto(cstBruto) ?? "07";
  const aliquota = pct(aliquotaBruta);
  if (cst === "01" || cst === "02") {
    return { cst, vBC: money2(vProd), pPIS: aliquota, pCOFINS: aliquota, vPIS: money2((vProd * aliquota) / 100), vCOFINS: money2((vProd * aliquota) / 100) };
  }
  return { cst };
}
