/**
 * NFC-e (modelo 65) — DANFE do cupom (Leva 4, parte pura/testável).
 *
 * A DANFE NFC-e é o comprovante impresso que o consumidor leva. Aqui está
 * só a MONTAGEM DA ESTRUTURA de dados do cupom — determinística, sem I/O,
 * sem React, sem certificado. Quem renderiza é o componente <CupomNfce>
 * (CupomNfce.jsx), que recebe exatamente o que esta função devolve. Assim
 * o layout é testável como dado antes de virar pixel (Princípio nº1:
 * intuitivo; e a lógica do cupom não fica presa no JSX — decisão 018).
 *
 * Multi-tenant / white-label (decisão 002/017/028): nada aqui é de um
 * estabelecimento específico — emitente, itens, pagamentos e ambiente
 * entram como parâmetros vindos da venda e de tenant_fiscal_config.
 *
 * FRONTEIRA DE SEGREDO intacta: esta função NÃO toca no certificado nem no
 * CSC. O `urlQrCode`, quando presente, já vem PRONTO da Leva 3
 * (montarQrCodeNfce, que recebe o CSC como parâmetro no servidor) — aqui
 * ele é só um texto a exibir. Sem `urlQrCode` (nota ainda não autorizada),
 * o cupom mostra o estado "pendente", não inventa QR.
 *
 * Referência: MOC NFC-e 4.00 (leiaute do DANFE NFC-e) e a legislação de
 * cada UF quanto aos dizeres legais do consumidor.
 */

// Rótulos das formas de pagamento (tPag da SEFAZ → texto do dia a dia do
// caixa). Cobre os meios usados no varejo/restaurante; o resto cai em
// "Outros" sem quebrar o cupom (nunca esconde um pagamento).
const ROTULO_PAGAMENTO = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de crédito",
  "04": "Cartão de débito",
  "05": "Crédito na loja",
  "10": "Vale alimentação",
  "11": "Vale refeição",
  "12": "Vale presente",
  "13": "Vale combustível",
  "15": "Boleto",
  "17": "PIX",
  "18": "Carteira digital",
  "19": "Cashback",
  "90": "Sem pagamento",
  "99": "Outros",
};

