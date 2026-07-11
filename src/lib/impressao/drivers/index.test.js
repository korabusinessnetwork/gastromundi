import { describe, it, expect, vi } from "vitest";

vi.mock("../../qztray", () => ({ imprimirBruto: vi.fn(() => Promise.resolve()) }));

const { selecionarDriver, imprimirDocumento, DRIVER_PADRAO } = await import("./index");
const browserRaster = await import("./browserRaster");
const escposQzTray = await import("./escposQzTray");

describe("selecionarDriver", () => {
  it("resolve browser-raster explicitamente", () => {
    expect(selecionarDriver({ driver: "browser-raster" })).toBe(browserRaster);
  });

  it("resolve escpos-qztray explicitamente", () => {
    expect(selecionarDriver({ driver: "escpos-qztray" })).toBe(escposQzTray);
  });

  it("cai no default (browser-raster) sem perfil", () => {
    expect(selecionarDriver(undefined)).toBe(browserRaster);
    expect(DRIVER_PADRAO).toBe("browser-raster");
  });

  it("cai no default pra um nome de driver desconhecido (não quebra por typo de config)", () => {
    expect(selecionarDriver({ driver: "impressora-magica-inexistente" })).toBe(browserRaster);
  });
});

describe("imprimirDocumento", () => {
  it("delega pro driver resolvido a partir do perfil", async () => {
    const spy = vi.spyOn(escposQzTray, "imprimir").mockResolvedValue({ error: null });
    const documento = { tipo: "via_producao" };
    const perfil = { driver: "escpos-qztray", impressoraQz: "EPSON-58" };

    const resultado = await imprimirDocumento(documento, perfil);

    expect(spy).toHaveBeenCalledWith(documento, perfil);
    expect(resultado).toEqual({ error: null });
    spy.mockRestore();
  });
});
