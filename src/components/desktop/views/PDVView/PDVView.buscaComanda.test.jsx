// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Busca de comanda na Frente de Caixa.
 *
 * O campo descartava tudo que não fosse dígito, então digitar "Balcão" não
 * escrevia nada na tela e não dava retorno nenhum, mesmo sendo exatamente o
 * nome que o modal de nova comanda sugere ("Ex: Mesa 1, Balcão, Delivery...").
 * A grade abaixo sempre soube filtrar por nome da comanda e por garçom, e o
 * estado vazio dela já dizia `"x" não corresponde a nenhuma comanda em aberto`:
 * a capacidade existia e só o input a bloqueava. No Palm a busca por nome
 * sempre funcionou, o desktop era o único lugar sem.
 */

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/hooks/useTravaComanda", () => ({ useTravaComanda: () => ({ bloqueio: null }) }));

import { setAppMock } from "@/test/mockApp";
import PDVView from "./index";

const comanda = (id, numero, garcom) => ({
  id, comanda: numero, mesa: "", garcom, status: "open",
  items: [{ uid: `${id}-1`, id: 1, name: "Cerveja", price: 10, qty: 1 }],
  total: 10, created_at: new Date().toISOString(),
});

const BALCAO = comanda("ORDEM_B", "Balcão", "Bruno");
const MESA7  = comanda("ORDEM7", "7", "Carla");

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({
    caixaAberto: true,
    pending: [BALCAO, MESA7],
    products: [],
    updatePending: vi.fn(() => Promise.resolve({ error: null })),
    addPending: vi.fn(() => Promise.resolve({ error: null })),
    removePending: vi.fn(() => Promise.resolve({ error: null })),
  });
  render(<MemoryRouter><PDVView notify={vi.fn()} /></MemoryRouter>);
});

const buscar = (texto) =>
  fireEvent.change(screen.getByPlaceholderText(/Buscar comanda/), { target: { value: texto } });

const campo = () => screen.getByPlaceholderText(/Buscar comanda/);

describe("PDV, buscar comanda por nome", () => {
  it("digitar um nome escreve no campo e acha a comanda", () => {
    buscar("Balcão");

    expect(campo()).toHaveValue("Balcão");
    expect(screen.getByRole("button", { name: /Balcão/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Comanda 7/ })).not.toBeInTheDocument();
  });

  it("buscar pelo nome do garçom também funciona", () => {
    buscar("Carla");

    expect(screen.getByRole("button", { name: /Comanda 7/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Balcão/ })).not.toBeInTheDocument();
  });

  it("nome que não existe explica o que aconteceu, em vez de ficar em branco", () => {
    buscar("Varanda");

    expect(campo()).toHaveValue("Varanda");
    expect(screen.getByText(/não corresponde a nenhuma comanda em aberto/)).toBeInTheDocument();
  });

  it("buscar por número continua funcionando", () => {
    buscar("7");

    expect(screen.getByRole("button", { name: /Comanda 7/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Balcão/ })).not.toBeInTheDocument();
  });
});
