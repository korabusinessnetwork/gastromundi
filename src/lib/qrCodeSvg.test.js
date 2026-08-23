import { describe, it, expect } from "vitest";
import { montarSvgQrCode } from "./qrCodeSvg";

const URL_NFCE =
  "https://www.nfce.fazenda.sp.gov.br/qrcode?p=35260812345678000199650010000000011000000017|2|1|1|abc123";

describe("montarSvgQrCode", () => {
  it("devolve um SVG desenhável para a URL de consulta da NFC-e", async () => {
    const svg = await montarSvgQrCode(URL_NFCE);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain("viewBox");
  });

  it("é desenho puro: nada no markup é buscado da rede na hora de imprimir", async () => {
    const svg = await montarSvgQrCode(URL_NFCE);
    // O único http do markup é o namespace do SVG, que não é um endereço a
    // buscar. Imagem externa, sim, seria — e cupom não pode depender de rede.
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/<image|href|url\(/i);
  });

  it("o mesmo texto sempre gera o mesmo QR (cupom reimpresso é idêntico ao original)", async () => {
    expect(await montarSvgQrCode(URL_NFCE)).toBe(await montarSvgQrCode(URL_NFCE));
  });

  it("textos diferentes geram QRs diferentes", async () => {
    expect(await montarSvgQrCode("a")).not.toBe(await montarSvgQrCode("b"));
  });

  it("a margem é configurável e muda o SVG", async () => {
    const semMargem = await montarSvgQrCode(URL_NFCE, { margin: 0 });
    expect(semMargem).not.toBe(await montarSvgQrCode(URL_NFCE));
  });

  it("texto vazio é erro explícito — QR em branco no cupom seria pior", async () => {
    for (const vazio of [undefined, null, ""]) {
      await expect(montarSvgQrCode(vazio)).rejects.toThrow(/texto/i);
    }
  });

  it("número vira texto em vez de quebrar", async () => {
    expect((await montarSvgQrCode(12345)).startsWith("<svg")).toBe(true);
  });
});
