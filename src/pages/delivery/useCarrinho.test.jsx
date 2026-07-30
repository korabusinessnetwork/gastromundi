// @vitest-environment jsdom
//
// Run 6, leva 2 — a sacola da vitrine pública.
//
// O defeito: `adicionar` chamava `crypto.randomUUID()` direto. Essa função
// só existe em contexto seguro (https/localhost) e o Safari do iPhone só
// passou a tê-la na versão 15.4. Num domínio próprio ainda sem certificado,
// ou num iPhone mais velho, o clique em "Adicionar" estourava TypeError
// dentro do onClick — e não há error boundary na vitrine: o cliente batia
// no botão e nada acontecia, para sempre. A loja inteira ficava sem
// conseguir vender, sem uma linha de erro na tela.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// A camada de delivery importa o client Supabase no topo (exige VITE_*).
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { useCarrinho } from "./useCarrinho";

const SLUG = "resto";

const PIZZA = {
  produto_id: 7,
  nome: "Pizza Calabresa",
  preco: 25,
  qtd: 1,
  complementosEscolhidos: [],
  obs: "",
};

const descritorOriginal = Object.getOwnPropertyDescriptor(globalThis, "crypto");

/** Deixa o ambiente como um iPhone antigo / origem sem https. */
function semRandomUUID(valor) {
  Object.defineProperty(globalThis, "crypto", {
    value: valor,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  if (descritorOriginal) Object.defineProperty(globalThis, "crypto", descritorOriginal);
  vi.restoreAllMocks(); // devolve o Date.now real (não há restoreMocks global)
  sessionStorage.clear();
});

describe("useCarrinho — adicionar sem crypto.randomUUID (Run 6, leva 2)", () => {
  it("adiciona normalmente quando o navegador tem randomUUID", () => {
    const { result } = renderHook(() => useCarrinho(SLUG));

    act(() => result.current.adicionar(PIZZA));

    expect(result.current.itens).toHaveLength(1);
    expect(result.current.itens[0]._linha).toBeTruthy();
    expect(result.current.quantidade).toBe(1);
    expect(result.current.subtotal).toBe(25);
  });

  it("navegador sem randomUUID (Safari < 15.4) ainda coloca o item na sacola", () => {
    semRandomUUID({}); // objeto crypto existe, mas sem a função

    const { result } = renderHook(() => useCarrinho(SLUG));

    act(() => result.current.adicionar(PIZZA));

    expect(result.current.itens).toHaveLength(1);
    expect(result.current.itens[0]._linha).toBeTruthy();
    expect(result.current.subtotal).toBe(25);
  });

  it("origem sem contexto seguro (sem crypto nenhum) também vende", () => {
    semRandomUUID(undefined);

    const { result } = renderHook(() => useCarrinho(SLUG));

    act(() => result.current.adicionar(PIZZA));

    expect(result.current.itens).toHaveLength(1);
    expect(result.current.itens[0]._linha).toBeTruthy();
  });

  it("sem randomUUID as linhas continuam distintas — remover uma não leva a outra junto", () => {
    semRandomUUID(undefined);
    // Relógio congelado: os dois itens caem no MESMO milissegundo, que é
    // o caso real de quem toca "Adicionar" duas vezes seguidas. Se o id
    // de linha vier só do relógio, os dois viram a mesma linha e remover
    // um leva o outro junto.
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const { result } = renderHook(() => useCarrinho(SLUG));

    act(() => result.current.adicionar(PIZZA));
    act(() => result.current.adicionar({ ...PIZZA, obs: "sem cebola" }));

    const [a, b] = result.current.itens;
    expect(a._linha).not.toBe(b._linha);

    act(() => result.current.remover(a._linha));

    expect(result.current.itens).toHaveLength(1);
    expect(result.current.itens[0].obs).toBe("sem cebola");
  });

  it("a sacola persiste na sessão mesmo sem randomUUID", () => {
    semRandomUUID(undefined);

    const { result } = renderHook(() => useCarrinho(SLUG));
    act(() => result.current.adicionar(PIZZA));

    const gravado = JSON.parse(sessionStorage.getItem(`kora.delivery.sacola.${SLUG}`));
    expect(gravado).toHaveLength(1);
    expect(gravado[0]._linha).toBe(result.current.itens[0]._linha);
  });
});
