// Testes dos helpers de HTTP/rede da Ponte KORA (Leva 13).
import { describe, it, expect } from "vitest";
import {
  ehEnderecoLocal,
  cabecalhosCors,
  tokenDaRequisicao,
  tokenValido,
  enderecosLan,
} from "./http.js";

describe("ehEnderecoLocal", () => {
  it("reconhece loopback IPv4, IPv6 e IPv4-mapeado", () => {
    expect(ehEnderecoLocal("127.0.0.1")).toBe(true);
    expect(ehEnderecoLocal("::1")).toBe(true);
    expect(ehEnderecoLocal("::ffff:127.0.0.1")).toBe(true);
    expect(ehEnderecoLocal("127.0.0.53")).toBe(true);
  });

  it("recusa endereços da rede local e entradas inválidas", () => {
    expect(ehEnderecoLocal("192.168.0.10")).toBe(false);
    expect(ehEnderecoLocal("10.0.0.5")).toBe(false);
    expect(ehEnderecoLocal("")).toBe(false);
    expect(ehEnderecoLocal(undefined)).toBe(false);
    expect(ehEnderecoLocal(null)).toBe(false);
  });
});

describe("cabecalhosCors", () => {
  it("libera origem, métodos, cabeçalho do token e rede privada", () => {
    const h = cabecalhosCors();
    expect(h["Access-Control-Allow-Origin"]).toBe("*");
    expect(h["Access-Control-Allow-Methods"]).toContain("POST");
    expect(h["Access-Control-Allow-Headers"]).toContain("X-Ponte-Token");
    expect(h["Access-Control-Allow-Private-Network"]).toBe("true");
  });
});

describe("tokenDaRequisicao", () => {
  it("lê do cabeçalho X-Ponte-Token", () => {
    const t = tokenDaRequisicao({ headers: { "x-ponte-token": "abc" } });
    expect(t).toBe("abc");
  });

  it("lê da query ?t= quando não há cabeçalho (link do QR)", () => {
    const url = new URL("http://192.168.0.2:8123/catalogo?t=xyz");
    expect(tokenDaRequisicao({ headers: {}, url })).toBe("xyz");
  });

  it("cabeçalho vence a query; sem nada devolve string vazia", () => {
    const url = new URL("http://x/y?t=daquery");
    expect(tokenDaRequisicao({ headers: { "x-ponte-token": "doheader" }, url })).toBe("doheader");
    expect(tokenDaRequisicao({})).toBe("");
    expect(tokenDaRequisicao()).toBe("");
  });
});

describe("tokenValido", () => {
  it("aceita tokens iguais e recusa diferentes", () => {
    expect(tokenValido("abc123", "abc123")).toBe(true);
    expect(tokenValido("abc124", "abc123")).toBe(false);
    expect(tokenValido("abc", "abc123")).toBe(false);
  });

  it("recusa vazio, undefined e tipos errados — nunca valida sem token", () => {
    expect(tokenValido("", "")).toBe(false);
    expect(tokenValido("", "abc")).toBe(false);
    expect(tokenValido(undefined, "abc")).toBe(false);
    expect(tokenValido("abc", undefined)).toBe(false);
    expect(tokenValido(123, 123)).toBe(false);
  });
});

describe("enderecosLan", () => {
  it("devolve só IPv4 não-interno (é o que vira o link do Palm)", () => {
    const interfaces = {
      lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
      wifi: [
        { family: "IPv4", address: "192.168.0.42", internal: false },
        { family: "IPv6", address: "fe80::1", internal: false },
      ],
      eth: [{ family: 4, address: "10.0.0.7", internal: false }],
    };
    expect(enderecosLan(interfaces)).toEqual(["192.168.0.42", "10.0.0.7"]);
  });

  it("tolera entrada vazia ou malformada", () => {
    expect(enderecosLan(undefined)).toEqual([]);
    expect(enderecosLan({})).toEqual([]);
    expect(enderecosLan({ x: "não é lista" })).toEqual([]);
  });
});
