import { describe, it, expect } from "vitest";
import {
  pertenceAoGarcom,
  totalLancamentosGarcom,
  gruposDaComanda,
  oportunidadesDaComanda,
  radarOportunidades,
} from "./painelGarcom";

describe("pertenceAoGarcom", () => {
  it("casa por nome (garcom)", () => {
    expect(pertenceAoGarcom({ garcom: "Ana" }, { nome: "Ana" })).toBe(true);
  });
  it("casa por login (created_by)", () => {
    expect(pertenceAoGarcom({ created_by: "ana" }, { username: "ana" })).toBe(true);
  });
  it("não casa outro garçom", () => {
    expect(pertenceAoGarcom({ garcom: "Bruno", created_by: "bruno" }, { nome: "Ana", username: "ana" })).toBe(false);
  });
});

describe("totalLancamentosGarcom", () => {
  const desde = "2026-07-15T10:00:00.000Z";
  const comandas = [
    {
      id: 1, garcom: "Ana", created_by: "ana",
      items: [
        { price: 10, qty: 2, launched_at: "2026-07-15T11:00:00.000Z" }, // conta = 20
        { price: 5,  qty: 1, launched_at: "2026-07-15T09:00:00.000Z" }, // antes do caixa → fora
      ],
    },
    {
      id: 2, garcom: "Bruno", created_by: "bruno",
      items: [{ price: 100, qty: 1, launched_at: "2026-07-15T12:00:00.000Z" }], // outro garçom
    },
    {
      id: 3, garcom: "Ana", created_by: "ana",
      items: [
        { price: 8, qty: 3, launched_at: "2026-07-15T13:00:00.000Z" }, // 24
        { price: 9, qty: 1, cancelado: true, launched_at: "2026-07-15T13:00:00.000Z" }, // cancelado
      ],
    },
  ];

  it("soma só os itens do garçom lançados após a abertura", () => {
    const r = totalLancamentosGarcom(comandas, { nome: "Ana", username: "ana", desde });
    expect(r.total).toBe(44); // 20 + 24
    expect(r.itens).toBe(5);  // 2 + 3
    expect(r.comandas).toBe(2);
  });

  it("ignora itens cancelados e de outros garçons", () => {
    const r = totalLancamentosGarcom(comandas, { nome: "Bruno", username: "bruno", desde });
    expect(r.total).toBe(100);
  });

  it("fallback para created_at quando o item não tem launched_at", () => {
    const c = [{ id: 9, garcom: "Ana", created_at: "2026-07-15T14:00:00.000Z", items: [{ price: 7, qty: 1 }] }];
    expect(totalLancamentosGarcom(c, { nome: "Ana", desde }).total).toBe(7);
  });

  it("lista vazia → zeros", () => {
    expect(totalLancamentosGarcom([], { nome: "Ana", desde })).toEqual({ total: 0, itens: 0, comandas: 0 });
  });
});

describe("gruposDaComanda / radar", () => {
  const categoriaGrupo = {
    "Lanches": "comida",
    "Refrigerantes": "bebida",
    "Cafés": "cafe",
  };

  it("coleta grupos presentes pela categoria dos itens", () => {
    const comanda = { items: [{ category: "Lanches" }, { category: "Refrigerantes" }] };
    const g = gruposDaComanda(comanda, categoriaGrupo);
    expect([...g].sort()).toEqual(["bebida", "comida"]);
  });

  it("gera card quando tem comida e falta bebida e café", () => {
    const comanda = { id: 1, comanda: "5", mesa: "3", items: [{ category: "Lanches" }] };
    const cards = oportunidadesDaComanda(comanda, categoriaGrupo);
    expect(cards).toHaveLength(1);
    expect(cards[0].rotulo).toBe("pediu comida, sem bebida");
    expect(cards[0].comanda).toBe("5");
  });

  it("não gera card se já tem bebida", () => {
    const comanda = { id: 1, items: [{ category: "Lanches" }, { category: "Refrigerantes" }] };
    expect(oportunidadesDaComanda(comanda, categoriaGrupo)).toHaveLength(0);
  });

  it("não gera card se já tem café (cobre a lacuna)", () => {
    const comanda = { id: 1, items: [{ category: "Lanches" }, { category: "Cafés" }] };
    expect(oportunidadesDaComanda(comanda, categoriaGrupo)).toHaveLength(0);
  });

  it("radar ignora comandas sem itens", () => {
    const comandas = [
      { id: 1, comanda: "1", items: [] },
      { id: 2, comanda: "2", items: [{ category: "Lanches" }] },
    ];
    const cards = radarOportunidades(comandas, categoriaGrupo);
    expect(cards).toHaveLength(1);
    expect(cards[0].comandaId).toBe(2);
  });

  it("usa lookup por produto quando o item não traz category", () => {
    const comanda = { id: 1, comanda: "7", items: [{ id: 42 }] };
    const products = [{ id: 42, category: "Lanches" }];
    const cards = radarOportunidades([comanda], categoriaGrupo, products);
    expect(cards).toHaveLength(1);
  });
});
