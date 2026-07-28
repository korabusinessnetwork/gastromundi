import { describe, it, expect, vi } from "vitest";

vi.mock("../../ponte", () => ({
  enviarImpressaoPonte: vi.fn(async () => ({ data: { id: "abc", estado: "na_fila" }, error: null })),
}));

const { selecionarDriver, imprimirDocumento, DRIVER_PADRAO, OPCOES_DRIVER } = await import("./index");
const browserRaster = await import("./browserRaster");
const escposPonte = await import("./escposPonte");

describe("selecionarDriver", () => {
  it("resolve browser-raster explicitamente", () => {
    expect(selecionarDriver({ driver: "browser-raster" })).toBe(browserRaster);
  });

  it("resolve escpos-ponte explicitamente", () => {
    expect(selecionarDriver({ driver: "escpos-ponte" })).toBe(escposPonte);
  });

  it("cai no default (browser-raster) sem perfil", () => {
    expect(selecionarDriver(undefined)).toBe(browserRaster);
    expect(DRIVER_PADRAO).toBe("browser-raster");
  });

  it("cai no default pra um nome de driver desconhecido (não quebra por config antiga de QZ Tray)", () => {
    expect(selecionarDriver({ driver: "escpos-qztray" })).toBe(browserRaster);
    expect(selecionarDriver({ driver: "impressora-magica-inexistente" })).toBe(browserRaster);
  });
});

describe("OPCOES_DRIVER", () => {
  it("lista exatamente os drivers registrados, na ordem do default primeiro", () => {
    expect(OPCOES_DRIVER.map((o) => o.id)).toEqual(["browser-raster", "escpos-ponte"]);
    expect(OPCOES_DRIVER[0].id).toBe(DRIVER_PADRAO);
  });

  it("todo driver tem rótulo e ajuda em português, sem jargão de protocolo", () => {
    for (const opcao of OPCOES_DRIVER) {
      expect(opcao.label?.length).toBeGreaterThan(0);
      expect(opcao.ajuda?.length).toBeGreaterThan(0);
      expect(opcao.label).not.toMatch(/esc\/pos|raster|driver/i);
    }
  });
});

describe("imprimirDocumento", () => {
  it("delega pro driver resolvido a partir do perfil", async () => {
    const spy = vi.spyOn(escposPonte, "imprimir").mockResolvedValue({ error: null });
    const documento = { tipo: "via_producao" };
    const perfil = { driver: "escpos-ponte", impressora: { tipo: "windows", nome: "EPSON-58" } };

    const resultado = await imprimirDocumento(documento, perfil);

    expect(spy).toHaveBeenCalledWith(documento, perfil);
    expect(resultado).toEqual({ error: null });
    spy.mockRestore();
  });
});
