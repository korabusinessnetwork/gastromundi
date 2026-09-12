// @vitest-environment jsdom
//
// D06 — a tela avisava bem sobre a fila offline (nota que nunca chegou à
// SEFAZ), mas não havia sinal nenhum para nota que CHEGOU e voltou rejeitada,
// ou ficou pendente em nfce_emitidas. Para descobrir era preciso suspeitar e
// clicar no chip "Rejeitadas", e uma venda sem nota válida ficava invisível
// por tempo indeterminado.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { listarNfceEmitidas, contarAlertasNfce } = vi.hoisted(() => ({
  listarNfceEmitidas: vi.fn(),
  contarAlertasNfce: vi.fn(),
}));

vi.mock("@/lib/nfceEmitidasRepo", () => ({ listarNfceEmitidas, contarAlertasNfce }));
vi.mock("@/lib/fiscal", () => ({ buscarEmitenteFiscal: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/lib/offline/filaApp", () => ({
  contarPendenciasFiscais: vi.fn(() => 0),
  assinarFilaOffline: vi.fn(() => () => {}),
}));
vi.mock("./BotaoReimprimirNfce", () => ({ default: () => null }));
vi.mock("./CancelarNfce", () => ({ default: () => null }));

import HistoricoNfce from "./HistoricoNfce";

beforeEach(() => {
  vi.clearAllMocks();
  listarNfceEmitidas.mockResolvedValue({ data: [], error: null, temMais: false });
  contarAlertasNfce.mockResolvedValue({ rejeitada: 2, pendente: 1, error: null });
});

describe("HistoricoNfce, os chips avisam sem precisar clicar (D06)", () => {
  it("mostra a contagem de rejeitadas e pendentes no próprio chip", async () => {
    render(<HistoricoNfce />);

    expect(await screen.findByRole("button", { name: "Rejeitadas 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pendentes 1" })).toBeInTheDocument();
  });

  it("o chip com nota esperando ação se destaca, os outros não", async () => {
    render(<HistoricoNfce />);

    const rejeitadas = await screen.findByRole("button", { name: "Rejeitadas 2" });
    expect(rejeitadas.className).toContain("historico-nfce__chip--alerta");
    expect(screen.getByRole("button", { name: "Canceladas" }).className)
      .not.toContain("historico-nfce__chip--alerta");
  });

  it("sem nota esperando ação, nenhum chip ganha número nem destaque", async () => {
    contarAlertasNfce.mockResolvedValue({ rejeitada: 0, pendente: 0, error: null });
    render(<HistoricoNfce />);

    expect(await screen.findByRole("button", { name: "Rejeitadas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pendentes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rejeitadas" }).className)
      .not.toContain("historico-nfce__chip--alerta");
  });

  it("falha na contagem não atrapalha a lista, os chips só ficam sem número", async () => {
    contarAlertasNfce.mockResolvedValue({ rejeitada: 0, pendente: 0, error: new Error("boom") });
    render(<HistoricoNfce />);

    expect(await screen.findByRole("button", { name: "Rejeitadas" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma nota fiscal por aqui ainda.")).toBeInTheDocument();
  });
});
