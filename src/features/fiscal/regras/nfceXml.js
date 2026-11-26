/**
 * NFC-e (modelo 65) — montagem do XML 4.00 (Leva 2).
 *
 * Continuação da Leva 1 (nfce.js, chave de acesso). Aqui montamos o XML
 * <NFe> NÃO-ASSINADO e determinístico — sem certificado, sem SEFAZ, sem
 * I/O. A assinatura (XML-DSig), o QR Code (hash CSC) e a transmissão vão
 * na Leva 3 (Edge Function, onde entram os SEGREDOS do estabelecimento).
 *
 * Multi-tenant / white-label (decisão 002/017/028): NADA aqui é de um
 * estabelecimento específico. Emitente, endereço, CRT, série, ambiente
 * entram como parâmetros vindos de tenant_fiscal_config. O grupo de ICMS
 * é escolhido pelo CRT do tenant (Simples → CSOSN, Regime Normal → CST) —
 * um cliente do Simples e um do regime normal usam o MESMO código, só
 * muda o dado. Nenhuma regra fiscal fica hardcoded numa marca.
 *
 * Referência: MOC NFC-e 4.00 (leiaute da NF-e/NFC-e, tag <infNFe>).
 * O que este módulo cobre é o conjunto mínimo VÁLIDO para NFC-e de venda
 * ao consumidor: ide, emit, det (prod + ICMS/PIS/COFINS), total, transp,
 * pag e infAdic. Casos tributários menos comuns são extensíveis pelos
 * dados de cada item (imposto.icms/pis/cofins) sem mudar este código.
 */

import { montarChaveAcesso } from "./nfce.js";

// ── Formatação (determinística, sem locale) ────────────────────────────

/** Escapa os 5 caracteres especiais de XML. Campos de texto passam aqui. */
function escaparXml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Número com N casas decimais e ponto como separador (formato SEFAZ). */
function dec(valor, casas) {
  const n = Number(valor);
  if (!Number.isFinite(n)) {
    throw new Error(`Valor numérico inválido para o XML: "${valor}".`);
  }
  return n.toFixed(casas);
}

/**
 * Núcleo de arredondamento a 2 casas half-up sem viés de ponto flutuante
 * (Math.round + Number.EPSILON) — MESMO critério de nfceItemFiscal.js.
 * Fonte ÚNICA para money() (cada <det>) e round2() (somatório dos totais):
 * item e total precisam usar EXATAMENTE o mesmo arredondamento. Em valor de
 * meio-centavo (ex.: 3 × 0,335 = 1,005), toFixed(2) e o half-up divergem
 * ("1.00" vs 1.01) — e aí Σitens não fecha com o vNF e a SEFAZ REJEITA a nota.
 */
