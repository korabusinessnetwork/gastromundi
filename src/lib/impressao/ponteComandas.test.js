import { describe, it, expect } from "vitest";
import {
  normalizarNomeComanda,
  acharComandaAberta,
  totalDosItens,
  pedidoJaGravado,
  encaixarPedidoDoPalm,
  resumirComandasAbertas,
  assinaturaComandasAbertas,
} from "./ponteComandas";

const item = (nome, preco = 10, qtd = 1) => ({ name: nome, price: preco, qty: qtd });

describe("normalizarNomeComanda", () => {
  it("ignora espaço, caixa e zero à esquerda em comanda numérica", () => {
    expect(normalizarNomeComanda(" 05 ")).toBe("5");
    expect(normalizarNomeComanda("5")).toBe("5");
    expect(normalizarNomeComanda("Mesa  5")).toBe("mesa 5");
    expect(normalizarNomeComanda("MESA 5")).toBe("mesa 5");
  });

  it("preserva zero à esquerda quando o nome tem letra", () => {
    expect(normalizarNomeComanda("A07")).toBe("a07");
  });

  it("devolve vazio para nada", () => {
    expect(normalizarNomeComanda(null)).toBe("");
    expect(normalizarNomeComanda("   ")).toBe("");
  });
});

describe("acharComandaAberta", () => {
  const abertas = [
    { id: "c1", comanda: "5", status: "open", created_at: "2026-07-29T10:00:00.000Z" },
    { id: "c2", comanda: "Mesa 3", status: "open", created_at: "2026-07-29T11:00:00.000Z" },
  ];

  it("acha mesmo com o número digitado diferente", () => {
    expect(acharComandaAberta(abertas, "05")?.id).toBe("c1");
    expect(acharComandaAberta(abertas, " mesa 3 ")?.id).toBe("c2");
  });

  it("não devolve comanda já fechada", () => {
    const fechada = [{ id: "c9", comanda: "5", status: "closed" }];
    expect(acharComandaAberta(fechada, "5")).toBeNull();
  });

  it("devolve null quando não existe ou o nome está vazio", () => {
    expect(acharComandaAberta(abertas, "99")).toBeNull();
    expect(acharComandaAberta(abertas, "")).toBeNull();
    expect(acharComandaAberta(undefined, "5")).toBeNull();
  });

  it("com duplicata, fica com a mais recente", () => {
    const duplicadas = [
      { id: "velha", comanda: "5", status: "open", created_at: "2026-07-29T10:00:00.000Z" },
      { id: "nova", comanda: "5", status: "open", created_at: "2026-07-29T12:00:00.000Z" },
    ];
    expect(acharComandaAberta(duplicadas, "5")?.id).toBe("nova");
  });
});

describe("totalDosItens", () => {
  it("soma preço vezes quantidade", () => {
    expect(totalDosItens([item("Coca", 8, 2), item("Água", 5)])).toBe(21);
  });

  it("item sem qty conta como 1 e lista vazia dá zero", () => {
    expect(totalDosItens([{ price: 7 }])).toBe(7);
    expect(totalDosItens([])).toBe(0);
    expect(totalDosItens(undefined)).toBe(0);
  });
});

describe("pedidoJaGravado", () => {
  it("acha pelo id da comanda (pedido virou comanda nova)", () => {
    expect(pedidoJaGravado([{ id: "p1" }], "p1")).toBe(true);
  });

  it("acha pelo rastro nos itens (pedido acumulado em comanda existente)", () => {
    const pendentes = [{ id: "c1", items: [{ name: "Coca", palm_pedido_id: "p1" }] }];
    expect(pedidoJaGravado(pendentes, "p1")).toBe(true);
    expect(pedidoJaGravado(pendentes, "p2")).toBe(false);
  });

  it("é falso sem id ou sem comandas", () => {
    expect(pedidoJaGravado([], "p1")).toBe(false);
    expect(pedidoJaGravado([{ id: "c1" }], null)).toBe(false);
  });
});

