import { describe, it, expect, vi, beforeEach } from "vitest";

const imprimirBrutoMock = vi.fn(() => Promise.resolve());
vi.mock("../../qztray", () => ({ imprimirBruto: (...args) => imprimirBrutoMock(...args) }));

const { imprimir } = await import("./escposQzTray");

const documentoComprovante = {
  tipo: "comprovante",
  identidade: { nome: "GastroMundi", logoUrl: null, endereco: "", cnpj: "", rodape: "" },
  comanda: "1",
  itens: [{ nome: "Água", qty: 1, preco: 5, emoji: "", obs: [] }],
  subtotal: 5, valorTaxa: 0, ajuste: null, valorAjuste: 0, total: 5,
  pagamentos: [{ metodo: "dinheiro", valor: 5, troco: 0 }], trocoTotal: 0,
  naoFiscal: false, avisoNaoFiscal: "",
};

beforeEach(() => { imprimirBrutoMock.mockClear(); });

describe("driver escpos-qztray", () => {
  it("erro claro quando o perfil não tem impressora QZ selecionada", async () => {
    const { error } = await imprimir(documentoComprovante, { driver: "escpos-qztray" });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/nenhuma impressora/i);
    expect(imprimirBrutoMock).not.toHaveBeenCalled();
  });

  it("imprime via qztray.imprimirBruto quando a impressora está configurada", async () => {
    const perfil = { driver: "escpos-qztray", impressoraQz: "EPSON-TM20", larguraMm: 80 };
    const { error } = await imprimir(documentoComprovante, perfil);
    expect(error).toBeNull();
    expect(imprimirBrutoMock).toHaveBeenCalledTimes(1);
    const [nomeImpressora, linhas] = imprimirBrutoMock.mock.calls[0];
    expect(nomeImpressora).toBe("EPSON-TM20");
    expect(Array.isArray(linhas)).toBe(true);
    expect(linhas.join("\n")).toContain("TOTAL");
  });

  it("58mm produz colunas mais estreitas que 80mm (linhas de texto, não CSS)", async () => {
    const base = { driver: "escpos-qztray", impressoraQz: "EPSON-TM20" };
    await imprimir(documentoComprovante, { ...base, larguraMm: 58 });
    const linhas58 = imprimirBrutoMock.mock.calls[0][1];
    imprimirBrutoMock.mockClear();
    await imprimir(documentoComprovante, { ...base, larguraMm: 80 });
    const linhas80 = imprimirBrutoMock.mock.calls[0][1];

    const maiorLinha58 = Math.max(...linhas58.map(l => l.length));
    const maiorLinha80 = Math.max(...linhas80.map(l => l.length));
    expect(maiorLinha58).toBeLessThan(maiorLinha80);
  });

  it("cortaPapel=false não acrescenta o avanço extra de linhas do fim", async () => {
    const base = { driver: "escpos-qztray", impressoraQz: "EPSON-TM20", larguraMm: 80 };
    await imprimir(documentoComprovante, { ...base, cortaPapel: true });
    const comCorte = imprimirBrutoMock.mock.calls[0][1].length;
    imprimirBrutoMock.mockClear();
    await imprimir(documentoComprovante, { ...base, cortaPapel: false });
    const semCorte = imprimirBrutoMock.mock.calls[0][1].length;

    expect(comCorte).toBeGreaterThan(semCorte);
  });

  it("captura erro do qztray e devolve como {error}, sem lançar", async () => {
    imprimirBrutoMock.mockImplementationOnce(() => Promise.reject(new Error("QZ Tray não encontrado")));
    const { error } = await imprimir(documentoComprovante, { driver: "escpos-qztray", impressoraQz: "X" });
    expect(error?.message).toBe("QZ Tray não encontrado");
  });
});
