// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const buscarNfcePorVenda = vi.fn();
vi.mock("@/lib/nfceEmitidasRepo", () => ({
  buscarNfcePorVenda: (...a) => buscarNfcePorVenda(...a),
}));

const cancelarDocumentoFiscal = vi.fn();
vi.mock("@/lib/fiscal", () => ({
  cancelarDocumentoFiscal: (...a) => cancelarDocumentoFiscal(...a),
}));

import CancelarNfce from "./CancelarNfce";

const CHAVE = "43260712345678000195650010000000011000000017";
const venda = { id: "v1" };

function registro(over = {}) {
  return {
    id: "n1", venda_id: "v1", chave: CHAVE, protocolo: "143260000123456",
    status: "autorizada", tp_amb: 2, tp_emis: 1,
    dh_emi: new Date().toISOString(), // recém-emitida → dentro do prazo
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("<CancelarNfce> — cancelamento da NFC-e (Leva 10)", () => {
  it("autorizada e no prazo: exige justificativa + confirmação e chama a Edge", async () => {
    buscarNfcePorVenda.mockResolvedValue({ data: registro(), error: null });
    cancelarDocumentoFiscal.mockResolvedValue({ status: "cancelada", cStat: "135" });
    render(<CancelarNfce venda={venda} />);

    const botao = await screen.findByRole("button", { name: /Cancelar NFC-e/i });
    fireEvent.click(botao);

    const textarea = screen.getByLabelText(/Justificativa/i);
    const confirmar = screen.getByRole("button", { name: /Confirmar cancelamento/i });
    // Menos de 15 chars: confirmação desabilitada (prevenção de erro).
    expect(confirmar).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "Cliente desistiu da compra." } });
    expect(confirmar).not.toBeDisabled();

    fireEvent.click(confirmar);
    await waitFor(() => expect(cancelarDocumentoFiscal).toHaveBeenCalledWith(
      expect.objectContaining({ chave: CHAVE, justificativa: "Cliente desistiu da compra." }),
    ));
    expect(await screen.findByText(/NFC-e cancelada/i)).toBeTruthy();
  });

  it("autorizada mas fora do prazo: estado humano, sem botão de cancelar", async () => {
    const antiga = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    buscarNfcePorVenda.mockResolvedValue({ data: registro({ dh_emi: antiga }), error: null });
    render(<CancelarNfce venda={venda} />);

    expect(await screen.findByText(/Fora do prazo de cancelamento/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cancelar NFC-e/i })).toBeNull();
  });

  it("nota já cancelada: mostra o estado, sem botão", async () => {
    buscarNfcePorVenda.mockResolvedValue({ data: registro({ status: "cancelada" }), error: null });
    render(<CancelarNfce venda={venda} />);

    expect(await screen.findByText(/já cancelada/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cancelar NFC-e/i })).toBeNull();
  });

  it("evento rejeitado pela SEFAZ: mostra o motivo e a nota segue valendo", async () => {
    buscarNfcePorVenda.mockResolvedValue({ data: registro(), error: null });
    cancelarDocumentoFiscal.mockResolvedValue({ status: "autorizada", cStat: "573", xMotivo: "Duplicidade de evento" });
    render(<CancelarNfce venda={venda} />);

    fireEvent.click(await screen.findByRole("button", { name: /Cancelar NFC-e/i }));
    fireEvent.change(screen.getByLabelText(/Justificativa/i), { target: { value: "Cliente desistiu da compra." } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cancelamento/i }));

    expect(await screen.findByText(/Duplicidade de evento/i)).toBeTruthy();
  });
});