describe("resumirComandasAbertas", () => {
  it("leva só nome, mesa e apelido — nada de itens, total ou cliente", () => {
    const r = resumirComandasAbertas([
      { id: "c1", comanda: "5", mesa: "3", apelido: "João", status: "open", items: [item("Coca")], total: 10, cliente_id: "x" },
    ]);
    expect(r).toEqual([{ comanda: "5", mesa: "3", apelido: "João" }]);
  });

  it("ignora comanda fechada e comanda sem nome", () => {
    const r = resumirComandasAbertas([
      { comanda: "5", status: "closed" },
      { comanda: "  ", status: "open" },
      { comanda: "7", status: "open" },
    ]);
    expect(r.map((c) => c.comanda)).toEqual(["7"]);
  });

  it("não repete a mesma comanda e ordena em ordem humana", () => {
    const r = resumirComandasAbertas([
      { comanda: "10", status: "open" },
      { comanda: "2", status: "open" },
      { comanda: "02", status: "open" },
    ]);
    expect(r.map((c) => c.comanda)).toEqual(["2", "10"]);
  });

  it("aguenta lista vazia ou ausente", () => {
    expect(resumirComandasAbertas([])).toEqual([]);
    expect(resumirComandasAbertas(undefined)).toEqual([]);
  });
});

describe("assinaturaComandasAbertas", () => {
  it("não muda quando só os itens da comanda mudam", () => {
    const antes = [{ comanda: "5", status: "open", items: [] }];
    const depois = [{ comanda: "5", status: "open", items: [item("Coca")] }];
    expect(assinaturaComandasAbertas(depois)).toBe(assinaturaComandasAbertas(antes));
  });

  it("muda quando abre ou fecha comanda", () => {
    const antes = [{ comanda: "5", status: "open" }];
    const depois = [...antes, { comanda: "6", status: "open" }];
    expect(assinaturaComandasAbertas(depois)).not.toBe(assinaturaComandasAbertas(antes));
  });
});

describe("encaixarPedidoDoPalm", () => {
  const pedido = {
    id: "p1",
    comanda: "05",
    items: [item("Picanha", 60), item("Coca", 8, 2)],
    total: 76,
  };

  it("abre comanda nova quando não existe nenhuma com aquele nome", () => {
    const r = encaixarPedidoDoPalm([], pedido);
    expect(r.tipo).toBe("nova");
    expect(r.order.id).toBe("p1");
    expect(r.order.items.every((i) => i.palm_pedido_id === "p1")).toBe(true);
  });

  it("acumula na comanda aberta em vez de criar uma segunda", () => {
    const pendentes = [
      { id: "c1", comanda: "5", status: "open", items: [item("Cerveja", 12)], total: 12 },
    ];
    const r = encaixarPedidoDoPalm(pendentes, pedido);
    expect(r.tipo).toBe("acumular");
    expect(r.comandaId).toBe("c1");
    expect(r.items.map((i) => i.name)).toEqual(["Cerveja", "Picanha", "Coca"]);
    expect(r.itensNovos.map((i) => i.name)).toEqual(["Picanha", "Coca"]);
    expect(r.itensAnteriores.map((i) => i.name)).toEqual(["Cerveja"]);
    expect(r.total).toBe(12 + 60 + 16);
  });

  it("carimba os itens acumulados com o pedido de origem (trava de duplicata)", () => {
    const pendentes = [{ id: "c1", comanda: "5", status: "open", items: [] }];
    const r = encaixarPedidoDoPalm(pendentes, pedido);
    expect(r.itensNovos.every((i) => i.palm_pedido_id === "p1")).toBe(true);
    expect(pedidoJaGravado([{ id: "c1", items: r.items }], "p1")).toBe(true);
  });

  it("não mexe nos itens que já estavam na comanda", () => {
    const anteriores = [item("Cerveja", 12)];
    const pendentes = [{ id: "c1", comanda: "5", status: "open", items: anteriores }];
    const r = encaixarPedidoDoPalm(pendentes, pedido);
    expect(r.itensAnteriores).toBe(anteriores);
    expect(anteriores).toHaveLength(1);
  });

  it("comanda fechada com o mesmo número não recebe o pedido", () => {
    const pendentes = [{ id: "c1", comanda: "5", status: "closed", items: [] }];
    expect(encaixarPedidoDoPalm(pendentes, pedido).tipo).toBe("nova");
  });
});
