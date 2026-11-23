// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/deliveryFotos", () => ({ listarFotosDelivery: vi.fn() }));

import { listarFotosDelivery } from "@/lib/deliveryFotos";
import { useGaleriaFotos } from "./useGaleriaFotos";

function montar(retangulo) {
  const alvoRef = { current: retangulo ? { getBoundingClientRect: () => retangulo } : null };
  return renderHook(() => useGaleriaFotos({ tenantId: "t1", alvoRef }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 1000;
  window.innerHeight = 800;
});

describe("useGaleriaFotos", () => {
  it("abrir a galeria fecha o menu e carrega as fotos do estabelecimento", async () => {
    listarFotosDelivery.mockResolvedValue({ fotos: [{ path: "a.jpg", url: "u/a.jpg" }], error: null });
    const { result } = montar({ bottom: 100, left: 50 });

    act(() => result.current.alternarMenuFoto());
    expect(result.current.menuFotoAberto).toBe(true);

    await act(async () => { await result.current.abrirGaleria(); });

    expect(listarFotosDelivery).toHaveBeenCalledWith("t1");
    expect(result.current.menuFotoAberto).toBe(false);
    expect(result.current.galeriaAberta).toBe(true);
    expect(result.current.galeriaCarregando).toBe(false);
    expect(result.current.galeriaFotos).toEqual([{ path: "a.jpg", url: "u/a.jpg" }]);

    act(() => result.current.fecharGaleria());
    expect(result.current.galeriaAberta).toBe(false);
  });

  it("falha ao carregar mostra o erro, e tentar de novo limpa o erro", async () => {
    listarFotosDelivery.mockResolvedValueOnce({ fotos: null, error: { message: "sem rede" } });
    const { result } = montar(null);

    await act(async () => { await result.current.abrirGaleria(); });
    expect(result.current.galeriaErro).toBe("sem rede");
    expect(result.current.galeriaCarregando).toBe(false);

    listarFotosDelivery.mockResolvedValueOnce({ fotos: [], error: null });
    await act(async () => { await result.current.abrirGaleria(); });
    expect(result.current.galeriaErro).toBe("");
    expect(result.current.galeriaFotos).toEqual([]);
  });

  it("o menu abre colado na foto e nunca sai da tela", () => {
    const { result } = montar({ bottom: 100, left: 50 });
    act(() => result.current.alternarMenuFoto());
    expect(result.current.menuPos).toEqual({ top: 106, left: 50 });

    act(() => result.current.alternarMenuFoto());
    expect(result.current.menuFotoAberto).toBe(false);

    // Foto no canto de baixo à direita: o menu sobe e recua para caber.
    const canto = montar({ bottom: 790, left: 980 });
    act(() => canto.result.current.alternarMenuFoto());
    expect(canto.result.current.menuPos).toEqual({ top: 800 - 168 - 8, left: 1000 - 210 - 8 });
  });
});
