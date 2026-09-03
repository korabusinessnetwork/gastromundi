import { describe, it, expect, vi, beforeEach } from "vitest";

const enviarImpressaoPonteMock = vi.fn(async () => ({ data: { id: "abc", estado: "na_fila" }, error: null }));
vi.mock("../../ponte", () => ({ enviarImpressaoPonte: (...args) => enviarImpressaoPonteMock(...args) }));

const { imprimir } = await import("./escposPonte");

const IMPRESSORA_WINDOWS = { tipo: "windows", nome: "EPSON TM-T20" };

const documentoComprovante = {
  tipo: "comprovante",
  identidade: { nome: "GastroMundi", logoUrl: null, endereco: "", cnpj: "", rodape: "" },
  comanda: "1",
  itens: [{ nome: "Água", qty: 1, preco: 5, emoji: "", obs: [] }],
  subtotal: 5, valorTaxa: 0, ajuste: null, valorAjuste: 0, total: 5,
  pagamentos: [{ metodo: "dinheiro", valor: 5, troco: 0 }], trocoTotal: 0,
  naoFiscal: false, avisoNaoFiscal: "",
};

const documentoProducao = {
  tipo: "via_producao",
  comanda: "7",
  apelido: null,
  mesa: "3",
  garcom: "joao",
  horario: "2026-07-26T18:00:00.000Z",
  itens: [{ nome: "X-Burguer", qty: 2, emoji: "🍔", obs: ["sem cebola"] }],
};

function trabalhoEnviado() {
  return enviarImpressaoPonteMock.mock.calls[0][0];
}

beforeEach(() => {
  enviarImpressaoPonteMock.mockClear();
  enviarImpressaoPonteMock.mockResolvedValue({ data: { id: "abc", estado: "na_fila" }, error: null });
});

describe("driver escpos-ponte", () => {
  it("via de produção vira linhas de texto e vai pro destino do perfil", async () => {
    const { error } = await imprimir(documentoProducao, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80 });

    expect(error).toBeNull();
    expect(enviarImpressaoPonteMock).toHaveBeenCalledTimes(1);
    const trabalho = trabalhoEnviado();
    expect(trabalho.destino).toEqual(IMPRESSORA_WINDOWS);
    expect(Array.isArray(trabalho.linhas)).toBe(true);
    const texto = trabalho.linhas.join("\n");
    expect(texto).toContain("X-Burguer");
    expect(texto).toContain("sem cebola");
    // via de produção nunca leva preço/total pra cozinha
    expect(texto).not.toContain("TOTAL");
  });

  it("comprovante usa o formatador de comprovante (leva o TOTAL)", async () => {
    const { error } = await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80 });

    expect(error).toBeNull();
    expect(trabalhoEnviado().linhas.join("\n")).toContain("TOTAL");
  });

  it("destino de rede é repassado cru pra Ponte", async () => {
    const destino = { tipo: "rede", host: "192.168.0.50", porta: 9100 };

    await imprimir(documentoComprovante, { impressora: destino });

    expect(trabalhoEnviado().destino).toEqual(destino);
  });

  it("sem impressora escolhida: erro que diz o que fazer, sem chamar a Ponte", async () => {
    const { error } = await imprimir(documentoComprovante, { driver: "escpos-ponte" });

    expect(error?.message).toBe("Escolha a impressora em Configurações → Impressão.");
    expect(enviarImpressaoPonteMock).not.toHaveBeenCalled();
  });

  it("destino incompleto (windows sem nome) cai na mesma orientação", async () => {
    const { error } = await imprimir(documentoComprovante, { impressora: { tipo: "windows" } });

    expect(error?.message).toMatch(/escolha a impressora/i);
    expect(enviarImpressaoPonteMock).not.toHaveBeenCalled();
  });

  it("propaga o erro da Ponte como {error}, sem lançar", async () => {
    enviarImpressaoPonteMock.mockResolvedValueOnce({
      data: null,
      error: new Error("A Ponte KORA não está rodando neste computador."),
    });

    const { error } = await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS });

    expect(error?.message).toMatch(/Ponte KORA não está rodando/);
  });

  it("nunca lança, mesmo se o cliente da Ponte explodir", async () => {
    enviarImpressaoPonteMock.mockRejectedValueOnce(new Error("boom"));

    const { error } = await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS });

    expect(error?.message).toBe("boom");
  });

  it("cortaPapel do perfil é repassado (default ligado, false respeitado)", async () => {
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS });
    expect(trabalhoEnviado().cortaPapel).toBe(true);

    enviarImpressaoPonteMock.mockClear();
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, cortaPapel: false });
    expect(trabalhoEnviado().cortaPapel).toBe(false);
  });

  it("manda pra Ponte o tamanho da letra que o dono escolheu", async () => {
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80, fonteBase: 18 });
    expect(trabalhoEnviado().tamanhoFonte).toBe("alta");

    enviarImpressaoPonteMock.mockClear();
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80, fonteBase: 22 });
    expect(trabalhoEnviado().tamanhoFonte).toBe("grande");
  });

  it("perfil sem fonte definida imprime no tamanho padrão da impressora", async () => {
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80 });
    expect(trabalhoEnviado().tamanhoFonte).toBe("normal");
  });

  it("letra grande reflui o texto nas colunas que a impressora vai usar", async () => {
    // O bug que este teste tranca: mandar o tamanho grande (que dobra a
    // largura do caractere) sem estreitar a formatação faria cada linha
    // sair com o dobro da largura do papel — comanda embaralhada.
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80, fonteBase: 22 });
    const linhasGrande = trabalhoEnviado().linhas;
    enviarImpressaoPonteMock.mockClear();
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80 });
    const linhasNormais = trabalhoEnviado().linhas;

    expect(Math.max(...linhasGrande.map((l) => l.length))).toBeLessThanOrEqual(24);
    expect(Math.max(...linhasNormais.map((l) => l.length))).toBeGreaterThan(24);
  });

  it("letra miúda aproveita as colunas a mais da Fonte B", async () => {
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80, fonteBase: 11 });
    const trabalho = trabalhoEnviado();
    expect(trabalho.tamanhoFonte).toBe("pequena");
    expect(Math.max(...trabalho.linhas.map((l) => l.length))).toBeGreaterThan(48);
  });

  it("58mm produz colunas mais estreitas que 80mm", async () => {
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 58 });
    const linhas58 = trabalhoEnviado().linhas;
    enviarImpressaoPonteMock.mockClear();
    await imprimir(documentoComprovante, { impressora: IMPRESSORA_WINDOWS, larguraMm: 80 });
    const linhas80 = trabalhoEnviado().linhas;

    expect(Math.max(...linhas58.map((l) => l.length))).toBeLessThan(Math.max(...linhas80.map((l) => l.length)));
  });
});
