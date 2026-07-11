import { describe, it, expect, vi, beforeEach } from "vitest";

const emitirEvento = vi.fn();
vi.mock("./jarvas", () => ({ emitirEvento: (...args) => emitirEvento(...args) }));

import { emitirDocumentoFiscal } from "./fiscal";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("emitirDocumentoFiscal (stub — sem provedor fiscal integrado)", () => {
  it("retorna status 'stub' sem chamar nenhum provedor externo", async () => {
    const resultado = await emitirDocumentoFiscal({ id: "v1", total: 50, comanda: "12" }, { usuario: "maria" });

    expect(resultado).toEqual({ status: "stub", vendaId: "v1" });
  });

  it("registra a intenção de emissão como evento (Jarvas/Event Bus), não como chamada de API", async () => {
    await emitirDocumentoFiscal({ id: "v1", total: 50, comanda: "12" }, { usuario: "maria" });

    expect(emitirEvento).toHaveBeenCalledWith(
      "fiscal.documento_simulado",
      "fiscal",
      { venda_id: "v1", total: 50, comanda: "12" },
      "maria",
    );
  });

  it("nunca lança, mesmo com venda incompleta", async () => {
    await expect(emitirDocumentoFiscal({})).resolves.toEqual({ status: "stub", vendaId: null });
  });
});
