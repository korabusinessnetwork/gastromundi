// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Edge/repo mockado (não toca supabase real → suíte hermética, sem .env.local).
const inutilizarNumeracao = vi.fn().mockResolvedValue({ status: "inutilizada" });
vi.mock("@/lib/fiscal", () => ({
  inutilizarNumeracao: (...a) => inutilizarNumeracao(...a),
}));

import InutilizarNumeracao, { validarFaixa } from "./InutilizarNumeracao";

function preencherValido() {
  fireEvent.change(screen.getByLabelText(/Número inicial/i), { target: { value: "45" } });
  fireEvent.change(screen.getByLabelText(/Número final/i), { target: { value: "48" } });
  fireEvent.change(screen.getByLabelText(/Justificativa/i), {
    target: { value: "Falha técnica pulou a numeração; faixa nunca emitida." },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inutilizarNumeracao.mockResolvedValue({ status: "inutilizada" });
});

describe("validarFaixa (pura)", () => {
  it("aceita faixa coerente e justificativa suficiente", () => {
    expect(validarFaixa({ serie: 1, nNFIni: 45, nNFFin: 48, justificativa: "x".repeat(15) })).toEqual({});
  });
  it("acusa final < inicial e justificativa curta", () => {
    const e = validarFaixa({ serie: 1, nNFIni: 50, nNFFin: 40, justificativa: "curta" });
    expect(e.nNFFin).toMatch(/final deve ser ≥/);
    expect(e.justificativa).toBeTruthy();
  });
});

describe("<InutilizarNumeracao> (Leva 11)", () => {
  it("renderiza os campos da faixa e usa a série atual", () => {
    render(<InutilizarNumeracao serieAtual={2} />);
    expect(screen.getByLabelText(/^Série$/i).value).toBe("2");
    expect(screen.getByLabelText(/Número inicial/i)).toBeTruthy();
    expect(screen.getByLabelText(/Número final/i)).toBeTruthy();
    expect(screen.getByLabelText(/Justificativa/i)).toBeTruthy();
  });

  it("mantém o botão desabilitado enquanto a faixa é inválida", () => {
    render(<InutilizarNumeracao serieAtual={1} />);
    expect(screen.getByRole("button", { name: /Inutilizar faixa/i })).toBeDisabled();
    // final < inicial → segue inválido, com motivo visível.
    fireEvent.change(screen.getByLabelText(/Número inicial/i), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText(/Número final/i), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/Justificativa/i), {
      target: { value: "Falha técnica pulou a numeração; faixa nunca emitida." },
    });
    expect(screen.getByRole("button", { name: /Inutilizar faixa/i })).toBeDisabled();
    expect(screen.getByText(/final deve ser ≥/i)).toBeTruthy();
  });

  it("exige confirmação explícita em duas etapas antes de enviar", async () => {
    render(<InutilizarNumeracao serieAtual={1} />);
    preencherValido();
    fireEvent.click(screen.getByRole("button", { name: /Inutilizar faixa/i }));
    // Não enviou ainda — apareceu a confirmação.
    expect(inutilizarNumeracao).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Confirmar inutilização/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Confirmar inutilização/i }));
    await waitFor(() => expect(inutilizarNumeracao).toHaveBeenCalledTimes(1));
    expect(inutilizarNumeracao.mock.calls[0][0]).toMatchObject({ serie: 1, nNFIni: 45, nNFFin: 48 });
    expect(await screen.findByText(/inutilizada na SEFAZ/i)).toBeTruthy();
  });

  it("rejeição da SEFAZ mostra o motivo (sem botão morto)", async () => {
    inutilizarNumeracao.mockResolvedValue({ status: "rejeitada", xMotivo: "Um número da faixa já foi inutilizado" });
    render(<InutilizarNumeracao serieAtual={1} />);
    preencherValido();
    fireEvent.click(screen.getByRole("button", { name: /Inutilizar faixa/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar inutilização/i }));
    expect(await screen.findByText(/já foi inutilizado/i)).toBeTruthy();
  });

  it("sem_chave mostra mensagem humana de indisponibilidade", async () => {
    inutilizarNumeracao.mockResolvedValue({ status: "sem_chave" });
    render(<InutilizarNumeracao serieAtual={1} />);
    preencherValido();
    fireEvent.click(screen.getByRole("button", { name: /Inutilizar faixa/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar inutilização/i }));
    expect(await screen.findByText(/falta o certificado/i)).toBeTruthy();
  });
});
