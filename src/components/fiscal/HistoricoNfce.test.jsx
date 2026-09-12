// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

const listarNfceEmitidas = vi.fn();
const contarAlertasNfce = vi.fn();
vi.mock("@/lib/nfceEmitidasRepo", () => ({
  listarNfceEmitidas: (...a) => listarNfceEmitidas(...a),
  contarAlertasNfce: (...a) => contarAlertasNfce(...a),
  buscarNfcePorVenda: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock("@/lib/fiscal", () => ({
  buscarEmitenteFiscal: vi.fn().mockResolvedValue(null),
}));

// A fila offline mora no IndexedDB (F021 fatia 2) e responde depois do primeiro
// render. Este falso deixa a hidratação acontecer na hora que o teste quiser.
let pendenciasNaFila = 0;
const assinantes = new Set();
const hidratacaoTermina = (quantas) => {
  pendenciasNaFila = quantas;
  for (const fn of [...assinantes]) fn();
};
vi.mock("@/lib/offline/filaApp", () => ({
  contarPendenciasFiscais: () => pendenciasNaFila,
  assinarFilaOffline: (fn) => {
    assinantes.add(fn);
    return () => assinantes.delete(fn);
  },
}));

// Stubs das unidades de ação — o foco do teste é a TELA; as duas já têm testes
// próprios. Marcam a presença por linha.
vi.mock("./BotaoReimprimirNfce", () => ({
  default: ({ registroInicial }) => <div data-testid="reimprimir">{registroInicial?.id}</div>,
}));
vi.mock("./CancelarNfce", () => ({
  default: ({ registroInicial }) => <div data-testid="cancelar">{registroInicial?.id}</div>,
}));

import HistoricoNfce from "./HistoricoNfce";

function nota(over = {}) {
  return {
    id: "n1", venda_id: "v1", chave: "43260712345678000195650010000000011000000017",
    numero: 12, serie: 1, status: "autorizada", tp_amb: 1, protocolo: "135260000123456",
    v_nf: 30, dh_emi: "2026-07-13T14:00:00.000Z", created_at: "2026-07-13T14:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pendenciasNaFila = 0;
  assinantes.clear();
  contarAlertasNfce.mockResolvedValue({ rejeitada: 0, pendente: 0, error: null });
});

describe("<HistoricoNfce>, histórico de NFC-e (Leva 12)", () => {
  it("estado carregando: mostra o spinner com texto humano", async () => {
    let resolver;
    listarNfceEmitidas.mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<HistoricoNfce />);

    expect(screen.getByText(/Carregando as notas emitidas/i)).toBeTruthy();
    resolver({ data: [], error: null, temMais: false });
    await waitFor(() => expect(screen.getByText(/Nenhuma nota fiscal por aqui ainda/i)).toBeTruthy());
  });

  it("estado vazio: mensagem acolhedora quando não há notas", async () => {
    listarNfceEmitidas.mockResolvedValue({ data: [], error: null, temMais: false });
    render(<HistoricoNfce />);

    expect(await screen.findByText(/Nenhuma nota fiscal por aqui ainda/i)).toBeTruthy();
  });

  it("estado erro: mostra falha e o botão 'Tentar de novo'", async () => {
    listarNfceEmitidas.mockResolvedValue({ data: [], error: new Error("falhou"), temMais: false });
    render(<HistoricoNfce />);

    expect(await screen.findByText(/Não foi possível carregar as notas/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tentar de novo/i })).toBeTruthy();
  });

  it("lista: monta linhas com badge por status e as ações por linha", async () => {
    listarNfceEmitidas.mockResolvedValue({
      data: [
        nota({ id: "n1", status: "autorizada" }),
        nota({ id: "n2", status: "cancelada", numero: 11 }),
      ],
      error: null,
      temMais: false,
    });
    render(<HistoricoNfce />);

    expect(await screen.findByText("Autorizada")).toBeTruthy();
    expect(screen.getByText("Cancelada")).toBeTruthy();
    expect(screen.getByText(/Nº 12/)).toBeTruthy();
    // Ações presentes em cada linha (uma reimpressão + um cancelar por nota).
    expect(screen.getAllByTestId("reimprimir")).toHaveLength(2);
    expect(screen.getAllByTestId("cancelar")).toHaveLength(2);
  });

  it("pendência fiscal da sessão anterior aparece quando a hidratação termina", async () => {
    listarNfceEmitidas.mockResolvedValue({ data: [], error: null, temMais: false });
    const { unmount } = render(<HistoricoNfce />);

    // Primeiro render: o espelho do IndexedDB ainda está vazio, nada a avisar.
    expect(screen.queryByText(/ainda não foi emitida/i)).toBeNull();

    await act(async () => hidratacaoTermina(1));
    expect(screen.getByText(/1 nota ainda não foi emitida/i)).toBeTruthy();

    await act(async () => hidratacaoTermina(3));
    expect(screen.getByText(/3 notas ainda não foram emitidas/i)).toBeTruthy();

    unmount();
  });

  it("desmontar cancela a assinatura da hidratação", async () => {
    listarNfceEmitidas.mockResolvedValue({ data: [], error: null, temMais: false });
    const { unmount } = render(<HistoricoNfce />);

    expect(assinantes.size).toBe(1);
    unmount();
    expect(assinantes.size).toBe(0);
  });

  it("troca de filtro de status dispara nova busca", async () => {
    listarNfceEmitidas.mockResolvedValue({ data: [], error: null, temMais: false });
    render(<HistoricoNfce />);

    await waitFor(() => expect(listarNfceEmitidas).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Autorizadas" }));

    await waitFor(() => expect(listarNfceEmitidas).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "autorizada" }),
    ));
  });
});

