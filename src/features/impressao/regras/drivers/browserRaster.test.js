// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { gerarHtmlComPerfil } from "./browserRaster";

const RECIBO = { tipo: "comprovante", comanda: 7, itens: [], naoFiscal: true };

describe("gerarHtmlComPerfil, cores do estabelecimento", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--gm-accent");
    document.documentElement.style.removeProperty("--gm-warn");
  });

  it("leva a cor de destaque e a de aviso do estabelecimento para o papel", () => {
    // A prévia e a janela de impressão são documentos à parte: sem isto o
    // var(--gm-accent) do comprovante não existe lá e cai no roxo padrão.
    document.documentElement.style.setProperty("--gm-accent", "#e11d48");
    document.documentElement.style.setProperty("--gm-warn", "#eab308");
    const html = gerarHtmlComPerfil(RECIBO, null);
    expect(html).toContain("--gm-accent: #e11d48;");
    expect(html).toContain("--gm-warn: #eab308;");
  });

  it("mantém largura e margem do perfil", () => {
    const html = gerarHtmlComPerfil(RECIBO, { larguraMm: 58, margemMm: 2 });
    expect(html).toMatch(/--print-width: \d+px;/);
  });

  it("cor do tema que não é cor não entra no papel (não fecha a tag de estilo)", () => {
    // O tema vem do banco e uma variável CSS aceita quase qualquer texto. Sem
    // filtro, o valor fechava o <style> da janela de impressão e o resto virava
    // HTML com script, na mesma origem do app.
    document.documentElement.style.setProperty("--gm-accent", "</style><img src=x onerror=alert(1)>");
    const html = gerarHtmlComPerfil(RECIBO, null);
    expect(html).not.toContain("onerror");
    expect(html).not.toMatch(/--gm-accent:[^;]*</);
  });

  it("aceita as formas de cor que o tema usa", () => {
    for (const cor of ["#e11d48", "#fff", "rgb(225, 29, 72)", "rgba(225,29,72,0.13)", "hsl(340 82% 52%)"]) {
      document.documentElement.style.setProperty("--gm-accent", cor);
      expect(gerarHtmlComPerfil(RECIBO, null)).toContain(`--gm-accent: ${cor};`);
    }
  });
});

