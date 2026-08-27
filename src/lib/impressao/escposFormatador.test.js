import { describe, it, expect } from "vitest";
import { formatarComprovanteEscpos, formatarViaProducaoEscpos } from "./escposFormatador";
import { colunasPorLargura, colunasEscpos } from "./largura";

const identidade = { nome: "GastroMundi", logoUrl: null, endereco: "", cnpj: "", rodape: "Obrigado pela preferência!" };

function comprovante(overrides = {}) {
  return {
    identidade,
    comanda: "12",
    itens: [
      { nome: "Hambúrguer artesanal com bacon e cheddar duplo", qty: 2, preco: 32.5, emoji: "🍔", obs: ["sem cebola"] },
      { nome: "Refrigerante lata", qty: 1, preco: 6, emoji: "🥤", obs: [] },
    ],
    subtotal: 71,
    valorTaxa: 7.1,
    ajuste: null,
    valorAjuste: 0,
    total: 78.1,
    pagamentos: [{ metodo: "pix", valor: 78.1, troco: 0 }],
    trocoTotal: 0,
    naoFiscal: false,
    avisoNaoFiscal: "",
    ...overrides,
  };
}

describe("formatarComprovanteEscpos", () => {
  it("nenhuma linha excede o número de colunas do perfil", () => {
    const colunas = colunasPorLargura(80, 13);
    const linhas = formatarComprovanteEscpos(comprovante(), colunas);
    for (const linha of linhas) expect(linha.length).toBeLessThanOrEqual(colunas);
  });

  it("58mm produz mais linhas que 80mm pro mesmo pedido (papel mais estreito quebra mais)", () => {
    const colunas58 = colunasPorLargura(58, 13);
    const colunas80 = colunasPorLargura(80, 13);
    const linhas58 = formatarComprovanteEscpos(comprovante(), colunas58);
    const linhas80 = formatarComprovanteEscpos(comprovante(), colunas80);
    expect(linhas58.length).toBeGreaterThanOrEqual(linhas80.length);
  });

  it("inclui o total e o método de pagamento", () => {
    const colunas = colunasPorLargura(80, 13);
    const linhas = formatarComprovanteEscpos(comprovante(), colunas).join("\n");
    expect(linhas).toContain("TOTAL");
    expect(linhas).toContain("R$ 78.10");
    expect(linhas).toContain("Pix");
  });

  it("aviso de cupom não fiscal aparece só quando naoFiscal=true", () => {
    const colunas = colunasPorLargura(80, 13);
    const semAviso = formatarComprovanteEscpos(comprovante(), colunas).join("\n");
    expect(semAviso).not.toContain("sem valor fiscal");

    const comAviso = formatarComprovanteEscpos(
      comprovante({ naoFiscal: true, avisoNaoFiscal: "Documento sem valor fiscal — não substitui a nota fiscal." }),
      colunas
    ).join("\n");
    expect(comAviso).toContain("sem valor fiscal");
  });
});

// A comanda que sai na impressora usa as colunas do hardware (48 no papel
// de 80mm), não a conta de pixel do preview. Antes ela saía em 33 colunas:
// quebrava no meio de nomes que cabiam inteiros, gastando papel em todo
// pedido e jogando o preço da direita pra coluna errada.
describe("comanda no papel de 80mm usa as 48 colunas reais da impressora", () => {
  const PRATO = "Filé à parmegiana com fritas e arroz";
  const pedido = comprovante({
    itens: [{ nome: PRATO, qty: 1, preco: 48.9, emoji: "", obs: [] }],
    subtotal: 48.9, valorTaxa: 0, total: 48.9,
    pagamentos: [{ metodo: "pix", valor: 48.9, troco: 0 }],
  });

  it("nenhuma linha passa de 48 caracteres", () => {
    const linhas = formatarComprovanteEscpos(pedido, colunasEscpos(80));
    for (const linha of linhas) expect(linha.length).toBeLessThanOrEqual(48);
  });

  it("prato que cabe em 48 sai numa linha só — e em 33 saía quebrado", () => {
    const linhaCompleta = `1x ${PRATO}`;
    expect(linhaCompleta.length).toBeLessThanOrEqual(48);

    const em48 = formatarComprovanteEscpos(pedido, colunasEscpos(80));
    expect(em48).toContain(linhaCompleta);

    const em33 = formatarComprovanteEscpos(pedido, 33);
    expect(em33).not.toContain(linhaCompleta);
  });

  it("o TOTAL alinha à direita na coluna 48, não na 33", () => {
    const linhas = formatarComprovanteEscpos(pedido, colunasEscpos(80));
    const linhaTotal = linhas.find((l) => l.startsWith("TOTAL"));
    expect(linhaTotal).toHaveLength(48);
    expect(linhaTotal.endsWith("R$ 48.90")).toBe(true);
  });
});

