import { describe, it, expect } from "vitest";
import { dadosDaEmpresa, telefoneDoLink, temCanalDeContato } from "./empresa";

describe("telefoneDoLink", () => {
  it("lê o número do link do WhatsApp e escreve do jeito que a pessoa lê", () => {
    expect(telefoneDoLink("https://wa.me/5511987654321")).toBe("(11) 98765-4321");
  });

  it("aceita número fixo de 10 dígitos", () => {
    expect(telefoneDoLink("https://wa.me/551133334444")).toBe("(11) 3333-4444");
  });

  it("aceita link já com texto pronto na query", () => {
    expect(telefoneDoLink("https://wa.me/5511987654321?text=oi")).toBe(
      "(11) 98765-4321"
    );
  });

  it("devolve null quando não há link — o rodapé simplesmente não mostra telefone", () => {
    expect(telefoneDoLink("")).toBeNull();
    expect(telefoneDoLink(null)).toBeNull();
    expect(telefoneDoLink(undefined)).toBeNull();
  });

  it("devolve null quando o que veio não é um telefone brasileiro", () => {
    // Curto demais, longo demais e sem dígito nenhum: mostrar "(12) 3-" seria
    // pior do que não mostrar nada.
    expect(telefoneDoLink("https://wa.me/123")).toBeNull();
    expect(telefoneDoLink("https://wa.me/5511987654321000")).toBeNull();
    expect(telefoneDoLink("https://kora.codes/contato")).toBeNull();
  });
});

describe("dadosDaEmpresa", () => {
  it("lê o que estiver configurado", () => {
    const empresa = dadosDaEmpresa({
      VITE_EMPRESA_RAZAO_SOCIAL: "KORA Sistemas LTDA",
      VITE_EMPRESA_CNPJ: "00.000.000/0001-00",
      VITE_EMPRESA_ENDERECO: "Rua Exemplo, 100 — São Paulo/SP",
      VITE_EMPRESA_EMAIL: "contato@kora.codes",
      VITE_CONTATO_URL: "https://wa.me/5511987654321",
    });

    expect(empresa).toEqual({
      razaoSocial: "KORA Sistemas LTDA",
      cnpj: "00.000.000/0001-00",
      endereco: "Rua Exemplo, 100 — São Paulo/SP",
      email: "contato@kora.codes",
      contatoUrl: "https://wa.me/5511987654321",
      telefone: "(11) 98765-4321",
    });
  });

  it("sem configuração nenhuma devolve tudo null (a tela não inventa rótulo vazio)", () => {
    expect(dadosDaEmpresa({})).toEqual({
      razaoSocial: null,
      cnpj: null,
      endereco: null,
      email: null,
      contatoUrl: null,
      telefone: null,
    });
  });

  it("variável configurada em branco vale como não configurada", () => {
    // Vercel guarda string vazia quando o campo é salvo sem valor — sem isso
    // o rodapé mostraria "CNPJ" sozinho.
    const empresa = dadosDaEmpresa({
      VITE_EMPRESA_CNPJ: "   ",
      VITE_EMPRESA_EMAIL: "",
    });
    expect(empresa.cnpj).toBeNull();
    expect(empresa.email).toBeNull();
  });
});

describe("temCanalDeContato", () => {
  it("basta um dos dois para a pessoa conseguir exercer os direitos dela", () => {
    expect(temCanalDeContato({ email: "contato@kora.codes", contatoUrl: null })).toBe(true);
    expect(temCanalDeContato({ email: null, contatoUrl: "https://wa.me/5511987654321" })).toBe(true);
  });

  it("sem canal nenhum, a política precisa dizer outra coisa", () => {
    expect(temCanalDeContato({ email: null, contatoUrl: null })).toBe(false);
    expect(temCanalDeContato(null)).toBe(false);
    expect(temCanalDeContato(undefined)).toBe(false);
  });
});
