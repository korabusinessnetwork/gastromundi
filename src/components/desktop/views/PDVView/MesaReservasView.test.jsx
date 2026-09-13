// @vitest-environment jsdom
//
// Aba "Reservas" do PDV — salão SEM mesa e salão que NÃO FOI LIDO são duas
// situações diferentes, e a tela mostrava a mesma coisa nas duas ("Nenhuma mesa
// cadastrada"). Numa falha de rede ou de RLS, isso mandava o operador cadastrar
// de novo mesas que já existem. Agora a falha tem tela própria, com
// "Tentar de novo".
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MesaReservasView from "./MesaReservasView";

const MESA_5 = { numero: "5", capacidade: 4, status_manual: "livre" };
const FALHA = { message: "TypeError: Failed to fetch" };

const montar = (props = {}) =>
  render(
    <MesaReservasView
      mesas={[]}
      loading={false}
      abertas={[]}
      atualizarStatus={vi.fn(() => Promise.resolve({ error: null }))}
      {...props}
    />,
  );

describe("MesaReservasView, leitura das mesas", () => {
  it("sem mesas e sem falha, convida a cadastrar", () => {
    montar();
    expect(screen.getByText("Nenhuma mesa cadastrada")).toBeTruthy();
    expect(screen.queryByText(/Tentar de novo/)).toBeNull();
  });

  it("falha de leitura não se passa por salão sem mesas", () => {
    montar({ erroCarga: FALHA, recarregar: vi.fn() });
    expect(screen.getByText("Não conseguimos ler as mesas")).toBeTruthy();
    expect(screen.queryByText("Nenhuma mesa cadastrada")).toBeNull();
  });

  it("o botão de nova tentativa chama o recarregar do hook", () => {
    const recarregar = vi.fn();
    montar({ erroCarga: FALHA, recarregar });
    fireEvent.click(screen.getByText(/Tentar de novo/));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("com mesas na tela, a falha avisa que a lista pode estar velha e não apaga nada", () => {
    const recarregar = vi.fn();
    montar({ mesas: [MESA_5], erroCarga: FALHA, recarregar });
    expect(screen.getByText(/pode estar desatualizada/)).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    fireEvent.click(screen.getByText(/Tentar de novo/));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });
});