describe("formatarViaProducaoEscpos", () => {
  const pedido = {
    comanda: "7",
    mesa: "3",
    garcom: "Maria",
    horario: "2026-07-06T12:00:00.000Z",
    itens: [{ nome: "Pizza Margherita", qty: 1, emoji: "🍕", obs: ["sem manjericão"] }],
  };

  it("nenhuma linha excede as colunas, em 58mm e 80mm", () => {
    for (const larguraMm of [58, 80]) {
      const colunas = colunasPorLargura(larguraMm, 15);
      const linhas = formatarViaProducaoEscpos(pedido, colunas);
      for (const linha of linhas) expect(linha.length).toBeLessThanOrEqual(colunas);
    }
  });

  it("via sem itens produzíveis avisa, não quebra", () => {
    const colunas = colunasPorLargura(80, 15);
    const linhas = formatarViaProducaoEscpos({ ...pedido, itens: [] }, colunas);
    expect(linhas.join("\n")).toContain("Nenhum item produzível");
  });

  it("inclui o apelido (complemento) quando presente, respeitando as colunas", () => {
    const colunas = colunasPorLargura(58, 15);
    const linhas = formatarViaProducaoEscpos({ ...pedido, apelido: "Mesa VIP" }, colunas);
    expect(linhas.join("\n")).toContain("Mesa VIP");
    for (const linha of linhas) expect(linha.length).toBeLessThanOrEqual(colunas);
  });

  it("sem apelido, não adiciona linha de complemento", () => {
    const colunas = colunasPorLargura(80, 15);
    const semApelido = formatarViaProducaoEscpos(pedido, colunas);
    const comApelido = formatarViaProducaoEscpos({ ...pedido, apelido: "Zé" }, colunas);
    expect(comApelido.length).toBe(semApelido.length + 1);
  });

  it("imprime o nome do ponto acima da comanda quando informado", () => {
    const colunas = colunasPorLargura(58, 15);
    const linhas = formatarViaProducaoEscpos({ ...pedido, pontoNome: "Bar" }, colunas);
    expect(linhas[0]).toContain("BAR");
    expect(linhas[1]).toContain("Comanda 7");
    for (const linha of linhas) expect(linha.length).toBeLessThanOrEqual(colunas);
  });

  it("nome de ponto longo não estoura a largura do papel", () => {
    const colunas = colunasPorLargura(58, 15);
    const linhas = formatarViaProducaoEscpos({ ...pedido, pontoNome: "Cozinha Quente do Segundo Andar Lado B" }, colunas);
    for (const linha of linhas) expect(linha.length).toBeLessThanOrEqual(colunas);
  });

  it("sem ponto informado, a via sai igual à de antes", () => {
    const colunas = colunasPorLargura(80, 15);
    const semPonto = formatarViaProducaoEscpos(pedido, colunas);
    const comPonto = formatarViaProducaoEscpos({ ...pedido, pontoNome: "Bar" }, colunas);
    expect(comPonto.length).toBe(semPonto.length + 1);
  });
});
