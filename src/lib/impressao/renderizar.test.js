import { describe, it, expect } from "vitest";
import { renderizarRecibo, renderizarViaProducao } from "./renderizar";

describe("renderizarRecibo", () => {
  const dadosBase = {
    identidade: { nome: "GastroMundi", logoUrl: null, endereco: "", cnpj: "", rodape: "Obrigado pela preferência!" },
    comanda: "12",
    itens: [{ nome: "X-Burguer", qty: 2, preco: 30, emoji: "🍔", obs: [] }],
    subtotal: 60,
    valorTaxa: 0,
    ajuste: null,
    valorAjuste: 0,
    total: 60,
    pagamentos: [{ metodo: "dinheiro", valor: 60, recebido: 60, troco: 0 }],
    trocoTotal: 0,
  };

  it("inclui o nome do tenant (identidade) no cabeçalho", () => {
    const html = renderizarRecibo(dadosBase);

    expect(html).toContain("GastroMundi");
  });

  it("usa o logo em vez do nome em texto quando logoUrl está presente", () => {
    const html = renderizarRecibo({ ...dadosBase, identidade: { ...dadosBase.identidade, logoUrl: "https://cdn/logo.png" } });

    expect(html).toContain('src="https://cdn/logo.png"');
  });

  it("inclui os itens e o total", () => {
    const html = renderizarRecibo(dadosBase);

    expect(html).toContain("X-Burguer");
    expect(html).toContain("R$ 60.00");
  });

  it("inclui o aviso de não-fiscal só quando naoFiscal é true (cupom/pré-nota)", () => {
    const semAviso = renderizarRecibo(dadosBase);
    const comAviso = renderizarRecibo({ ...dadosBase, naoFiscal: true, avisoNaoFiscal: "Documento sem valor fiscal." });

    expect(semAviso).not.toContain("Documento sem valor fiscal");
    expect(comAviso).toContain("Documento sem valor fiscal");
  });

  it("nunca lança mesmo com dados incompletos", () => {
    expect(() => renderizarRecibo({ identidade: {}, itens: [], pagamentos: [] })).not.toThrow();
  });
});

describe("renderizarViaProducao", () => {
  it("inclui os itens produzíveis, sem preço no HTML", () => {
    const html = renderizarViaProducao({
      comanda: "7", mesa: "3", garcom: "joao", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "X-Burguer", qty: 1, emoji: "🍔", obs: ["sem cebola"] }],
    });

    expect(html).toContain("X-Burguer");
    expect(html).toContain("sem cebola");
    expect(html).not.toContain("R$");
  });

  it("mostra mensagem clara quando não há itens produzíveis", () => {
    const html = renderizarViaProducao({ comanda: "7", horario: "2026-07-21T12:00:00.000Z", itens: [] });

    expect(html).toContain("Nenhum item produzível");
  });
});
