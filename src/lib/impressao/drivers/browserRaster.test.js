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
});
