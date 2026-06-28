/**
 * Parser de NF-e (versões 3.10 e 4.00).
 * Puro, sem side effects. Usa DOMParser do browser.
 *
 * @param {string} xmlString - Conteúdo raw do arquivo XML
 * @returns {{ valido, erro, cabecalho, itens }}
 */
export function parseNFe(xmlString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");

    if (doc.querySelector("parsererror")) {
      return { valido: false, erro: "XML inválido ou corrompido.", cabecalho: null, itens: [] };
    }

    // Busca ignorando namespace (compatível com v3.10 e v4.00)
    const tag = (name, scope) => {
      const el = (scope || doc).getElementsByTagNameNS("*", name)[0]
        || (scope || doc).getElementsByTagName(name)[0];
      return el?.textContent?.trim() || "";
    };

    const infNFe = doc.getElementsByTagNameNS("*", "infNFe")[0]
      || doc.getElementsByTagName("infNFe")[0];

    if (!infNFe) {
      return { valido: false, erro: "Não é uma NF-e válida (elemento infNFe não encontrado).", cabecalho: null, itens: [] };
    }

    // Chave de acesso: atributo Id sem prefixo "NFe"
    const idAttr  = infNFe.getAttribute("Id") || "";
    const chaveAcesso = idAttr.replace(/^NFe/, "");

    const numero         = tag("nNF");
    const serie          = tag("serie");
    const dhEmi          = tag("dhEmi") || tag("dEmi");
    const dataEmissao    = dhEmi ? dhEmi.split("T")[0] : "";
    const fornecedorNome = tag("xNome");
    const fornecedorCnpj = tag("CNPJ");
    const valorTotal     = parseFloat(tag("vNF")) || 0;

    if (!numero && !fornecedorNome) {
      return { valido: false, erro: "Arquivo não reconhecido como NF-e. Verifique o formato.", cabecalho: null, itens: [] };
    }

    // Itens (elementos <det>)
    const dets = Array.from(
      doc.getElementsByTagNameNS("*", "det").length
        ? doc.getElementsByTagNameNS("*", "det")
        : doc.getElementsByTagName("det")
    );

    const itens = dets.map(det => {
      const nItem = det.getAttribute("nItem") || "";
      const prod  = det.getElementsByTagNameNS("*", "prod")[0]
        || det.getElementsByTagName("prod")[0];

      const pt = (name) => {
        const el = prod?.getElementsByTagNameNS?.("*", name)[0]
          || prod?.getElementsByTagName(name)[0];
        return el?.textContent?.trim() || "";
      };

      return {
        numero:        nItem,
        codigoXml:     pt("cProd"),
        descricaoXml:  pt("xProd"),
        unidadeXml:    pt("uCom"),
        quantidade:    parseFloat(pt("qCom"))   || 0,
        precoUnitario: parseFloat(pt("vUnCom")) || 0,
        precoTotal:    parseFloat(pt("vProd"))  || 0,
      };
    });

    return {
      valido: true,
      erro: null,
      cabecalho: { chaveAcesso, numero, serie, dataEmissao, fornecedorNome, fornecedorCnpj, valorTotal },
      itens,
    };
  } catch (e) {
    return { valido: false, erro: "Erro ao processar o XML: " + e.message, cabecalho: null, itens: [] };
  }
}
