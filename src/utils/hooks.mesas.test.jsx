// @vitest-environment jsdom
//
// `useMesas` — a carga das mesas do salão (mapa do PDV e aba Reservas).
//
// O furo: a carga era `.then(({ data }) => { setMesas(data ?? []); ... })`, sem
// checar `error`. Falha de rede ou recusa de RLS virava lista vazia com
// carregamento concluído, e a aba Reservas mostrava "Nenhuma mesa cadastrada",
// convidando o operador a cadastrar de novo mesas que já existem. O vizinho
// `usePedidosCozinha` já fazia o contrário de propósito, e o hook das mesas não
// seguia a regra da casa.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const mockSupabase = vi.hoisted(() => ({ atual: null }));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.atual = createMockSupabase();
  return { supabase: mockSupabase.atual };
});

// `hooks.js` importa esta folha no topo (usePedidosDelivery) — precisa existir.
vi.mock("@/lib/deliveryPedidos", () => ({
  listarPedidosDelivery: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

import { useMesas } from "./hooks";

const supa = () => mockSupabase.atual;

const MESA_5 = { numero: "5", capacidade: 4, status_manual: "livre" };
const MESA_6 = { numero: "6", capacidade: 2, status_manual: "reservada" };
const FALHA = { message: "TypeError: Failed to fetch" };

function Tela() {
  const { mesas, loading, erro, recarregar } = useMesas();
  return (
    <div>
      <span data-testid="estado">{loading ? "carregando" : erro ? "erro" : "ok"}</span>
      <ul data-testid="mesas">
        {mesas.map((m) => <li key={m.numero}>{`mesa ${m.numero}`}</li>)}
      </ul>
      <button onClick={recarregar}>Recarregar mesas</button>
    </div>
  );
}

const estado = () => screen.getByTestId("estado").textContent;
const mesasNaTela = () =>
  [...screen.getByTestId("mesas").querySelectorAll("li")].map((li) => li.textContent);

/** Deixa as promessas pendentes assentarem dentro de um act. */
const assentar = () => act(async () => { await Promise.resolve(); });

async function montar() {
  await act(async () => { render(<Tela />); });
}

beforeEach(() => {
  supa().reset();
});

describe("useMesas", () => {
  it("falha na leitura vira `erro`, e não salão vazio", async () => {
    supa().setTableError("mesas", FALHA);
    await montar();

    expect(estado()).toBe("erro");
    expect(mesasNaTela()).toEqual([]);
  });

  it("leitura boa não levanta erro nenhum", async () => {
    supa().setTableResult("mesas", { data: [MESA_5, MESA_6], error: null });
    await montar();

    expect(estado()).toBe("ok");
    expect(mesasNaTela()).toEqual(["mesa 5", "mesa 6"]);
  });

  it("`recarregar` dá a segunda chance: o que falhou antes aparece agora", async () => {
    supa().setTableError("mesas", FALHA);
    await montar();
    expect(estado()).toBe("erro");

    supa().reset();
    supa().setTableResult("mesas", { data: [MESA_5], error: null });
    await act(async () => { fireEvent.click(screen.getByText("Recarregar mesas")); });
    await assentar();

    expect(estado()).toBe("ok");
    expect(mesasNaTela()).toEqual(["mesa 5"]);
  });

  it("falha depois de carregar não apaga as mesas que já estavam na tela", async () => {
    supa().setTableResult("mesas", { data: [MESA_5, MESA_6], error: null });
    await montar();
    expect(mesasNaTela()).toEqual(["mesa 5", "mesa 6"]);

    supa().reset();
    supa().setTableError("mesas", FALHA);
    await act(async () => { fireEvent.click(screen.getByText("Recarregar mesas")); });
    await assentar();

    expect(estado()).toBe("erro");
    expect(mesasNaTela()).toEqual(["mesa 5", "mesa 6"]);
  });
});