function arred2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Valor numérico inválido para arredondamento: "${v}".`);
  }
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Valor monetário: 2 casas, half-up idêntico ao round2 do somatório. */
const money = (v) => arred2(v).toFixed(2);

/** Arredonda para 2 casas (centavos) half-up — usado no somatório dos totais
 *  (ICMSTot): cada componente do item é arredondado ANTES de somar, para que
 *  a soma bata EXATAMENTE com o que sai em cada <det> (money). */
function round2(v) {
  return Number(arred2(v).toFixed(2));
}

/** Só dígitos (remove máscara de CNPJ/CPF/CEP/telefone). */
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * Data/hora no formato UTC-offset da SEFAZ: AAAA-MM-DDThh:mm:ss±hh:mm.
 * Determinístico e independente do fuso do runner: desloca o instante
 * pelo offset informado e lê os componentes em UTC. Brasil = -180 (−03:00).
 *
 * @param {Date|string} data
 * @param {number} offsetMin offset em minutos (padrão −180 = −03:00)
 */
function formatarDataHora(data, offsetMin = -180) {
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) {
    throw new Error("dataEmissao inválida para o XML da NFC-e.");
  }
  const local = new Date(d.getTime() + offsetMin * 60000);
  const p = (n, c = 2) => String(n).padStart(c, "0");
  const sinal = offsetMin <= 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const off = `${sinal}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
  return (
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}${off}`
  );
}

// ── Montadores de tag ──────────────────────────────────────────────────

/** <tag>conteúdo</tag>. Texto é escapado; conteúdo já-XML use tagCrua. */
function tag(nome, conteudo) {
  return `<${nome}>${escaparXml(conteudo)}</${nome}>`;
}

/** <tag>...</tag> com conteúdo que JÁ é XML (filhos), sem escapar. */
function tagCrua(nome, filhosXml) {
  return `<${nome}>${filhosXml}</${nome}>`;
}

/** Tag opcional: string vazia se o valor for null/undefined/"". */
function tagOpc(nome, conteudo) {
  if (conteudo === null || conteudo === undefined || conteudo === "") return "";
  return tag(nome, conteudo);
}

// ── Grupos tributários ─────────────────────────────────────────────────

/**
 * Grupo de ICMS do item, escolhido pelo CRT do emitente:
 *   CRT 1 ou 2 (Simples Nacional)  → ICMSSN (CSOSN)
 *   CRT 3 (Regime Normal)          → ICMS   (CST)
 *
 * Os valores (orig, csosn/cst, base, alíquota) vêm de `icms` no item —
 * o builder não inventa tributação, só monta o grupo certo do jeito certo.
 *
 * @param {1|2|3} crt
 * @param {object} icms { orig, csosn?, cst?, modBC?, vBC?, pICMS?, vICMS?, pCredSN?, vCredICMSSN? }
 */
export function grupoIcms(crt, icms = {}) {
  const orig = tag("orig", icms.orig ?? 0);

  // ── Simples Nacional: ICMSSN{CSOSN} ──
  if (crt === 1 || crt === 2) {
    const csosn = String(icms.csosn ?? "").padStart(3, "0");
    if (!csosn || csosn === "000") {
      throw new Error("Simples Nacional (CRT 1/2) exige o CSOSN no item.");
    }
    // 101/201: com permissão de crédito → carrega pCredSN + vCredICMSSN.
    if (csosn === "101" || csosn === "201") {
      const dentro =
        orig +
        tag("CSOSN", csosn) +
        tag("pCredSN", dec(icms.pCredSN ?? 0, 4)) +
        tag("vCredICMSSN", money(icms.vCredICMSSN ?? 0));
      return tagCrua("ICMS", tagCrua(`ICMSSN${csosn}`, dentro));
    }
    // 102/103/300/400 (e afins): sem base/valor de ICMS → só orig + CSOSN.
    const dentro = orig + tag("CSOSN", csosn);
    return tagCrua("ICMS", tagCrua(`ICMSSN${csosn}`, dentro));
  }

  // ── Regime Normal (CRT 3): ICMS{CST} ──
  if (icms.cst === null || icms.cst === undefined || String(icms.cst) === "") {
    throw new Error("Regime Normal (CRT 3) exige o CST de ICMS no item.");
  }
  const cst = String(icms.cst).padStart(2, "0");
  // 00: tributado integralmente → base, alíquota e valor.
  if (cst === "00") {
    const dentro =
      orig +
      tag("CST", cst) +
      tag("modBC", icms.modBC ?? 3) +
      tag("vBC", money(icms.vBC ?? 0)) +
      tag("pICMS", dec(icms.pICMS ?? 0, 4)) +
      tag("vICMS", money(icms.vICMS ?? 0));
    return tagCrua("ICMS", tagCrua("ICMS00", dentro));
  }
  // 40/41/50/60 (isento/não-tributado/diferido/ST): só orig + CST.
  const dentro = orig + tag("CST", cst);
  return tagCrua("ICMS", tagCrua(`ICMS${cst}`, dentro));
}

/**
 * Grupo de PIS do item. NFC-e exige PIS e COFINS. Padrão seguro para
 * homologação/Simples: CST de "não tributada" (07/08/09) → só o CST.
 * Alíquota (01/02) → base, alíquota e valor.
 */
function grupoPis(pis = {}) {
  const cst = String(pis.cst ?? "07").padStart(2, "0");
  if (cst === "01" || cst === "02") {
    const dentro =
      tag("CST", cst) +
      tag("vBC", money(pis.vBC ?? 0)) +
      tag("pPIS", dec(pis.pPIS ?? 0, 4)) +
      tag("vPIS", money(pis.vPIS ?? 0));
    return tagCrua("PIS", tagCrua("PISAliq", dentro));
  }
  return tagCrua("PIS", tagCrua("PISNT", tag("CST", cst)));
}

/** Grupo de COFINS do item (espelha o PIS). */
function grupoCofins(cofins = {}) {
  const cst = String(cofins.cst ?? "07").padStart(2, "0");
  if (cst === "01" || cst === "02") {
    const dentro =
      tag("CST", cst) +
      tag("vBC", money(cofins.vBC ?? 0)) +
      tag("pCOFINS", dec(cofins.pCOFINS ?? 0, 4)) +
      tag("vCOFINS", money(cofins.vCOFINS ?? 0));
    return tagCrua("COFINS", tagCrua("COFINSAliq", dentro));
  }
  return tagCrua("COFINS", tagCrua("COFINSNT", tag("CST", cst)));
}

// ── Itens e totais ─────────────────────────────────────────────────────

/** Um <det nItem="i"> completo (prod + imposto). */
function montarDet(item, indice, crt) {
  const qCom = Number(item.qCom);
  const vUn = Number(item.vUnCom);
  if (!Number.isFinite(qCom) || qCom <= 0) {
    throw new Error(`Item ${indice}: quantidade (qCom) inválida.`);
  }
  if (!Number.isFinite(vUn) || vUn < 0) {
    throw new Error(`Item ${indice}: valor unitário (vUnCom) inválido.`);
  }
  const vProd = item.vProd != null ? Number(item.vProd) : qCom * vUn;

  const prod =
    tag("cProd", item.cProd ?? indice) +
    tag("cEAN", item.cEAN || "SEM GTIN") +
    tag("xProd", item.xProd) +
    tag("NCM", item.ncm) +
    tag("CFOP", item.cfop) +
    tag("uCom", item.uCom || "UN") +
    tag("qCom", dec(qCom, 4)) +
    tag("vUnCom", dec(vUn, 10)) +
    tag("vProd", money(vProd)) +
    tag("cEANTrib", item.cEANTrib || item.cEAN || "SEM GTIN") +
    tag("uTrib", item.uTrib || item.uCom || "UN") +
    tag("qTrib", dec(item.qTrib ?? qCom, 4)) +
    tag("vUnTrib", dec(item.vUnTrib ?? vUn, 10)) +
    tagOpc("vDesc", item.vDesc != null ? money(item.vDesc) : "") +
    tag("indTot", item.indTot ?? 1);

  const imposto =
    grupoIcms(crt, item.icms) + grupoPis(item.pis) + grupoCofins(item.cofins);

  return `<det nItem="${indice}">${tagCrua("prod", prod)}${tagCrua("imposto", imposto)}</det>`;
}

/** Somatório dos totais (ICMSTot) a partir dos itens já normalizados. */
function montarTotal(itens) {
  let vProd = 0, vDesc = 0, vBC = 0, vICMS = 0, vPIS = 0, vCOFINS = 0;
  for (const it of itens) {
    const q = Number(it.qCom);
    const vp = it.vProd != null ? Number(it.vProd) : q * Number(it.vUnCom);
    // Arredonda CADA componente do item a 2 casas ANTES de acumular — o mesmo
    // valor (money) que sai no <det>. Assim Σitens == total (a SEFAZ exige que
    // vProd/vDesc/vNF fechem com a soma dos itens; centavo de folga = rejeição).
    vProd += round2(vp);
    vDesc += round2(it.vDesc ?? 0);
    vBC += round2(it.icms?.vBC ?? 0);
    vICMS += round2(it.icms?.vICMS ?? 0);
    vPIS += round2(it.pis?.vPIS ?? 0);
    vCOFINS += round2(it.cofins?.vCOFINS ?? 0);
  }
  // Fecha os acumuladores em 2 casas (mata a poeira de ponto flutuante da soma)
  // e deriva o vNF já arredondado — vNF = Σvprod − Σvdesc, exato ao centavo.
  vProd = round2(vProd);
  vDesc = round2(vDesc);
  vBC = round2(vBC);
  vICMS = round2(vICMS);
  vPIS = round2(vPIS);
  vCOFINS = round2(vCOFINS);
  const vNF = round2(vProd - vDesc);
  const icmsTot =
    tag("vBC", money(vBC)) +
    tag("vICMS", money(vICMS)) +
    tag("vICMSDeson", money(0)) +
    tag("vFCP", money(0)) +
    tag("vBCST", money(0)) +
    tag("vST", money(0)) +
    tag("vFCPST", money(0)) +
    tag("vFCPSTRet", money(0)) +
    tag("vProd", money(vProd)) +
    tag("vFrete", money(0)) +
    tag("vSeg", money(0)) +
    tag("vDesc", money(vDesc)) +
    tag("vII", money(0)) +
    tag("vIPI", money(0)) +
    tag("vIPIDevol", money(0)) +
    tag("vPIS", money(vPIS)) +
    tag("vCOFINS", money(vCOFINS)) +
    tag("vOutro", money(0)) +
    tag("vNF", money(vNF));
  return { xml: tagCrua("total", tagCrua("ICMSTot", icmsTot)), vNF };
}

// ── Documento completo ─────────────────────────────────────────────────

/**
 * Monta o XML <NFe> NÃO-ASSINADO da NFC-e (modelo 65), com a chave de
 * acesso no atributo Id de <infNFe> (formato "NFe" + 44 dígitos).
 *
 * @param {{
 *   ide: { serie:number, numero:number, dataEmissao:Date, codigoNumerico:(string|number),
 *          tpAmb?:1|2, cMunFG?:string, natOp?:string, tpEmis?:number, offsetMin?:number, verProc?:string },
 *   emit: { cnpj:string, xNome:string, xFant?:string, ie:string, crt:1|2|3,
 *           uf:string, cMun:string, xMun:string, xLgr:string, nro:string,
 *           xBairro:string, cep:string, fone?:string },
 *   dest?: { cpf?:string, cnpj?:string, xNome?:string },
 *   itens: Array<object>,
 *   pagamentos: Array<{ tPag:string, vPag:number, vTroco?:number }>,
 *   infoAdic?: { infCpl?:string }
 * }} dados
 * @returns {{ xml:string, chave:string }}
 */
export function montarXmlNfce(dados) {
  const { ide, emit, dest, itens, pagamentos, infoAdic } = dados ?? {};

  if (!emit?.crt || ![1, 2, 3].includes(Number(emit.crt))) {
    throw new Error("emit.crt (regime tributário 1/2/3) é obrigatório.");
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("A NFC-e precisa de ao menos um item.");
  }
  if (!Array.isArray(pagamentos) || pagamentos.length === 0) {
    throw new Error("A NFC-e precisa de ao menos uma forma de pagamento.");
  }
  const crt = Number(emit.crt);
  const tpAmb = ide.tpAmb ?? 2; // 2 = homologação (seguro por padrão)
  const tpEmis = ide.tpEmis ?? 1;

  // Chave de acesso (Leva 1) — dela derivamos cUF, cNF e cDV do ide.
  const chave = montarChaveAcesso({
    uf: emit.uf,
    dataEmissao: ide.dataEmissao,
    cnpj: emit.cnpj,
    modelo: 65,
    serie: ide.serie,
    numero: ide.numero,
    tpEmis,
    codigoNumerico: ide.codigoNumerico,
  });
  const cUF = chave.slice(0, 2);
  const cNF = chave.slice(35, 43);
  const cDV = chave[43];
  const cMunFG = ide.cMunFG || emit.cMun;

  // ── ide ──
  const ideXml = tagCrua(
    "ide",
    tag("cUF", cUF) +
      tag("cNF", cNF) +
      tag("natOp", ide.natOp || "VENDA AO CONSUMIDOR") +
      tag("mod", 65) +
      tag("serie", ide.serie) +
      tag("nNF", ide.numero) +
      tag("dhEmi", formatarDataHora(ide.dataEmissao, ide.offsetMin ?? -180)) +
      tag("tpNF", 1) + // 1 = saída
      tag("idDest", 1) + // 1 = operação interna
      tag("cMunFG", cMunFG) +
      tag("tpImp", 4) + // 4 = DANFE NFC-e
      tag("tpEmis", tpEmis) +
      tag("cDV", cDV) +
      tag("tpAmb", tpAmb) +
      tag("finNFe", 1) + // 1 = normal
      tag("indFinal", 1) + // 1 = consumidor final
      tag("indPres", 1) + // 1 = presencial
      tag("procEmi", 0) +
      tag("verProc", ide.verProc || "GastroMundi"),
  );

  // ── emit ──
  const enderEmit = tagCrua(
    "enderEmit",
    tag("xLgr", emit.xLgr) +
      tag("nro", emit.nro || "S/N") +
      tag("xBairro", emit.xBairro) +
      tag("cMun", emit.cMun) +
      tag("xMun", emit.xMun) +
      tag("UF", emit.uf) +
      tag("CEP", soDigitos(emit.cep)) +
      tag("cPais", "1058") +
      tag("xPais", "BRASIL") +
      tagOpc("fone", emit.fone ? soDigitos(emit.fone) : ""),
  );
  const emitXml = tagCrua(
    "emit",
    tag("CNPJ", soDigitos(emit.cnpj)) +
      tag("xNome", emit.xNome) +
      tagOpc("xFant", emit.xFant) +
      enderEmit +
      tag("IE", soDigitos(emit.ie)) +
      tag("CRT", crt),
  );

  // ── dest (opcional na NFC-e: só se houver CPF/CNPJ do consumidor) ──
  let destXml = "";
  if (dest && (dest.cpf || dest.cnpj)) {
    const doc = dest.cpf
      ? tag("CPF", soDigitos(dest.cpf))
      : tag("CNPJ", soDigitos(dest.cnpj));
    destXml = tagCrua(
      "dest",
      doc +
        tagOpc("xNome", dest.xNome) +
        // indIEDest 9 = não contribuinte (consumidor final típico).
        tag("indIEDest", 9),
    );
  }

  // ── det (itens) ──
  const detXml = itens.map((it, i) => montarDet(it, i + 1, crt)).join("");

  // ── total ──
  const { xml: totalXml } = montarTotal(itens);

  // ── transp (sem frete na NFC-e presencial) ──
  const transpXml = tagCrua("transp", tag("modFrete", 9)); // 9 = sem transporte

  // ── pag (obrigatório) ──
  const pagXml = tagCrua(
    "pag",
    pagamentos
      .map((p) =>
        tagCrua(
          "detPag",
          tag("tPag", String(p.tPag).padStart(2, "0")) + tag("vPag", money(p.vPag)),
        ),
      )
      .join("") +
      (pagamentos.some((p) => p.vTroco)
        ? tag("vTroco", money(pagamentos.reduce((s, p) => s + Number(p.vTroco ?? 0), 0)))
        : ""),
  );

  // ── infAdic (opcional) ──
  const infAdicXml = infoAdic?.infCpl
    ? tagCrua("infAdic", tag("infCpl", infoAdic.infCpl))
    : "";

  const infNFe =
    `<infNFe Id="NFe${chave}" versao="4.00">` +
    ideXml +
    emitXml +
    destXml +
    detXml +
    totalXml +
    transpXml +
    pagXml +
    infAdicXml +
    `</infNFe>`;

  const xml = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${infNFe}</NFe>`;
  return { xml, chave };
}
