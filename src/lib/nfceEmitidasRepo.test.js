import { describe, it, expect, vi, beforeEach } from "vitest";

// Builder encadeável falso: cada filtro registra a chamada e devolve o próprio
// builder; `range` é o terminal e resolve a resposta configurada.
const { fromMock, setResposta, getChamadas, getTodasChamadas, limparChamadas } = vi.hoisted(() => {
  let chamadas;
  const todas = [];
  let resposta = { data: [], error: null };
  const criar = () => {
    chamadas = { select: [], eq: [], ilike: [], gte: [], lte: [], order: [], range: [] };
    const c = chamadas;
    todas.push(c);
    const b = {};
    for (const m of ["select", "eq", "ilike", "gte", "lte", "order"]) {
      b[m] = (...a) => { c[m].push(a); return b; };
    }
    b.range = (...a) => { c.range.push(a); return Promise.resolve(resposta); };
    // A consulta de contagem (head: true) não tem terminal: o próprio builder
    // é aguardado, então ele precisa ser "thenable".
    b.then = (ok, falhou) => Promise.resolve(resposta).then(ok, falhou);
    return b;
  };
  return {
    fromMock: vi.fn(() => criar()),
    setResposta: (r) => { resposta = r; },
    getChamadas: () => chamadas,
    getTodasChamadas: () => todas,
    limparChamadas: () => { todas.length = 0; },
  };
});

vi.mock("./supabase", () => ({ supabase: { from: fromMock } }));

import { listarNfceEmitidas, contarNfceEmitidas, contarAlertasNfce } from "./nfceEmitidasRepo";

const linhas = (n) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, status: "autorizada" }));

beforeEach(() => {
  vi.clearAllMocks();
  limparChamadas();
  setResposta({ data: [], error: null });
});

describe("listarNfceEmitidas, montagem dos filtros (Leva 12)", () => {
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

/**
 * D06 — a tela avisava bem sobre a fila offline (nota que nunca chegou à
 * SEFAZ), mas não havia sinal nenhum para nota que CHEGOU e voltou rejeitada,
 * ou ficou pendente. Para descobrir era preciso suspeitar e clicar no chip
 * "Rejeitadas", e uma venda sem nota válida ficava invisível por tempo
 * indeterminado.
 */
describe("contarNfceEmitidas, contagem por situação (D06)", () => {
  const daSituacao = (situacao) =>
    getTodasChamadas().find((c) => c.eq.some(([campo, valor]) => campo === "status" && valor === situacao));

  it("conta sem trazer linha nenhuma: head true e count exato", async () => {
    setResposta({ count: 4, data: null, error: null });

    const r = await contarNfceEmitidas({ status: "rejeitada" });

    const c = getChamadas();
    expect(fromMock).toHaveBeenCalledWith("nfce_emitidas");
    expect(c.select[0]).toEqual(["id", { count: "exact", head: true }]);
    expect(c.eq).toContainEqual(["status", "rejeitada"]);
    expect(c.range).toHaveLength(0);
    expect(r.count).toBe(4);
    expect(r.error).toBeNull();
  });

  it("status 'todas' não aplica .eq", async () => {
    setResposta({ count: 9, data: null, error: null });
    await contarNfceEmitidas({ status: "todas" });
    expect(getChamadas().eq).toHaveLength(0);
  });

  it("erro vira count 0, sem lançar", async () => {
    setResposta({ count: null, data: null, error: new Error("boom") });
    const r = await contarNfceEmitidas({ status: "pendente" });
    expect(r.count).toBe(0);
    expect(r.error).toBeInstanceOf(Error);
  });

  it("rejeitada conta dentro do período, pendente NÃO some por causa da janela", async () => {
    setResposta({ count: 2, data: null, error: null });

    await contarAlertasNfce({ de: "2026-09-01T00:00:00.000Z", ate: "2026-09-12T23:59:59.000Z" });

    const rejeitada = daSituacao("rejeitada");
    const pendente = daSituacao("pendente");
    expect(rejeitada.gte).toContainEqual(["created_at", "2026-09-01T00:00:00.000Z"]);
    expect(rejeitada.lte).toContainEqual(["created_at", "2026-09-12T23:59:59.000Z"]);
    // Nota parada há 60 dias tem de continuar contando numa janela de 30 dias,
    // senão a tela diz que está tudo bem.
    expect(pendente.gte).toHaveLength(0);
    expect(pendente.lte).toHaveLength(0);
  });

  it("devolve as duas contagens juntas para os chips", async () => {
    setResposta({ count: 3, data: null, error: null });
    const r = await contarAlertasNfce();
    expect(r).toMatchObject({ rejeitada: 3, pendente: 3, error: null });
  });

  it("a busca por chave vale para as duas contagens, para bater com a lista", async () => {
    setResposta({ count: 1, data: null, error: null });
    await contarAlertasNfce({ busca: " 4321 " });
    expect(daSituacao("rejeitada").ilike).toContainEqual(["chave", "%4321%"]);
    expect(daSituacao("pendente").ilike).toContainEqual(["chave", "%4321%"]);
  });
});
