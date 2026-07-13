import { describe, it, expect } from "vitest";
import { sha1Hex, montarQrCodeNfce } from "./nfceQrCode";

// Uma chave de 44 dígitos qualquer (formato válido; conteúdo não importa
// para o teste do QR — a validação da chave em si é da Leva 1).
const CHAVE = "43260712345678000195650010000000011000000017";
const URL_CONSULTA = "https://www.exemplo-sefaz.rs.gov.br/nfce/consulta";

describe("nfceQrCode — sha1Hex", () => {
  it("bate com o vetor conhecido SHA-1('abc') em hex maiúsculo", async () => {
    // SHA-1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d
    expect(await sha1Hex("abc")).toBe("A9993E364706816ABA3E25717850C26C9CD0D89D");
  });

  it("produz 40 caracteres hex maiúsculos", async () => {
    const h = await sha1Hex("gastromundi");
    expect(h).toMatch(/^[0-9A-F]{40}$/);
  });
});

describe("nfceQrCode — montarQrCodeNfce (online / QR 2.00)", () => {
  const base = { chave: CHAVE, tpAmb: 2, idCsc: 1, csc: "SEGREDO-CSC", urlConsulta: URL_CONSULTA };

  it("monta a URL com o parâmetro p no formato posicional da NT 2015.002", async () => {
    const url = await montarQrCodeNfce(base);
    // url?p=chave|2|tpAmb|idCSC|HASH
    expect(url.startsWith(`${URL_CONSULTA}?p=`)).toBe(true);
    const p = url.split("?p=")[1];
    const partes = p.split("|");
    expect(partes[0]).toBe(CHAVE);
    expect(partes[1]).toBe("2"); // versão do QR Code
    expect(partes[2]).toBe("2"); // tpAmb (homologação)
    expect(partes[3]).toBe("000001"); // idCSC com zero-padding a 6
    expect(partes[4]).toMatch(/^[0-9A-F]{40}$/); // hash SHA-1
  });

  it("o hash é SHA-1 de 'chave|versao|tpAmb|idCSC' + CSC", async () => {
    const url = await montarQrCodeNfce(base);
    const esperado = await sha1Hex(`${CHAVE}|2|2|000001SEGREDO-CSC`);
    expect(url.split("|").pop()).toBe(esperado);
  });

  it("trocar o CSC muda o hash (o segredo entra de fato no cálculo)", async () => {
    const a = await montarQrCodeNfce(base);
    const b = await montarQrCodeNfce({ ...base, csc: "OUTRO-CSC" });
    expect(a.split("|").pop()).not.toBe(b.split("|").pop());
  });

  it("tpAmb=1 (produção) entra na string do QR", async () => {
    const url = await montarQrCodeNfce({ ...base, tpAmb: 1 });
    expect(url.split("?p=")[1].split("|")[2]).toBe("1");
  });

  it("usa & quando a URL de consulta já tem query string", async () => {
    const url = await montarQrCodeNfce({ ...base, urlConsulta: "https://x.gov.br/nfce?v=2" });
    expect(url).toContain("?v=2&p=");
  });

  it("exige chave de 44 dígitos", async () => {
    await expect(montarQrCodeNfce({ ...base, chave: "123" })).rejects.toThrow(/44/);
  });

  it("exige tpAmb 1 ou 2", async () => {
    await expect(montarQrCodeNfce({ ...base, tpAmb: 9 })).rejects.toThrow(/tpAmb/);
  });

  it("exige o idCSC do tenant", async () => {
    await expect(montarQrCodeNfce({ ...base, idCsc: "" })).rejects.toThrow(/idCSC/);
  });

  it("exige o CSC (segredo injetado) — nunca monta QR sem ele", async () => {
    await expect(montarQrCodeNfce({ ...base, csc: "" })).rejects.toThrow(/CSC/);
  });

  it("exige a URL de consulta da UF (vem da config do tenant)", async () => {
    await expect(montarQrCodeNfce({ ...base, urlConsulta: "" })).rejects.toThrow(/URL/);
  });
});
