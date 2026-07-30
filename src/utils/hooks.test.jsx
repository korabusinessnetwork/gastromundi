// @vitest-environment jsdom
//
// Run 5, leva 5 — `useIdleTimer`, o cronômetro que cumpre a promessa da tela de
// login ("a sessão expira após 30 min de inatividade").
//
// Dois furos que este arquivo trava:
//   1. A lista de eventos não tinha `wheel` nem `scroll`. Quem lê um relatório
//      longo rolando a página está na frente da tela, e levava logout no meio
//      da leitura — no PDV, sem tocar em mouse ou teclado por 30 minutos
//      enquanto rola a lista de comandas, é o mesmo caso.
//   2. `scroll` de elemento NÃO borbulha. Sem registrar na fase de captura,
//      rolar qualquer painel interno (a lista de produtos, o extrato do caixa)
//      não contava como atividade nenhuma. A captura também impede que um
//      `stopPropagation` de um filho esconda a atividade do cronômetro.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

// Folhas com efeito colateral no módulo — `hooks.js` importa as duas no topo.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
      return ch;
    }),
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/lib/deliveryPedidos", () => ({
  listarPedidosDelivery: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

import { useIdleTimer } from "./hooks";

const EVENTOS = ["mousemove", "keydown", "click", "touchstart", "wheel", "scroll"];
const DELAY = 1000;

function Tela({ cb, delay = DELAY, enabled = true }) {
  useIdleTimer(cb, delay, enabled);
  return <div data-testid="painel">conteúdo</div>;
}

/** Avança o relógio dentro de um act, para o React processar o que vier. */
const avancar = (ms) => act(() => { vi.advanceTimersByTime(ms); });

/** Dispara um evento cru — sem os wrappers do testing-library, que só emitem eventos que borbulham. */
const disparar = (alvo, nome, borbulha) => act(() => {
  alvo.dispatchEvent(new Event(nome, { bubbles: borbulha }));
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIdleTimer", () => {
  it("dispara o callback depois do tempo de inatividade", () => {
    const cb = vi.fn();
    render(<Tela cb={cb} />);

    avancar(DELAY - 1);
    expect(cb).not.toHaveBeenCalled();

    avancar(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("atividade de mouse reinicia a contagem", () => {
    const cb = vi.fn();
    render(<Tela cb={cb} />);

    avancar(900);
    disparar(window, "mousemove", true);
    avancar(900);
    expect(cb).not.toHaveBeenCalled();

    avancar(100);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("teclado, clique e toque também contam como atividade", () => {
    for (const nome of ["keydown", "click", "touchstart"]) {
      const cb = vi.fn();
      const { unmount } = render(<Tela cb={cb} />);

      avancar(900);
      disparar(window, nome, true);
      avancar(900);

      expect(cb, `evento ${nome}`).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("rolar a roda do mouse conta como atividade", () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Tela cb={cb} />);

    avancar(900);
    disparar(getByTestId("painel"), "wheel", true);
    avancar(900);

    expect(cb).not.toHaveBeenCalled();
  });

  it("rolar um painel interno conta como atividade, mesmo sem borbulhar", () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Tela cb={cb} />);

    avancar(900);
    // `scroll` de elemento não borbulha: só a fase de captura no window o vê.
    disparar(getByTestId("painel"), "scroll", false);
    avancar(900);

    expect(cb).not.toHaveBeenCalled();
  });

  it("um filho que barra a propagação não esconde a atividade", () => {
    const cb = vi.fn();
    const { getByTestId } = render(<Tela cb={cb} />);
    const painel = getByTestId("painel");
    painel.addEventListener("mousemove", (e) => e.stopPropagation());

    avancar(900);
    disparar(painel, "mousemove", true);
    avancar(900);

    expect(cb).not.toHaveBeenCalled();
  });

  it("desligado não arma cronômetro nenhum", () => {
    const cb = vi.fn();
    render(<Tela cb={cb} enabled={false} />);

    avancar(DELAY * 10);

    expect(cb).not.toHaveBeenCalled();
  });

  it("desmontar cancela o cronômetro", () => {
    const cb = vi.fn();
    const { unmount } = render(<Tela cb={cb} />);

    avancar(900);
    unmount();
    avancar(DELAY * 5);

    expect(cb).not.toHaveBeenCalled();
  });

  it("desmontar solta os listeners na mesma fase em que foram registrados", () => {
    const espiaoAdd = vi.spyOn(window, "addEventListener");
    const espiaoRem = vi.spyOn(window, "removeEventListener");
    const cb = vi.fn();
    const { unmount } = render(<Tela cb={cb} />);

    const registrados = espiaoAdd.mock.calls
      .filter(([nome]) => EVENTOS.includes(nome))
      .map(([nome, , captura]) => `${nome}:${captura}`);
    expect(registrados.length).toBeGreaterThan(0);

    unmount();

    const soltos = espiaoRem.mock.calls
      .filter(([nome]) => EVENTOS.includes(nome))
      .map(([nome, , captura]) => `${nome}:${captura}`);
    // Fase diferente na remoção = listener vazado para sempre.
    for (const r of registrados) expect(soltos).toContain(r);

    espiaoAdd.mockRestore();
    espiaoRem.mockRestore();
  });
});
