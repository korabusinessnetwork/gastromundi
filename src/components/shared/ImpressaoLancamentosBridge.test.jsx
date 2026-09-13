// @vitest-environment jsdom
//
// O pedido que o garçom lança COM internet chega ao caixa pelo realtime e é o
// PC do caixa que imprime. Quando esse papel não saía, a falha ia para um
// `console.error` e morria ali: a cozinha ficava sem a comanda e o salão só
// descobria pela reclamação do cliente. E não é caso raro, é o caso comum, o
// navegador bloqueando o pop-up da janela de impressão que ninguém pediu.
//
// Estes testes seguram o combinado: a falha aparece na tela, dizendo QUAL
// comanda ficou sem a via, e a impressão continua fire-and-forget.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockUseApp, imprimirLancamento } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  imprimirLancamento: vi.fn(),
}));
vi.mock("@/context/AppContext", () => ({ useApp: mockUseApp }));
// A impressão de verdade não entra aqui (e evita arrastar o Supabase).
vi.mock("@/lib/impressao/despacho", () => ({ imprimirLancamento }));

import ImpressaoLancamentosBridge from "./ImpressaoLancamentosBridge";

/** PC do caixa, gerente logado, comandas já carregadas. */
const contexto = (pending) => ({
  isMobile: false,
  currentUser: { id: 1, username: "gerente" },
  pending,
  loading: false,
});

/**
 * Comanda com um lançamento só. O `id` é único por teste porque o registro de
 * lançamentos vistos é um só por aparelho (e por arquivo de teste).
 */
const comanda = (id, nome, instante, extra = {}) => ({
  id,
  comanda: nome,
  items: [{ name: "X-Burguer", qty: 1, launched_at: instante }],
  ...extra,
});

const montar = (pending) => {
  mockUseApp.mockReturnValue(contexto(pending));
  return render(<ImpressaoLancamentosBridge />);
};

/** Chega o pedido pelo realtime, depois da semeadura da abertura do caixa. */
const chegaPeloRealtime = (rerender, pending) => {
  mockUseApp.mockReturnValue(contexto(pending));
  rerender(<ImpressaoLancamentosBridge />);
};

let erroNoConsole;

beforeEach(() => {
  vi.clearAllMocks();
  erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { erroNoConsole.mockRestore(); });

describe("ImpressaoLancamentosBridge, a falha de impressão chega ao salão", () => {
  it("não desenha nada enquanto os papéis estão saindo", async () => {
    imprimirLancamento.mockResolvedValue({ error: null });
    const { rerender, container } = montar([]);
    chegaPeloRealtime(rerender, [comanda("c-ok", "3", "2026-09-12T19:00:00.000Z")]);

    await waitFor(() => expect(imprimirLancamento).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("papel que não saiu vira aviso na tela dizendo qual comanda ficou sem a via", async () => {
    // Pop-up bloqueado é o erro que o driver padrão devolve na impressão
    // automática, porque ela acontece sem gesto do usuário.
    imprimirLancamento.mockResolvedValue({
      error: { message: "Não foi possível abrir a janela de impressão. Verifique se o navegador bloqueou o pop-up." },
    });
    const { rerender } = montar([]);
    chegaPeloRealtime(rerender, [comanda("c-12", "12", "2026-09-12T19:05:00.000Z")]);

    expect(await screen.findByText("Comanda 12 não saiu na impressora")).toBeInTheDocument();
    expect(screen.getByText(/reimprima pela tela da Cozinha/)).toBeInTheDocument();
    // Anunciado sem roubar o foco de quem está lançando a próxima comanda.
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("exceção na impressão também chega à tela, e nunca estoura para fora", async () => {
    imprimirLancamento.mockRejectedValue(new Error("impressora desapareceu"));
    const { rerender } = montar([]);
    chegaPeloRealtime(rerender, [comanda("c-7", "7", "2026-09-12T19:10:00.000Z")]);

    expect(await screen.findByText("Comanda 7 não saiu na impressora")).toBeInTheDocument();
  });

  it("duas comandas sem papel são contadas e nomeadas, e o botão dispensa o aviso", async () => {
    imprimirLancamento.mockResolvedValue({ error: { message: "sem papel" } });
    const { rerender } = montar([]);
    chegaPeloRealtime(rerender, [
      comanda("c-20", "20", "2026-09-12T19:15:00.000Z"),
      comanda("c-21", "", "2026-09-12T19:16:00.000Z", { mesa: "4" }),
    ]);

    expect(await screen.findByText("2 comandas não saíram na impressora")).toBeInTheDocument();
    expect(screen.getByText(/Não saíram: Comanda 20, Mesa 4\./)).toBeInTheDocument();

    // Quem resolve é a pessoa, reimprimindo pela Cozinha: o botão só reconhece
    // que ela foi resolvida, e aí o aviso some.
    fireEvent.click(screen.getByRole("button", { name: "Já reimprimi" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("a impressão é fire-and-forget: a tela não espera o papel para seguir", async () => {
    // Promessa que nunca resolve = impressora pendurada. O render tem de
    // terminar do mesmo jeito, senão a venda pararia junto com o papel.
    imprimirLancamento.mockReturnValue(new Promise(() => {}));
    const { rerender, container } = montar([]);
    chegaPeloRealtime(rerender, [comanda("c-99", "99", "2026-09-12T19:20:00.000Z")]);

    // O render já voltou com a impressora pendurada, e a tela segue limpa.
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(imprimirLancamento).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });
});
