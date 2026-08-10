// @vitest-environment jsdom
//
// Run 6, leva 7 — os pedidos que já estão na tela do estabelecimento.
//
// DL20 — uma falha de rede APAGAVA a lista de pedidos do delivery.
//   `usePedidosDelivery.recarregar` gravava `data` direto, e
//   `listarPedidosDelivery` devolve `data: []` em qualquer falha. Resultado:
//   um toque em "Atualizar" numa piscada de rede zerava a lista. Pior: tanto
//   `avancar` quanto `cancelar` chamam recarregar() logo DEPOIS de mudar o
//   status com sucesso — então o pedido que o operador acabou de aceitar
//   desaparecia da tela dele. `usePedidosCozinha` já fazia o contrário de
//   propósito ("é melhor a lista de 1 minuto atrás do que apagar pedidos
//   reais"): a regra da casa existia e o delivery não seguia.
//
// DL22 (metade de CI) — o conserto do cancelamento é um trigger que APAGA a
//   comanda espelho em `pending`. Isso só tira o pedido da cozinha se o
//   painel reagir ao evento DELETE do Realtime. O teste do trigger em si é
//   estático (src/lib/seguranca/deliveryEspelhoSqlGuard.test.js, sem Postgres no CI);
//   aqui provamos o outro lado do mecanismo: o DELETE chega e o cartão sai.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const mockSupabase = vi.hoisted(() => ({ atual: null }));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.atual = createMockSupabase();
  return { supabase: mockSupabase.atual };
});

const listarPedidosDelivery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/delivery/deliveryPedidos", () => ({ listarPedidosDelivery }));

import { usePedidosDelivery, usePedidosCozinha } from "./hooks";

const supa = () => mockSupabase.atual;

const PEDIDO = { id: "p1", numero: 1, status: "recebido" };
const OUTRO = { id: "p2", numero: 2, status: "em_preparo" };
const FALHA = { message: "TypeError: Failed to fetch" };

/** Espelha o contrato real de listarPedidosDelivery na falha: data: [] + error. */
const respostaFalha = { data: [], error: FALHA };

function TelaDelivery() {
  const { pedidos, carregando, erro, recarregar } = usePedidosDelivery();
  return (
    <div>
      <span data-testid="estado">
        {carregando ? "carregando" : erro ? "erro" : "ok"}
      </span>
      <ul data-testid="lista">
        {pedidos.map((p) => (
          <li key={p.id}>{`pedido ${p.numero}`}</li>
        ))}
      </ul>
      <button onClick={recarregar}>Atualizar</button>
    </div>
  );
}

function TelaCozinha() {
  const { pedidos, recarregar } = usePedidosCozinha();
  return (
    <div>
      <ul data-testid="comandas">
        {pedidos.map((p) => (
          <li key={p.id}>{p.comanda}</li>
        ))}
      </ul>
      <button onClick={recarregar}>Recarregar cozinha</button>
    </div>
  );
}

const numerosNaTela = () =>
  [...screen.getByTestId("lista").querySelectorAll("li")].map((li) => li.textContent);
const estado = () => screen.getByTestId("estado").textContent;
const comandasNaTela = () =>
  [...screen.getByTestId("comandas").querySelectorAll("li")].map((li) => li.textContent);

/** Deixa as promessas pendentes assentarem dentro de um act. */
const assentar = () => act(async () => { await Promise.resolve(); });

async function montar(Tela) {
  await act(async () => {
    render(<Tela />);
  });
}

beforeEach(() => {
  supa().reset();
  listarPedidosDelivery.mockReset();
});

