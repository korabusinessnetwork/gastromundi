import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR, ultimaDefinicaoDe } from "@/test/migracoes";
import { lancamentosDoPedido } from "./impressao/lancamentos";
import { montarViaProducao } from "./impressao";

/**
 * Guard de 20261001_delivery_via_sai_sozinha.sql.
 *
 * O buraco: existe um vigia que imprime a via de produção sozinho quando
 * um pedido novo chega (`useImpressaoLancamentos`) — é assim que o
 * lançamento do Palm sai na bancada sem ninguém apertar nada. Ele acha o
 * que é novo por LANÇAMENTO, identificado pelo par (id da comanda,
 * `launched_at` do item), e `lancamentosDoPedido` PULA item sem esse
 * carimbo.
 *
 * O espelho que `criar_pedido_delivery` grava em `pending` nunca
 * carimbava `launched_at`. O pedido de delivery entrava no painel,
 * aparecia na Cozinha e na aba Delivery — e não saía um papel. Só era
 * impresso se alguém estivesse com a tela da Cozinha aberta e clicasse,
 * pedido a pedido.
 *
 * A prova aqui é do LADO DO APP: monta o espelho exatamente como o SQL
 * grava e exige que ele renda um lançamento. Se o carimbo sumir do SQL,
 * o primeiro teste quebra; se `lancamentosDoPedido` mudar de regra, os
 * outros quebram junto.
 */
const MIGRACAO = "20261001_delivery_via_sai_sozinha.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

/**
 * O espelho em `pending`, montado como o SQL monta. Os nomes dos campos
 * saem do próprio arquivo da migração, então renomear um lá quebra aqui.
 */
function espelhoDoDelivery({ comCarimbo = true } = {}) {
  return {
    id: "dlv_abc123",
    comanda: "Delivery 260930-001",
    items: [
      {
        id: "7",
        name: "Pizza Calabresa",
        price: 25,
        qty: 1,
        obs: [],
        ...(comCarimbo ? { launched_at: "2026-09-30T19:40:00.000Z" } : {}),
      },
      {
        id: "9",
        name: "Refrigerante",
        price: 8,
        qty: 2,
        obs: [],
        ...(comCarimbo ? { launched_at: "2026-09-30T19:40:00.000Z" } : {}),
      },
    ],
  };
}

describe("o carimbo que faz a via sair sozinha", () => {
  it("a última definição da RPC carimba launched_at no espelho", () => {
    // Migrations são histórico imutável e vale a ÚLTIMA definição: uma
    // corretiva posterior que copie a RPC sem o carimbo faz o delivery
    // voltar a não imprimir, em silêncio.
    expect(ultimaDefinicaoDe("criar_pedido_delivery")).toContain("'launched_at', v_agora");
  });

  it("sem o carimbo, o pedido não rende lançamento nenhum — era o defeito", () => {
    // Este é o estado ANTERIOR, escrito para a regressão ser visível: se
    // alguém tirar o carimbo, o teste acima quebra e este continua verde,
    // explicando por quê.
    expect(lancamentosDoPedido(espelhoDoDelivery({ comCarimbo: false }))).toEqual([]);
  });

  it("com o carimbo, o pedido rende UM lançamento com todos os itens", () => {
    const lancamentos = lancamentosDoPedido(espelhoDoDelivery());

    // Um só: um pedido de delivery é um lançamento, e é isso que faz o eco
    // do realtime render um papel em vez de um por item.
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].itens).toHaveLength(2);
  });

  it("todos os itens levam o MESMO instante", () => {
    const carimbos = new Set(espelhoDoDelivery().items.map((i) => i.launched_at));

    expect(carimbos.size).toBe(1);
    expect(sql).toContain("v_agora      timestamptz := now();");
  });

  it("e a via montada a partir do espelho tem o que a bancada precisa", () => {
    const via = montarViaProducao({ pedido: espelhoDoDelivery() });

    expect(via.itens.map((i) => `${i.qty}x ${i.nome}`)).toEqual([
      "1x Pizza Calabresa",
      "2x Refrigerante",
    ]);
  });
});

describe("a cópia da RPC não perdeu nada pelo caminho", () => {
  // Cada migração redefine a função inteira. Uma cópia que esqueça uma
  // guarda conquistada antes a apaga do banco sem erro nenhum — e a regra
  // deixa de existir sem ninguém perceber.
  it.each([
    ["telefone obrigatório", "telefone_br_valido"],
    ["retirada no local", "v_retirada"],
    ["histórico por aparelho", "dispositivo_id"],
    ["cidade no pedido", "'cidade'"],
    ["áreas não configuradas", "sem_area"],
  ])("mantém %s", (_nome, marca) => {
    expect(sql).toContain(marca);
  });
});