/**
 * D06, nota que CHEGOU à SEFAZ e voltou rejeitada, ou ficou pendente.
 *
 * A tela avisava bem sobre a fila offline (nota que nunca chegou à SEFAZ), mas
 * não havia sinal nenhum para essas. Para descobrir era preciso suspeitar e
 * clicar no chip "Rejeitadas", e uma venda sem nota válida ficava invisível por
 * tempo indeterminado.
 */
describe("<HistoricoNfce>, os chips avisam sem precisar clicar (D06)", () => {
  beforeEach(() => {
    listarNfceEmitidas.mockResolvedValue({ data: [], error: null, temMais: false });
  });

  it("mostra a contagem de rejeitadas e pendentes no próprio chip", async () => {
    contarAlertasNfce.mockResolvedValue({ rejeitada: 2, pendente: 1, error: null });
    render(<HistoricoNfce />);

    expect(await screen.findByRole("button", { name: "Rejeitadas 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pendentes 1" })).toBeTruthy();
  });

  it("o chip com nota esperando ação se destaca, os outros não", async () => {
    contarAlertasNfce.mockResolvedValue({ rejeitada: 2, pendente: 0, error: null });
    render(<HistoricoNfce />);

    const rejeitadas = await screen.findByRole("button", { name: "Rejeitadas 2" });
    expect(rejeitadas.className).toContain("historico-nfce__chip--alerta");
    expect(screen.getByRole("button", { name: "Canceladas" }).className)
      .not.toContain("historico-nfce__chip--alerta");
  });

  it("sem nota esperando ação, nenhum chip ganha número nem destaque", async () => {
    render(<HistoricoNfce />);

    expect(await screen.findByRole("button", { name: "Rejeitadas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pendentes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rejeitadas" }).className)
      .not.toContain("historico-nfce__chip--alerta");
  });

  it("falha na contagem não atrapalha a lista, os chips só ficam sem número", async () => {
    contarAlertasNfce.mockResolvedValue({ rejeitada: 0, pendente: 0, error: new Error("boom") });
    render(<HistoricoNfce />);

    expect(await screen.findByRole("button", { name: "Rejeitadas" })).toBeTruthy();
    expect(screen.getByText(/Nenhuma nota fiscal por aqui ainda/i)).toBeTruthy();
  });
});
