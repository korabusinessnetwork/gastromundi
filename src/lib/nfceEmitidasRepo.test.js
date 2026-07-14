import { describe, it, expect, vi, beforeEach } from "vitest";

// Builder encadeável falso: cada filtro registra a chamada e devolve o próprio
// builder; `range` é o terminal e resolve a resposta configurada.
const { fromMock, setResposta, getChamadas } = vi.hoisted(() => {
  let chamadas;
  let resposta = { data: [], error: null };
  const criar = () => {
    chamadas = { select: [], eq: [], ilike: [], gte: [], lte: [], order: [], range: [] };
    const b = {};
    for (const m of ["select", "eq", "ilike", "gte", "lte", "order"]) {
      b[m] = (...a) => { chamadas[m].push(a); return b; };
    }
    b.range = (...a) => { chamadas.range.push(a); return Promise.resolve(resposta); };
    return b;
  };
  return {
    fromMock: vi.fn(() => criar()),
    setResposta: (r) => { resposta = r; },
    getChamadas: () => chamadas,
  };
});

vi.mock("./supabase", () => ({ supabase: { from: fromMock } }));

import { listarNfceEmitidas } from "./nfceEmitidasRepo";

const linhas = (n) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, status: "autorizada" }));

beforeEach(() => {
  vi.clearAllMocks();
  setResposta({ data: [], error: null });
});

describe("listarNfceEmitidas — montagem dos filtros (Leva 12)", () => {
  it("status 'todas' NÃO aplica .eq; ordena por created_at desc e pagina a partir de 0", async () => {
    setResposta({ data: linhas(20), error: null });
    const r = await listarNfceEmitidas();

    const c = getChamadas();
    expect(fromMock).toHaveBeenCalledWith("nfce_emitidas");
    expect(c.eq).toHaveLength(0);
    expect(c.order[0]).toEqual(["created_at", { ascending: false }]);
    expect(c.range[0]).toEqual([0, 19]);
    // Página cheia (20) ⇒ provavelmente há mais.
    expect(r.temMais).toBe(true);
    expect(r.data).toHaveLength(20);
    expect(r.error).toBeNull();
  });

  it("status específico aplica .eq('status', ...)", async () => {
    await listarNfceEmitidas({ status: "cancelada" });
    expect(getChamadas().eq).toContainEqual(["status", "cancelada"]);
  });

  it("busca não-vazia vira .ilike na chave; busca vazia não filtra", async () => {
    await listarNfceEmitidas({ busca: "  1234  " });
    expect(getChamadas().ilike).toContainEqual(["chave", "%1234%"]);

    await listarNfceEmitidas({ busca: "   " });
    expect(getChamadas().ilike).toHaveLength(0);
  });

  it("intervalo de datas aplica gte/lte em created_at", async () => {
    await listarNfceEmitidas({ de: "2026-01-01T00:00:00.000Z", ate: "2026-01-31T23:59:59.000Z" });
    const c = getChamadas();
    expect(c.gte[0]).toEqual(["created_at", "2026-01-01T00:00:00.000Z"]);
    expect(c.lte[0]).toEqual(["created_at", "2026-01-31T23:59:59.000Z"]);
  });

  it("paginação: página 2 (tamanho 20) → range(40, 59)", async () => {
    await listarNfceEmitidas({ pagina: 2 });
    expect(getChamadas().range[0]).toEqual([40, 59]);
  });

  it("temMais é false quando volta menos que o tamanho da página", async () => {
    setResposta({ data: linhas(3), error: null });
    const r = await listarNfceEmitidas();
    expect(r.temMais).toBe(false);
    expect(r.data).toHaveLength(3);
  });

  it("erro do supabase vira { data: [], error } sem lançar", async () => {
    setResposta({ data: null, error: new Error("boom") });
    const r = await listarNfceEmitidas();
    expect(r.data).toEqual([]);
    expect(r.error).toBeInstanceOf(Error);
    expect(r.temMais).toBe(false);
  });
});
