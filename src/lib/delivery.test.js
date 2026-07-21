import { describe, it, expect, vi } from "vitest";

// A camada importa o client Supabase (que exige VITE_* no import). Só
// testamos as funções PURAS aqui — o client é mockado para não exigir env.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  apenasDigitosCep,
  formatarCep,
  cepCompleto,
  formatarPreco,
  somaComplementos,
  precoUnitario,
  precoLinha,
  calcularSubtotal,
  totalItens,
  calcularTroco,
  grupoSatisfeito,
  produtoPodeAdicionar,
  rotuloRegraGrupo,
  primeiroGrupoPendente,
  montarPayloadPedido,
} from "./delivery";

describe("CEP", () => {
  it("apenasDigitosCep tira tudo que não é dígito e corta em 8", () => {
    expect(apenasDigitosCep("90.000-000")).toBe("90000000");
    expect(apenasDigitosCep("900000001234")).toBe("90000000");
    expect(apenasDigitosCep(null)).toBe("");
  });

  it("formatarCep insere o hífen só depois do 5º dígito", () => {
    expect(formatarCep("90000")).toBe("90000");
    expect(formatarCep("900000")).toBe("90000-0");
    expect(formatarCep("90000000")).toBe("90000-000");
  });

  it("cepCompleto exige 8 dígitos", () => {
    expect(cepCompleto("90000-000")).toBe(true);
    expect(cepCompleto("9000000")).toBe(false);
  });
});

describe("formatarPreco", () => {
  it("formata em reais com vírgula decimal", () => {
    expect(formatarPreco(12.5)).toBe("R$ 12,50");
    expect(formatarPreco(0)).toBe("R$ 0,00");
    expect(formatarPreco(1234.9)).toBe("R$ 1234,90");
  });
  it("valor inválido vira R$ 0,00", () => {
    expect(formatarPreco(null)).toBe("R$ 0,00");
    expect(formatarPreco("abc")).toBe("R$ 0,00");
  });
});

describe("carrinho", () => {
  const item = (extra = {}) => ({
    preco: 20,
    qtd: 1,
    complementosEscolhidos: [{ id: "a", preco: 4 }, { id: "b", preco: 2 }],
    ...extra,
  });

  it("somaComplementos soma os preços escolhidos", () => {
    expect(somaComplementos(item())).toBe(6);
    expect(somaComplementos({ complementosEscolhidos: [] })).toBe(0);
    expect(somaComplementos({})).toBe(0);
  });

  it("precoUnitario = base + complementos", () => {
    expect(precoUnitario(item())).toBe(26);
  });

  it("precoLinha multiplica pela qtd (mínimo 1)", () => {
    expect(precoLinha(item({ qtd: 3 }))).toBe(78);
    expect(precoLinha(item({ qtd: 0 }))).toBe(26);
  });

  it("calcularSubtotal soma todas as linhas", () => {
    expect(calcularSubtotal([item(), item({ qtd: 2, complementosEscolhidos: [] })])).toBe(
      26 + 40
    );
    expect(calcularSubtotal([])).toBe(0);
    expect(calcularSubtotal(null)).toBe(0);
  });

  it("totalItens conta as quantidades", () => {
    expect(totalItens([item({ qtd: 2 }), item({ qtd: 3 })])).toBe(5);
  });
});

describe("calcularTroco", () => {
  it("devolve a diferença quando troco_para > total", () => {
    expect(calcularTroco(50, 32)).toBe(18);
  });
  it("devolve 0 quando troco_para <= total ou inválido", () => {
    expect(calcularTroco(30, 32)).toBe(0);
    expect(calcularTroco(32, 32)).toBe(0);
    expect(calcularTroco(null, 32)).toBe(0);
  });
});

describe("grupoSatisfeito", () => {
  it("respeita o mínimo", () => {
    expect(grupoSatisfeito({ min: 1, max: 1 }, 0)).toBe(false);
    expect(grupoSatisfeito({ min: 1, max: 1 }, 1)).toBe(true);
  });
  it("respeita o máximo", () => {
    expect(grupoSatisfeito({ min: 0, max: 2 }, 3)).toBe(false);
    expect(grupoSatisfeito({ min: 0, max: 2 }, 2)).toBe(true);
  });
  it("grupo opcional (min 0) sem escolha já está ok", () => {
    expect(grupoSatisfeito({ min: 0, max: 5 }, 0)).toBe(true);
  });
  it("max 0 significa sem limite", () => {
    expect(grupoSatisfeito({ min: 0, max: 0 }, 10)).toBe(true);
  });
});

describe("produtoPodeAdicionar", () => {
  const produto = {
    grupos: [
      { id: "g1", min: 1, max: 1 }, // obrigatório
      { id: "g2", min: 0, max: 3 }, // opcional
    ],
  };
  it("bloqueia quando um grupo obrigatório não foi escolhido", () => {
    expect(produtoPodeAdicionar(produto, { g2: ["x"] })).toBe(false);
  });
  it("libera quando os obrigatórios estão satisfeitos", () => {
    expect(produtoPodeAdicionar(produto, { g1: ["ponto"] })).toBe(true);
  });
  it("produto sem grupos sempre pode ser adicionado", () => {
    expect(produtoPodeAdicionar({ grupos: [] }, {})).toBe(true);
    expect(produtoPodeAdicionar({}, {})).toBe(true);
  });
});

