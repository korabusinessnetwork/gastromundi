// Testes do cliente da Ponte KORA (Leva 13) — fetch mockado.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PONTE_URL,
  pingPonte,
  buscarInfoPonte,
  enviarSnapshotPonte,
  buscarPedidosPonte,
  confirmarPedidosPonte,
  montarEnderecoPalm,
} from "./ponte.js";

const respostaJson = (corpo, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(corpo),
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pingPonte", () => {
  it("devolve os dados de /saude quando a ponte responde", async () => {
    fetch.mockResolvedValue(respostaJson({ ok: true, nome: "KORA Ponte", pendentes: 0 }));
    const { data, error } = await pingPonte();
    expect(error).toBeNull();
    expect(data.nome).toBe("KORA Ponte");
    expect(fetch.mock.calls[0][0]).toBe(`${PONTE_URL}/saude`);
  });

  it("devolve error (sem lançar) quando a ponte não está rodando", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const { data, error } = await pingPonte();
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});

describe("buscarInfoPonte", () => {
  it("chama GET /info", async () => {
    fetch.mockResolvedValue(respostaJson({ token: "abc", enderecos: ["192.168.0.2"], porta: 8123 }));
    const { data, error } = await buscarInfoPonte();
    expect(error).toBeNull();
    expect(data.token).toBe("abc");
    expect(fetch.mock.calls[0][0]).toBe(`${PONTE_URL}/info`);
  });
});

describe("enviarSnapshotPonte", () => {
  it("faz POST com o corpo em JSON", async () => {
    fetch.mockResolvedValue(respostaJson({ ok: true }));
    const { error } = await enviarSnapshotPonte({ products: [{ id: 1 }] });
    expect(error).toBeNull();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${PONTE_URL}/snapshot`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ products: [{ id: 1 }] });
  });
});

describe("buscarPedidosPonte / confirmarPedidosPonte", () => {
  it("busca pedidos pendentes", async () => {
    fetch.mockResolvedValue(respostaJson({ pedidos: [{ id: "p1" }] }));
    const { data } = await buscarPedidosPonte();
    expect(data.pedidos).toHaveLength(1);
  });

  it("confirma enviando { ids }", async () => {
    fetch.mockResolvedValue(respostaJson({ ok: true, confirmados: 2 }));
    const { data } = await confirmarPedidosPonte(["a", "b"]);
    expect(data.confirmados).toBe(2);
    const [, opts] = fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ ids: ["a", "b"] });
  });

  it("propaga o erro amigável do servidor em status não-2xx", async () => {
    fetch.mockResolvedValue(respostaJson({ erro: "snapshot inválido" }, { status: 400 }));
    const { data, error } = await enviarSnapshotPonte(null);
    expect(data).toBeNull();
    expect(error.message).toBe("snapshot inválido");
  });
});

describe("montarEnderecoPalm", () => {
  it("monta o link com IP, porta e token", () => {
    const link = montarEnderecoPalm({ enderecos: ["192.168.0.42"], porta: 8123, token: "abc123" });
    expect(link).toBe("http://192.168.0.42:8123/palm?t=abc123");
  });

  it("devolve null sem IP ou sem token", () => {
    expect(montarEnderecoPalm({ enderecos: [], token: "abc" })).toBeNull();
    expect(montarEnderecoPalm({ enderecos: ["192.168.0.2"] })).toBeNull();
    expect(montarEnderecoPalm(null)).toBeNull();
  });
});
