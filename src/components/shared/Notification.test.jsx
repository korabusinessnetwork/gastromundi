// @vitest-environment jsdom
//
// `useNotification` — o toast que confirma cada ação do PDV.
//
// O furo: o setTimeout de 2,5 s não era guardado nem cancelado. Duas
// notificações em menos de 2,5 s (lançar item e receber pagamento, a sequência
// mais comum do balcão) e o temporizador da PRIMEIRA apagava a mensagem NOVA
// antes da hora, então o operador via o "Pagamento recebido" sumir num piscar.
// O temporizador também sobrevivia à desmontagem da tela, agendando um
// setState em componente que já saiu.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useNotification } from "./Notification";

function Tela() {
  const { notif, notify } = useNotification();
  return (
    <div>
      <span data-testid="msg">{notif?.msg ?? ""}</span>
      <button onClick={() => notify("Item lançado na comanda 12")}>Primeira</button>
      <button onClick={() => notify("Pagamento recebido")}>Segunda</button>
    </div>
  );
}

const mensagem = () => screen.getByTestId("msg").textContent;
const avancar = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const clicar = (rotulo) => act(() => { fireEvent.click(screen.getByText(rotulo)); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useNotification", () => {
  it("a mensagem some depois de 2,5 s", () => {
    render(<Tela />);
    clicar("Primeira");
    expect(mensagem()).toBe("Item lançado na comanda 12");

    avancar(2499);
    expect(mensagem()).toBe("Item lançado na comanda 12");
    avancar(1);
    expect(mensagem()).toBe("");
  });

  it("duas notificações seguidas: o temporizador da primeira não apaga a segunda", () => {
    render(<Tela />);
    clicar("Primeira");
    avancar(2000);

    clicar("Segunda");
    expect(mensagem()).toBe("Pagamento recebido");

    // Aqui o temporizador ANTIGO venceria (2,5 s da primeira) e apagaria a
    // mensagem nova, que só está na tela há 0,5 s.
    avancar(500);
    expect(mensagem()).toBe("Pagamento recebido");

    // A segunda tem os seus 2,5 s inteiros, contados do próprio clique.
    avancar(1999);
    expect(mensagem()).toBe("Pagamento recebido");
    avancar(1);
    expect(mensagem()).toBe("");
  });

  it("o temporizador não sobrevive à desmontagem da tela", () => {
    const { unmount } = render(<Tela />);
    clicar("Primeira");
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
