// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const buscarNfcePorVenda = vi.fn();
vi.mock("@/lib/nfceEmitidasRepo", () => ({
  buscarNfcePorVenda: (...a) => buscarNfcePorVenda(...a),
}));

// vendasRepo puxa o supabase.js real (que exige .env.local no import) — mockar
// para a suíte rodar sem ambiente. Só é chamado na carga sob demanda da venda.
const buscarVendaCompleta = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock("@/lib/vendasRepo", () => ({
  buscarVendaCompleta: (...a) => buscarVendaCompleta(...a),
}));

import BotaoReimprimirNfce from "./BotaoReimprimirNfce";

const CHAVE = "43260712345678000195650010000000011000000017";

const venda = {
  id: "v1",
  items: [{ id: "p1", name: "X-Salada", price: 15, qty: 2 }],
  pagamentos: [{ metodo: "dinheiro", valor: 30 }],
  dest: null,
};

const emit = { xNome: "Zé Lanches LTDA", xFant: "Zé Lanches", cnpj: "12345678000195" };

function registro(over = {}) {
  return {
    id: "n1", venda_id: "v1", chave: CHAVE, protocolo: "135260000123456",
    status: "autorizada", tp_amb: 1, tp_emis: 1,
    dh_emi: "2026-07-13T14:00:00.000Z",
    url_qrcode: "https://sefaz.rs.gov.br/nfce?p=X|2|1|1|HASH",
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("<BotaoReimprimirNfce> — reimpressão do cupom (Leva 9)", () => {
  it("nota autorizada: mostra o botão 'Reimprimir cupom' e abre o cupom ao clicar", async () => {
    buscarNfcePorVenda.mockResolvedValue({ data: registro(), error: null });
    render(<BotaoReimprimirNfce venda={venda} emit={emit} />);

    const botao = await screen.findByRole("button", { name: /Reimprimir cupom/i });
    fireEvent.click(botao);

    // A modal (mesmo <CupomNfce> da emissão) abre com o Imprimir.
    expect(await screen.findByRole("dialog", { name: /Cupom da NFC-e/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeTruthy();
  });

  it("nota pendente: mostra o estado humano, sem botão de reimprimir", async () => {
    buscarNfcePorVenda.mockResolvedValue({ data: registro({ status: "pendente" }), error: null });
    render(<BotaoReimprimirNfce venda={venda} emit={emit} />);

    expect(await screen.findByText(/contingência/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reimprimir cupom/i })).toBeNull();
  });

  it("sem nota para a venda: estado humano 'ainda não tem NFC-e'", async () => {
    buscarNfcePorVenda.mockResolvedValue({ data: null, error: null });
    render(<BotaoReimprimirNfce venda={venda} emit={emit} />);

    expect(await screen.findByText(/ainda não tem NFC-e/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reimprimir cupom/i })).toBeNull();
  });

  it("mostra 'Verificando…' enquanto carrega a nota", async () => {
    let resolver;
    buscarNfcePorVenda.mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<BotaoReimprimirNfce venda={venda} emit={emit} />);

    expect(screen.getByText(/Verificando NFC-e/i)).toBeTruthy();
    resolver({ data: registro(), error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: /Reimprimir cupom/i })).toBeTruthy());
  });
});