/** Número → string monetária "1234.50" → "1.234,50" (pt-BR, determinístico). */
function moedaBR(valor) {
  const n = Number(valor);
  const seguro = Number.isFinite(n) ? n : 0;
  const [inteiro, centavos] = seguro.toFixed(2).split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${comMilhar},${centavos}`;
}

/** Quantidade com até 4 casas, sem zeros à direita supérfluos (3, 1,5, 0,25). */
function quantidadeBR(valor) {
  const n = Number(valor);
  const seguro = Number.isFinite(n) ? n : 0;
  return seguro
    .toFixed(4)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

/**
 * Formata a chave de acesso de 44 dígitos em 11 grupos de 4 (padrão do
 * cupom, facilita a digitação manual na consulta). Aceita chave com ou
 * sem máscara; ignora o que não for dígito.
 *
 * @param {string} chave
 * @returns {string} "4326 0712 ... " (grupos de 4) ou "" se inválida
 */
export function formatarChaveEmGrupos(chave) {
  const digitos = String(chave ?? "").replace(/\D/g, "");
  if (digitos.length !== 44) return "";
  return digitos.match(/.{1,4}/g).join(" ");
}

/**
 * Monta a estrutura de dados do cupom (DANFE NFC-e) pronta para render.
 *
 * @param {{
 *   emit: { xNome?:string, xFant?:string, cnpj?:string, ie?:string,
 *           xLgr?:string, nro?:string, xBairro?:string, xMun?:string, uf?:string },
 *   dest?: { cpf?:string, cnpj?:string, xNome?:string } | null,
 *   itens: Array<{ cProd?:string, xProd:string, qCom:number, uCom?:string,
 *                  vUnCom:number, vProd?:number, vDesc?:number }>,
 *   pagamentos: Array<{ tPag:string, vPag:number, vTroco?:number }>,
 *   chave: string,
 *   protocolo?: string|null,     // nProt — presente só na nota AUTORIZADA
 *   urlQrCode?: string|null,     // já pronto (Leva 3) ou ausente (pendente)
 *   tpAmb: 1|2|string,           // 1 = produção, 2 = homologação
 *   tpEmis?: 1|9|string,         // 9 = contingência offline
 *   dataEmissao?: Date|string,   // dhEmi (fallback: agora)
 *   dataAutorizacao?: Date|string|null, // dhRecbto do protocolo
 * }} dados
 * @returns {object} estrutura do cupom (ver campos abaixo)
 */
export function montarDanfeNfce(dados) {
  const {
    emit = {},
    dest = null,
    itens = [],
    pagamentos = [],
    chave = "",
    protocolo = null,
    urlQrCode = null,
    tpAmb,
    tpEmis = 1,
    dataEmissao,
    dataAutorizacao = null,
  } = dados ?? {};

  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("A DANFE NFC-e precisa de ao menos um item.");
  }
  if (!Array.isArray(pagamentos) || pagamentos.length === 0) {
    throw new Error("A DANFE NFC-e precisa de ao menos uma forma de pagamento.");
  }

  const amb = String(tpAmb ?? "");
  const homologacao = amb === "2";
  const contingencia = String(tpEmis) === "9";

  // ── Itens (linhas prontas para a tabela do cupom) ──
  let totalItens = 0;
  let valorProdutos = 0;
  let valorDesconto = 0;
  const linhasItens = itens.map((it, i) => {
    const qtd = Number(it.qCom) || 0;
    const unit = Number(it.vUnCom) || 0;
    const bruto = it.vProd != null ? Number(it.vProd) : qtd * unit;
    const desc = Number(it.vDesc ?? 0) || 0;
    totalItens += 1;
    valorProdutos += bruto;
    valorDesconto += desc;
    return {
      indice: i + 1,
      codigo: String(it.cProd ?? i + 1),
      descricao: String(it.xProd ?? ""),
      quantidade: quantidadeBR(qtd),
      unidade: String(it.uCom || "UN"),
      valorUnitario: moedaBR(unit),
      valorTotal: moedaBR(bruto),
    };
  });
  const valorTotal = valorProdutos - valorDesconto;

  // ── Pagamentos + troco ──
  const linhasPagamentos = pagamentos.map((p) => {
    const codigo = String(p.tPag ?? "").padStart(2, "0");
    return {
      rotulo: ROTULO_PAGAMENTO[codigo] ?? "Outros",
      valor: moedaBR(p.vPag),
    };
  });
  const totalTroco = pagamentos.reduce((s, p) => s + (Number(p.vTroco) || 0), 0);

  // ── Consumidor (identificado x anônimo) ──
  const docConsumidor = dest?.cpf || dest?.cnpj || null;
  const consumidor = docConsumidor
    ? {
        identificado: true,
        documento: docConsumidor,
        nome: dest?.xNome || null,
      }
    : { identificado: false, texto: "CONSUMIDOR NÃO IDENTIFICADO" };

  // ── Autorização (protocolo) x pendente ──
  const autorizada = Boolean(protocolo);

  // ── Dizeres legais + avisos ──
  const avisos = [];
  if (homologacao) {
    avisos.push("EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL");
  }
  if (contingencia) {
    avisos.push(
      "EMITIDA EM CONTINGÊNCIA OFFLINE — AGUARDANDO AUTORIZAÇÃO DA SEFAZ",
    );
  }
  if (!autorizada) {
    avisos.push("DOCUMENTO PENDENTE DE AUTORIZAÇÃO");
  }

  return {
    // Cabeçalho do emitente
    emitente: {
      nome: emit.xFant || emit.xNome || "",
      razaoSocial: emit.xNome || "",
      cnpj: emit.cnpj || "",
      ie: emit.ie || "",
      endereco: [
        [emit.xLgr, emit.nro].filter(Boolean).join(", "),
        emit.xBairro,
        [emit.xMun, emit.uf].filter(Boolean).join("/"),
      ]
        .filter(Boolean)
        .join(" - "),
    },

    // Corpo
    itens: linhasItens,
    totais: {
      quantidadeItens: totalItens,
      valorProdutos: moedaBR(valorProdutos),
      valorDesconto: moedaBR(valorDesconto),
      temDesconto: valorDesconto > 0,
      valorTotal: moedaBR(valorTotal),
    },
    pagamentos: linhasPagamentos,
    troco: totalTroco > 0 ? moedaBR(totalTroco) : null,

    // Consumidor
    consumidor,

    // Chave / QR / protocolo
    ambiente: homologacao ? "homologacao" : "producao",
    contingencia,
    tpEmis: String(tpEmis),
    chaveAcesso: String(chave ?? "").replace(/\D/g, ""),
    chaveFormatada: formatarChaveEmGrupos(chave),
    urlQrCode: urlQrCode || null,
    mostrarQrCode: Boolean(urlQrCode),

    autorizada,
    estado: autorizada ? "autorizada" : "pendente",
    protocolo: protocolo || null,
    dataEmissao: dataEmissao ? new Date(dataEmissao).toISOString() : null,
    dataAutorizacao: dataAutorizacao ? new Date(dataAutorizacao).toISOString() : null,

    // Avisos legais (tarjas)
    avisos,
    textoLegal:
      "Consulte pela Chave de Acesso em " +
      "www.nfce.fazenda.gov.br ou no aplicativo da SEFAZ do seu estado.",
  };
}