describe("rotuloRegraGrupo", () => {
  it("escolha única obrigatória vira 'Escolha 1'", () => {
    expect(rotuloRegraGrupo({ min: 1, max: 1 })).toBe("Escolha 1");
  });
  it("faixa obrigatória vira 'Escolha de N a M'", () => {
    expect(rotuloRegraGrupo({ min: 1, max: 3 })).toBe("Escolha de 1 a 3");
  });
  it("obrigatório sem teto vira 'Escolha ao menos N'", () => {
    expect(rotuloRegraGrupo({ min: 2, max: 0 })).toBe("Escolha ao menos 2");
  });
  it("opcional com teto > 1 mostra o limite", () => {
    expect(rotuloRegraGrupo({ min: 0, max: 3 })).toBe("Opcional · até 3");
  });
  it("opcional único (ou sem limite) é só 'Opcional'", () => {
    expect(rotuloRegraGrupo({ min: 0, max: 1 })).toBe("Opcional");
    expect(rotuloRegraGrupo({ min: 0, max: 0 })).toBe("Opcional");
    expect(rotuloRegraGrupo({})).toBe("Opcional");
  });
});

describe("primeiroGrupoPendente", () => {
  const produto = {
    grupos: [
      { id: "g1", min: 1, max: 1 },
      { id: "g2", min: 1, max: 2 },
      { id: "g3", min: 0, max: 3 },
    ],
  };
  it("aponta o primeiro obrigatório ainda não satisfeito", () => {
    expect(primeiroGrupoPendente(produto, {})).toBe("g1");
    expect(primeiroGrupoPendente(produto, { g1: ["a"] })).toBe("g2");
  });
  it("null quando todos os obrigatórios estão satisfeitos", () => {
    expect(primeiroGrupoPendente(produto, { g1: ["a"], g2: ["b"] })).toBeNull();
  });
  it("produto sem grupos não tem pendência", () => {
    expect(primeiroGrupoPendente({ grupos: [] }, {})).toBeNull();
    expect(primeiroGrupoPendente({}, {})).toBeNull();
  });
});

describe("montarPayloadPedido", () => {
  it("não envia preço; envia só a intenção do cliente", () => {
    const payload = montarPayloadPedido({
      cliente: { nome: "  Ana  ", telefone: " 5199 " },
      entrega: { cep: "90000-000", bairro: " Centro ", endereco: " Rua X, 10 ", complemento: "" },
      pagamento: { forma: "dinheiro", trocoPara: 50 },
      itens: [
        {
          produto_id: 7,
          qtd: 2,
          preco: 20,
          complementosEscolhidos: [{ id: "c1", preco: 4 }],
          obs: " sem cebola ",
        },
      ],
    });
    expect(payload).toEqual({
      cliente: { nome: "Ana", telefone: "5199" },
      entrega: { cep: "90000000", bairro: "Centro", endereco: "Rua X, 10", complemento: null },
      pagamento: { forma: "dinheiro", troco_para: 50, levar_maquininha: false },
      itens: [{ produto_id: 7, combo_id: null, qtd: 2, complementos: ["c1"], obs: "sem cebola" }],
    });
  });

  it("troco_para só vai quando é dinheiro e > 0; maquininha só quando é cartão", () => {
    const pix = montarPayloadPedido({
      cliente: {},
      entrega: {},
      pagamento: { forma: "pix", trocoPara: 50, levarMaquininha: true },
      itens: [],
    });
    expect(pix.pagamento.troco_para).toBeNull();
    expect(pix.pagamento.levar_maquininha).toBe(false);

    const cartao = montarPayloadPedido({
      cliente: {},
      entrega: {},
      pagamento: { forma: "cartao", levarMaquininha: true },
      itens: [],
    });
    expect(cartao.pagamento.levar_maquininha).toBe(true);
    expect(cartao.pagamento.troco_para).toBeNull();
  });

  it("combo vira combo_id e telefone/complemento vazios viram null", () => {
    const payload = montarPayloadPedido({
      cliente: { nome: "Zé" },
      entrega: { cep: "1", bairro: "", endereco: "Rua", complemento: "  " },
      pagamento: { forma: "cartao" },
      itens: [{ combo_id: "abc", qtd: 1, preco: 30, complementosEscolhidos: [] }],
    });
    expect(payload.cliente.telefone).toBeNull();
    expect(payload.entrega.complemento).toBeNull();
    expect(payload.itens[0]).toEqual({
      produto_id: null,
      combo_id: "abc",
      qtd: 1,
      complementos: [],
      obs: null,
    });
  });
});
