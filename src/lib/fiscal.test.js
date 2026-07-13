import { describe, it, expect, vi, beforeEach } from "vitest";

// Jarvas/Event Bus — só observabilidade, isolado.
const emitirEvento = vi.fn();
vi.mock("./jarvas", () => ({ emitirEvento: (...args) => emitirEvento(...args) }));

// supabase.auth.getSession — por padrão com token (caixa logado). Testes
// que precisam de "sem sessão" sobrescrevem via getSessionMock.
const getSessionMock = vi.fn(() =>
  Promise.resolve({ data: { session: { access_token: "tok-123" } } }),
);
vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: (...a) => getSessionMock(...a) } },
}));

// import.meta.env para a EDGE_URL/apikey.
vi.stubGlobal("importMetaEnvSet", true);

import { emitirDocumentoFiscal } from "./fiscal";

const VENDA = {
  id: "v1",
  total: 30,
  comanda: "12",
  items: [{ name: "X-Salada", price: 15, qty: 2, id: "p1" }],
  pagamentos: [{ metodo: "dinheiro", valor: 40, troco: 10 }],
};

function mockFetch(status, jsonBody) {
  return vi.fn(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(jsonBody) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
});

describe("emitirDocumentoFiscal — fluxo NFC-e (Edge Function)", () => {
  it("mapeia 'sem_chave' quando faltam os segredos (certificado/CSC)", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "sem_chave", chave: "4326...", detalhe: "faltam segredos" }));
    const r = await emitirDocumentoFiscal(VENDA, { usuario: "maria" });
    expect(r.status).toBe("sem_chave");
    expect(r.vendaId).toBe("v1");
    expect(r.chave).toBe("4326...");
  });

  it("mapeia 'autorizada' com chave e protocolo", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "autorizada", chave: "CHAVE44", protocolo: "135260000123456" }));
    const r = await emitirDocumentoFiscal(VENDA, { usuario: "maria" });
    expect(r.status).toBe("autorizada");
    expect(r.protocolo).toBe("135260000123456");
  });

  it("mapeia 'rejeitada' preservando o detalhe", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "rejeitada", detalhe: "cStat 217" }));
    const r = await emitirDocumentoFiscal(VENDA);
    expect(r.status).toBe("rejeitada");
    expect(r.detalhe).toBe("cStat 217");
  });

  it("status desconhecido ou HTTP de erro vira 'erro' (fail-safe)", async () => {
    vi.stubGlobal("fetch", mockFetch(412, { error: "Estabelecimento sem configuração fiscal." }));
    const r = await emitirDocumentoFiscal(VENDA);
    expect(r.status).toBe("erro");
    expect(r.detalhe).toContain("configuração fiscal");
  });

  it("envia o tpEmis de contingência (9) no corpo", async () => {
    const fetchSpy = mockFetch(200, { status: "sem_chave" });
    vi.stubGlobal("fetch", fetchSpy);
    await emitirDocumentoFiscal(VENDA, { tpEmis: 9 });
    const corpo = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(corpo.tpEmis).toBe(9);
    expect(corpo.venda.itens[0].xProd).toBe("X-Salada");
  });

  it("nunca lança — falha de rede vira status 'erro'", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    await expect(emitirDocumentoFiscal(VENDA)).resolves.toMatchObject({ status: "erro" });
  });

  it("sem sessão, devolve 'erro' sem chamar a Edge Function", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchSpy = mockFetch(200, {});
    vi.stubGlobal("fetch", fetchSpy);
    const r = await emitirDocumentoFiscal(VENDA);
    expect(r.status).toBe("erro");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("registra o desfecho como evento Jarvas (fire-and-forget)", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "autorizada", chave: "CHAVE44" }));
    await emitirDocumentoFiscal(VENDA, { usuario: "maria" });
    expect(emitirEvento).toHaveBeenCalledWith(
      "fiscal.nfce_emissao",
      "fiscal",
      expect.objectContaining({ venda_id: "v1", status: "autorizada", comanda: "12" }),
      "maria",
    );
  });
});
