import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  criarFetchComTimeout,
  ehTransferenciaDeArquivo,
  TIMEOUT_PADRAO_MS,
} from "./redeTimeout";
import { isErroDeRede } from "./offline/rede";

/** fetch que nunca resolve, mas rejeita quando o signal aborta — como o real. */
function fetchPendurado(registro = {}) {
  return vi.fn((_input, init) =>
    new Promise((_resolve, reject) => {
      registro.signal = init?.signal;
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        reject(err);
      });
    }),
  );
}

describe("criarFetchComTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("deixa passar a resposta normal sem mexer em nada", async () => {
    const base = vi.fn().mockResolvedValue({ ok: true });
    const f = criarFetchComTimeout(base, 1000);
    await expect(f("https://x.supabase.co/rest/v1/products")).resolves.toEqual({ ok: true });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("requisição pendurada vira erro em vez de nunca voltar", async () => {
    const f = criarFetchComTimeout(fetchPendurado(), 1000);
    const promessa = f("https://x.supabase.co/rest/v1/orders").catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const erro = await promessa;
    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toMatch(/tempo limite/i);
  });

  it("o erro de prazo é reconhecido como falha de REDE (vai para a fila offline)", async () => {
    // Se não fosse, a operação seria dada como perdida em vez de esperar a
    // conexão voltar — que é o oposto do conserto.
    const f = criarFetchComTimeout(fetchPendurado(), 500);
    const promessa = f("https://x.supabase.co/rest/v1/orders").catch((e) => e);
    await vi.advanceTimersByTimeAsync(500);
    expect(isErroDeRede(await promessa)).toBe(true);
  });

  it("não estoura o prazo de quem responde a tempo", async () => {
    const base = vi.fn().mockResolvedValue({ ok: true });
    const f = criarFetchComTimeout(base, 1000);
    const resposta = await f("https://x.supabase.co/rest/v1/products");
    await vi.advanceTimersByTimeAsync(5000);
    expect(resposta).toEqual({ ok: true });
  });

  it("abortar de fora continua abortando, com o erro original", async () => {
    // O supabase-js cancela requisição na troca de sessão: transformar esse
    // aborto em "tempo limite" mentiria sobre o que houve.
    const controle = new AbortController();
    const f = criarFetchComTimeout(fetchPendurado(), 10000);
    const promessa = f("https://x.supabase.co/rest/v1/orders", { signal: controle.signal })
      .catch((e) => e);
    controle.abort();
    const erro = await promessa;
    expect(erro.name).toBe("AbortError");
    expect(erro.message).not.toMatch(/tempo limite/i);
  });

  it("upload de arquivo fica fora do prazo — foto grande em rede ruim é lenta de verdade", () => {
    expect(ehTransferenciaDeArquivo("https://x.supabase.co/storage/v1/object/fotos/a.jpg")).toBe(true);
    expect(ehTransferenciaDeArquivo("https://x.supabase.co/rest/v1/products")).toBe(false);

    const base = fetchPendurado();
    const f = criarFetchComTimeout(base, 1000);
    f("https://x.supabase.co/storage/v1/object/fotos/a.jpg").catch(() => {});
    // Sem AbortController próprio: o init chega intacto ao fetch de baixo.
    expect(base.mock.calls[0][1]?.signal).toBeUndefined();
  });

  it("o prazo padrão é generoso o bastante para consulta normal e curto para travamento", () => {
    expect(TIMEOUT_PADRAO_MS).toBeGreaterThanOrEqual(10000);
    expect(TIMEOUT_PADRAO_MS).toBeLessThanOrEqual(30000);
  });
});
