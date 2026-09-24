import { describe, it, expect } from "vitest";
import { montarSvgQrCode, svgSeguro } from "./qrCodeSvg";

/**
 * O SVG deste módulo é o ÚNICO `dangerouslySetInnerHTML` do app
 * (`src/components/fiscal/CupomNfce.jsx`). Hoje ele é seguro porque a lib
 * `qrcode` desenha só `path` e nunca ecoa o texto de entrada no markup.
 *
 * "Hoje" é a palavra que incomoda: isso é propriedade da biblioteca, não
 * do nosso código, e nada cobrava. Trocar a lib, ou ela passar a colocar o
 * conteúdo num `<title>` para acessibilidade, viraria injeção de markup
 * vindo de dado no cupom fiscal.
 */

describe("svgSeguro", () => {
  it("aceita o SVG simples que a lib gera", () => {
    expect(svgSeguro('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>')).toBe(true);
  });

  it("recusa o que não é string", () => {
    for (const x of [null, undefined, 7, {}, []]) expect(svgSeguro(x)).toBe(false);
  });

  it("recusa markup que não é um SVG inteiro", () => {
    expect(svgSeguro("<div><svg></svg></div>")).toBe(false);
    expect(svgSeguro("<svg><path/>")).toBe(false);
    expect(svgSeguro("")).toBe(false);
  });

  it("recusa script embutido", () => {
    expect(svgSeguro('<svg><script>alert(1)</script></svg>')).toBe(false);
    expect(svgSeguro('<svg><  script >alert(1)</script></svg>')).toBe(false);
  });

  it("recusa atributo de evento", () => {
    expect(svgSeguro('<svg onload="alert(1)"></svg>')).toBe(false);
    expect(svgSeguro('<svg><path onerror="alert(1)"/></svg>')).toBe(false);
  });

  it("recusa foreignObject, que é a porta de HTML dentro de SVG", () => {
    expect(svgSeguro("<svg><foreignObject><img/></foreignObject></svg>")).toBe(false);
  });

  it("recusa javascript: e link pendurado no desenho", () => {
    expect(svgSeguro('<svg><a href="javascript:alert(1)"><path/></a></svg>')).toBe(false);
    expect(svgSeguro('<svg><use xlink:href="#x"/></svg>')).toBe(false);
  });

  it("não confunde atributo legítimo que termina em on", () => {
    // `version=` não pode cair na regra de `on...=`.
    expect(svgSeguro('<svg version="1.1" xmlns="http://www.w3.org/2000/svg"><path/></svg>')).toBe(true);
  });
});

describe("montarSvgQrCode", () => {
  it("exige texto", async () => {
    await expect(montarSvgQrCode("")).rejects.toThrow(/exige um texto/);
    await expect(montarSvgQrCode(null)).rejects.toThrow(/exige um texto/);
  });

  it("gera um SVG que passa no próprio guard", async () => {
    const svg = await montarSvgQrCode("https://www.sefaz.go.gov.br/nfeweb/consulta?p=123");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svgSeguro(svg)).toBe(true);
  });

  it("não ecoa a URL de entrada dentro do markup", () => {
    // É o que torna a injeção impossível hoje. Se um dia parar de valer,
    // este teste cai antes de o cupom virar vetor.
    const url = "https://www.sefaz.go.gov.br/nfeweb/consulta?p=marcador-unico-9z";
    return montarSvgQrCode(url).then((svg) => {
      expect(svg).not.toContain("marcador-unico-9z");
    });
  });
});

// ── Propriedades do desenho, que vieram da branch de combos/delivery ──
// Elas não se sobrepõem às de cima: aquelas cuidam do SVG ser SEGURO,
// estas de ele ser o QR CERTO. As duas coisas importam num cupom fiscal.
describe("montarSvgQrCode, o desenho em si", () => {
  const URL_NFCE =
    "https://www.nfce.fazenda.sp.gov.br/qrcode?p=35260812345678000199650010000000011000000017|2|1|1|abc123";

  it("é desenho puro: nada no markup é buscado da rede na hora de imprimir", async () => {
    // Impressora térmica costuma estar numa máquina sem internet. Um
    // <image> ou url() aqui sairia como retângulo vazio no cupom.
    const svg = await montarSvgQrCode(URL_NFCE);
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

  it("número vira texto em vez de quebrar", async () => {
    expect((await montarSvgQrCode(12345)).startsWith("<svg")).toBe(true);
  });
});
