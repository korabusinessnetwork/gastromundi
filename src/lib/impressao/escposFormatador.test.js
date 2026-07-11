import { describe, it, expect } from "vitest";
import { formatarComprovanteEscpos, formatarViaProducaoEscpos } from "./escposFormatador";
import { colunasPorLargura } from "./largura";

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
});