describe("usePedidosDelivery — falha ao atualizar não pode apagar a lista (Run 6, leva 7)", () => {
  it("primeira carga bem-sucedida mostra os pedidos", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: [PEDIDO, OUTRO], error: null });
    await montar(TelaDelivery);

    expect(estado()).toBe("ok");
    expect(numerosNaTela()).toEqual(["pedido 1", "pedido 2"]);
  });

  it("falha depois de carregar mantém os pedidos e avisa do erro", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: [PEDIDO, OUTRO], error: null });
    await montar(TelaDelivery);
    expect(numerosNaTela()).toHaveLength(2);

    // A rede piscou. Aqui estava o furo: `data: []` entrava na tela e os dois
    // pedidos em andamento desapareciam.
    listarPedidosDelivery.mockResolvedValue(respostaFalha);
    await act(async () => { screen.getByText("Atualizar").click(); });

    expect(estado()).toBe("erro");
    expect(numerosNaTela()).toEqual(["pedido 1", "pedido 2"]);
  });

  it("a falha do recarregar que vem depois de mudar o status não engole o pedido", async () => {
    // É o caminho de `avancar`/`cancelar`: o status já mudou com sucesso e o
    // recarregar seguinte falha. O pedido aceito não pode sumir da tela.
    listarPedidosDelivery.mockResolvedValue({ data: [PEDIDO], error: null });
    await montar(TelaDelivery);

    listarPedidosDelivery.mockResolvedValue(respostaFalha);
    await act(async () => { screen.getByText("Atualizar").click(); });

    expect(numerosNaTela()).toEqual(["pedido 1"]);
  });

  it("falha na PRIMEIRA carga sai de carregando e mostra o erro com lista vazia", async () => {
    listarPedidosDelivery.mockResolvedValue(respostaFalha);
    await montar(TelaDelivery);

    expect(estado()).toBe("erro");
    expect(numerosNaTela()).toEqual([]);
  });

  it("quando a rede volta, o erro sai da tela e a lista é a nova", async () => {
    listarPedidosDelivery.mockResolvedValue(respostaFalha);
    await montar(TelaDelivery);
    expect(estado()).toBe("erro");

    listarPedidosDelivery.mockResolvedValue({ data: [OUTRO], error: null });
    await act(async () => { screen.getByText("Atualizar").click(); });

    expect(estado()).toBe("ok");
    expect(numerosNaTela()).toEqual(["pedido 2"]);
  });

  it("carga bem-sucedida com lista vazia realmente esvazia (não é falha)", async () => {
    // O outro lado da moeda: manter a lista antiga só vale quando houve ERRO.
    // Um pedido excluído de verdade tem que sair da tela.
    listarPedidosDelivery.mockResolvedValue({ data: [PEDIDO], error: null });
    await montar(TelaDelivery);
    expect(numerosNaTela()).toHaveLength(1);

    listarPedidosDelivery.mockResolvedValue({ data: [], error: null });
    await act(async () => { screen.getByText("Atualizar").click(); });

    expect(estado()).toBe("ok");
    expect(numerosNaTela()).toEqual([]);
  });

  it("pedido novo do cliente chega ao vivo pelo espelho em pending", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: [PEDIDO], error: null });
    await montar(TelaDelivery);

    listarPedidosDelivery.mockResolvedValue({ data: [OUTRO, PEDIDO], error: null });
    await act(async () => {
      const ouvintes = supa().emitRealtime("delivery-pending-espelho", {
        eventType: "INSERT",
        new: { id: "dlv_x", created_by: "delivery" },
      });
      expect(ouvintes).toBeGreaterThan(0);
    });
    await assentar();

    expect(numerosNaTela()).toEqual(["pedido 2", "pedido 1"]);
  });
});

describe("usePedidosCozinha — o DELETE do espelho tira a comanda do painel (Run 6, leva 7)", () => {
  it("apagar a comanda espelho remove o cartão da cozinha ao vivo", async () => {
    // É exatamente o que o trigger de 20260904 faz quando o pedido é
    // cancelado: DELETE da linha em `pending`. Sem esta reação, a cozinha
    // seguiria preparando comida de um pedido cancelado.
    supa().setTableResult("pending", {
      data: [
        { id: "dlv_1", comanda: "Delivery 1", items: [{ name: "X-Burger" }] },
        { id: "dlv_2", comanda: "Delivery 2", items: [{ name: "Batata" }] },
      ],
      error: null,
    });
    await montar(TelaCozinha);
    expect(comandasNaTela()).toEqual(["Delivery 1", "Delivery 2"]);

    await act(async () => {
      const ouvintes = supa().emitRealtime("cozinha-pedidos-realtime", {
        eventType: "DELETE",
        old: { id: "dlv_1" },
      });
      expect(ouvintes).toBeGreaterThan(0);
    });

    expect(comandasNaTela()).toEqual(["Delivery 2"]);
  });

  it("falha ao recarregar a cozinha também não apaga o painel", async () => {
    supa().setTableResult("pending", {
      data: [{ id: "dlv_1", comanda: "Delivery 1", items: [{ name: "X-Burger" }] }],
      error: null,
    });
    await montar(TelaCozinha);
    expect(comandasNaTela()).toEqual(["Delivery 1"]);

    supa().setTableError("pending", FALHA);
    await act(async () => { screen.getByText("Recarregar cozinha").click(); });

    expect(comandasNaTela()).toEqual(["Delivery 1"]);
  });
});
