import { describe, it, expect, vi, afterEach } from "vitest";

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
  achatarGrupos,
  grupoArvoreSatisfeita,
  produtoPodeAdicionar,
  grupoImpossivel,
  produtoImpossivel,
  rotuloRegraGrupo,
  primeiroGrupoPendente,
  montarPayloadPedido,
  valorDigitado,
  revisarSacola,
  mensagemDeErroDoPedido,
  buscarEnderecoViaCep,
  geocodificarEndereco,
  sugerirEnderecos,
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

describe("achatarGrupos (raiz → subgrupos, pré-ordem)", () => {
  const grupos = [
    {
      id: "raiz",
      subgrupos: [
        { id: "s1", subgrupos: [{ id: "s1a" }] },
        { id: "s2" },
      ],
    },
    { id: "outro" },
  ];
  it("visita raiz antes dos filhos e desce recursivo", () => {
    expect(achatarGrupos(grupos).map((g) => g.id)).toEqual([
      "raiz", "s1", "s1a", "s2", "outro",
    ]);
  });
  it("lista vazia ou sem subgrupos não quebra", () => {
    expect(achatarGrupos([])).toEqual([]);
    expect(achatarGrupos([{ id: "x" }]).map((g) => g.id)).toEqual(["x"]);
  });
});

describe("grupoArvoreSatisfeita (min/max próprio E de todos os subgrupos)", () => {
  const arvore = {
    id: "raiz", min: 1, max: 1,
    subgrupos: [{ id: "sub", min: 1, max: 1 }],
  };
  it("false quando o próprio grupo não foi satisfeito", () => {
    expect(grupoArvoreSatisfeita(arvore, { sub: ["a"] })).toBe(false);
  });
  it("false quando um subgrupo obrigatório não foi satisfeito", () => {
    expect(grupoArvoreSatisfeita(arvore, { raiz: ["x"] })).toBe(false);
  });
  it("true quando raiz e subgrupo estão satisfeitos", () => {
    expect(grupoArvoreSatisfeita(arvore, { raiz: ["x"], sub: ["a"] })).toBe(true);
  });
});

describe("produtoPodeAdicionar / primeiroGrupoPendente com subgrupos aninhados", () => {
  const produto = {
    grupos: [
      {
        id: "g1", min: 1, max: 1,
        subgrupos: [{ id: "g1sub", min: 1, max: 2 }],
      },
    ],
  };
  it("obrigatório de um subgrupo bloqueia mesmo com a raiz satisfeita", () => {
    expect(produtoPodeAdicionar(produto, { g1: ["a"] })).toBe(false);
  });
  it("libera quando raiz e subgrupo estão satisfeitos", () => {
    expect(produtoPodeAdicionar(produto, { g1: ["a"], g1sub: ["b"] })).toBe(true);
  });
  it("primeiroGrupoPendente aponta o subgrupo aninhado ainda pendente", () => {
    expect(primeiroGrupoPendente(produto, { g1: ["a"] })).toBe("g1sub");
  });
});

// Os grupos obrigatórios daqui levam opções de verdade: um grupo que
// exige escolha e não tem o que escolher não é "obrigatório", é
// impossível — e o rótulo dele é outro (ver o describe logo abaixo).
describe("rotuloRegraGrupo", () => {
  const opcoes = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));

  it("escolha única obrigatória vira 'Escolha 1'", () => {
    expect(rotuloRegraGrupo({ min: 1, max: 1, itens: opcoes(2) })).toBe("Escolha 1");
  });
  it("faixa obrigatória vira 'Escolha de N a M'", () => {
    expect(rotuloRegraGrupo({ min: 1, max: 3, itens: opcoes(4) })).toBe("Escolha de 1 a 3");
  });
  it("obrigatório sem teto vira 'Escolha ao menos N'", () => {
    expect(rotuloRegraGrupo({ min: 2, max: 0, itens: opcoes(2) })).toBe("Escolha ao menos 2");
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

// ──────────────────────────────────────────────────────────────────
// Run 6, leva 2 — grupo impossível de satisfazer.
//
// A RPC do cardápio esconde o complemento marcado como indisponível, mas
// publica o min_escolhas do grupo cru. Basta o dono marcar "acabou o
// bacon" na última opção de um grupo "Escolha 1" para o produto chegar à
// vitrine como { min: 1, itens: [] } — nenhuma escolha satisfaz, o CTA
// trava em "Escolha os obrigatórios" para sempre e o cliente é mandado
// procurar o que não existe. O servidor recusaria de qualquer forma.
// ──────────────────────────────────────────────────────────────────
describe("grupoImpossivel (Run 6, leva 2)", () => {
  const opcoes = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));

  it("obrigatório que ficou sem nenhuma opção é impossível", () => {
    expect(grupoImpossivel({ min: 1, max: 1, itens: [] })).toBe(true);
    expect(grupoImpossivel({ min: 1, max: 1 })).toBe(true);
  });

  it("exigir mais opções do que existem é impossível", () => {
    expect(grupoImpossivel({ min: 2, max: 3, itens: opcoes(1) })).toBe(true);
  });

  it("mínimo maior que o máximo se contradiz sozinho", () => {
    expect(grupoImpossivel({ min: 2, max: 1, itens: opcoes(5) })).toBe(true);
  });

  it("grupo opcional nunca é impossível, mesmo sem opção nenhuma", () => {
    expect(grupoImpossivel({ min: 0, max: 3, itens: [] })).toBe(false);
    expect(grupoImpossivel({})).toBe(false);
  });

  it("grupo obrigatório com opções suficientes está de pé", () => {
    expect(grupoImpossivel({ min: 1, max: 1, itens: opcoes(2) })).toBe(false);
    expect(grupoImpossivel({ min: 2, max: 2, itens: opcoes(2) })).toBe(false);
    // max 0 é "sem teto" — não pode ser lido como teto menor que o mínimo.
    expect(grupoImpossivel({ min: 2, max: 0, itens: opcoes(3) })).toBe(false);
    expect(grupoImpossivel({ min: 2, itens: opcoes(3) })).toBe(false);
  });

  it("o rótulo do grupo passa a dizer a verdade em vez de pedir o impossível", () => {
    expect(rotuloRegraGrupo({ min: 1, max: 1, itens: [] })).toBe("Indisponível no momento");
    expect(rotuloRegraGrupo({ min: 2, max: 1, itens: opcoes(5) })).toBe(
      "Indisponível no momento"
    );
  });
});

describe("produtoImpossivel (Run 6, leva 2)", () => {
  const opcoes = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));

  it("produto sem grupo nenhum está sempre disponível", () => {
    expect(produtoImpossivel({ grupos: [] })).toBe(false);
    expect(produtoImpossivel({})).toBe(false);
    expect(produtoImpossivel(null)).toBe(false);
  });

  it("um grupo impossível na raiz derruba o produto", () => {
    const produto = {
      grupos: [
        { id: "g1", min: 1, max: 1, itens: opcoes(2) },
        { id: "g2", min: 1, max: 1, itens: [] },
      ],
    };
    expect(produtoImpossivel(produto)).toBe(true);
  });

  it("subgrupo obrigatório vazio derruba o produto mesmo sob um pai opcional", () => {
    const produto = {
      grupos: [
        {
          id: "g1",
          min: 0,
          max: 1,
          itens: opcoes(2),
          subgrupos: [{ id: "g1sub", min: 1, max: 1, itens: [] }],
        },
      ],
    };
    // O pai é opcional, mas grupoArvoreSatisfeita cobra o subgrupo do
    // mesmo jeito — então o produto nunca libera.
    expect(produtoImpossivel(produto)).toBe(true);
    expect(produtoPodeAdicionar(produto, {})).toBe(false);
  });

  it("produto com todos os grupos de pé continua disponível", () => {
    const produto = {
      grupos: [
        {
          id: "g1",
          min: 1,
          max: 2,
          itens: opcoes(3),
          subgrupos: [{ id: "g1sub", min: 0, max: 2, itens: opcoes(2) }],
        },
      ],
    };
    expect(produtoImpossivel(produto)).toBe(false);
  });

  it("produto impossível nunca libera o botão, escolha o cliente o que escolher", () => {
    // Sem opção nenhuma só existe uma escolha possível: nenhuma.
    const semOpcao = { grupos: [{ id: "g1", min: 1, max: 1, itens: [] }] };
    expect(produtoPodeAdicionar(semOpcao, {})).toBe(false);

    // Com min 2 e max 1, TODAS as escolhas possíveis falham: 0 e 1 ficam
    // abaixo do mínimo, 2 estoura o máximo.
    const contraditorio = {
      grupos: [{ id: "g1", min: 2, max: 1, itens: opcoes(2) }],
    };
    expect(produtoPodeAdicionar(contraditorio, {})).toBe(false);
    expect(produtoPodeAdicionar(contraditorio, { g1: ["c0"] })).toBe(false);
    expect(produtoPodeAdicionar(contraditorio, { g1: ["c0", "c1"] })).toBe(false);
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

// ── Run 6, leva 1 ──────────────────────────────────────────────────
// Dois defeitos que sumiam em silêncio entre a tela e o servidor.

describe("valorDigitado — dinheiro digitado no teclado brasileiro", () => {
  it("lê vírgula como decimal (era NaN, e o valor sumia)", () => {
    expect(valorDigitado("50,00")).toBe(50);
    expect(valorDigitado("7,5")).toBe(7.5);
    expect(valorDigitado("0,99")).toBe(0.99);
  });

  it("com vírgula, o ponto é separador de milhar", () => {
    expect(valorDigitado("1.234,56")).toBe(1234.56);
    expect(valorDigitado("10.000,00")).toBe(10000);
  });

  it("sem vírgula, o ponto é o próprio decimal", () => {
    expect(valorDigitado("50")).toBe(50);
    expect(valorDigitado("50.5")).toBe(50.5);
    expect(valorDigitado(50.5)).toBe(50.5);
  });

  it("campo vazio ou rabisco vira null — nunca 0 disfarçado de valor", () => {
    expect(valorDigitado("")).toBeNull();
    expect(valorDigitado("   ")).toBeNull();
    expect(valorDigitado(null)).toBeNull();
    expect(valorDigitado(undefined)).toBeNull();
    expect(valorDigitado(",")).toBeNull();
    expect(valorDigitado("abc")).toBeNull();
  });

  it("zero digitado é zero, e zero não é o mesmo que nada", () => {
    expect(valorDigitado("0")).toBe(0);
    expect(valorDigitado("0,00")).toBe(0);
  });
});

describe("calcularTroco com valor digitado com vírgula (Run 6, leva 1)", () => {
  it("troco para R$ 50,00 num total de 32,50 devolve 17,50", () => {
    expect(calcularTroco("50,00", 32.5)).toBe(17.5);
  });

  it("troco menor ou igual ao total não vira troco", () => {
    expect(calcularTroco("30,00", 32.5)).toBe(0);
    expect(calcularTroco("32,50", 32.5)).toBe(0);
  });

  it("campo vazio continua sem troco", () => {
    expect(calcularTroco("", 32.5)).toBe(0);
    expect(calcularTroco(null, 32.5)).toBe(0);
  });
});

describe("montarPayloadPedido — coordenada e troco (Run 6, leva 1)", () => {
  const base = {
    cliente: { nome: "Ana" },
    entrega: { cep: "90000000", bairro: "Centro", endereco: "Rua X, 10" },
    pagamento: { forma: "dinheiro" },
    itens: [],
  };

  it("taxa resolvida por bairro/CEP grava lat null — e o payload OMITE a coordenada", () => {
    // A tela grava lat/lng null sempre que não geocodificou. Number(null) é
    // 0 (e 0 é finito), então o payload ia com 0,0: o meio do Atlântico.
    const payload = montarPayloadPedido({
      ...base,
      entrega: { ...base.entrega, lat: null, lng: null },
    });
    expect(payload.entrega).not.toHaveProperty("lat");
    expect(payload.entrega).not.toHaveProperty("lng");
  });

  it("coordenada de verdade (modo por km) vai como número", () => {
    const payload = montarPayloadPedido({
      ...base,
      entrega: { ...base.entrega, lat: -30.0346, lng: -51.2177 },
    });
    expect(payload.entrega.lat).toBe(-30.0346);
    expect(payload.entrega.lng).toBe(-51.2177);
  });

  it("coordenada pela metade ou ilegível não vai sozinha", () => {
    const meia = montarPayloadPedido({
      ...base,
      entrega: { ...base.entrega, lat: -30.0346, lng: null },
    });
    expect(meia.entrega).not.toHaveProperty("lat");
    expect(meia.entrega).not.toHaveProperty("lng");

    const lixo = montarPayloadPedido({
      ...base,
      entrega: { ...base.entrega, lat: "abc", lng: "def" },
    });
    expect(lixo.entrega).not.toHaveProperty("lat");
    expect(lixo.entrega).not.toHaveProperty("lng");

    const vazio = montarPayloadPedido({
      ...base,
      entrega: { ...base.entrega, lat: "", lng: "" },
    });
    expect(vazio.entrega).not.toHaveProperty("lat");
    expect(vazio.entrega).not.toHaveProperty("lng");
  });

  it("troco digitado com vírgula chega ao servidor como número", () => {
    const payload = montarPayloadPedido({
      ...base,
      pagamento: { forma: "dinheiro", trocoPara: "50,00" },
    });
    expect(payload.pagamento.troco_para).toBe(50);
  });

  it("troco com milhar digitado à brasileira também chega certo", () => {
    const payload = montarPayloadPedido({
      ...base,
      pagamento: { forma: "dinheiro", trocoPara: "1.234,56" },
    });
    expect(payload.pagamento.troco_para).toBe(1234.56);
  });
});

// ── Run 6, leva 4 ──────────────────────────────────────────────────
// A sacola vive em sessionStorage e sobrevive à aba recarregada; o
// cardápio é carregado uma vez só. Quando o dono muda o cardápio no meio
// da compra, a divergência tem que aparecer NA SACOLA — não numa recusa
// seca do servidor no último clique, que não diz qual item é.
describe("revisarSacola (Run 6, leva 4)", () => {
  const CARDAPIO = {
    produtos: [
      {
        produto_id: 10,
        nome: "X-Salada",
        preco: 25,
        grupos: [
          {
            id: "g1",
            nome: "Adicionais",
            min: 0,
            max: 3,
            itens: [
              { id: "c1", nome: "Bacon", preco: 4 },
              { id: "c2", nome: "Ovo", preco: 2 },
            ],
            subgrupos: [
              {
                id: "g2",
                nome: "Molhos",
                min: 0,
                max: 1,
                itens: [{ id: "c3", nome: "Barbecue", preco: 1.5 }],
              },
            ],
          },
        ],
      },
      { produto_id: 11, nome: "Refrigerante", preco: 7, grupos: [] },
    ],
    combos: [{ combo_id: "cb-1", nome: "Combo do Dia", preco: 39.9 }],
  };

  function linha(extra = {}) {
    return {
      _linha: "L1",
      produto_id: 10,
      combo_id: null,
      nome: "X-Salada",
      preco: 25,
      qtd: 1,
      complementosEscolhidos: [],
      obs: "",
      ...extra,
    };
  }

  it("sacola inteira ainda no cardápio passa limpa", () => {
    const r = revisarSacola(
      [
        linha({ complementosEscolhidos: [{ id: "c1", nome: "Bacon", preco: 4 }] }),
        linha({ _linha: "L2", produto_id: 11, nome: "Refrigerante", preco: 7, qtd: 2 }),
      ],
      CARDAPIO,
    );
    expect(r.linhas.map((l) => l.situacao)).toEqual(["ok", "ok"]);
    expect(r.temFora).toBe(false);
    expect(r.temPrecoNovo).toBe(false);
    expect(r.subtotal).toBe(29 + 14);
  });

  it("produto que saiu do cardápio é marcado e trava a sacola", () => {
    const r = revisarSacola([linha({ produto_id: 999, nome: "Fantasma" })], CARDAPIO);
    expect(r.linhas[0].situacao).toBe("fora");
    expect(r.temFora).toBe(true);
  });

  it("combo é procurado entre os combos, não entre os produtos", () => {
    const vivo = revisarSacola(
      [linha({ produto_id: null, combo_id: "cb-1", nome: "Combo do Dia", preco: 39.9 })],
      CARDAPIO,
    );
    expect(vivo.linhas[0].situacao).toBe("ok");

    const morto = revisarSacola(
      [linha({ produto_id: null, combo_id: "cb-9", nome: "Combo velho", preco: 39.9 })],
      CARDAPIO,
    );
    expect(morto.linhas[0].situacao).toBe("fora");
    expect(morto.temFora).toBe(true);
  });

  it("preço do produto que mudou é acusado e a linha já vale o preço novo", () => {
    const r = revisarSacola([linha({ preco: 20, qtd: 2 })], CARDAPIO);
    expect(r.linhas[0].situacao).toBe("preco");
    expect(r.linhas[0].preco).toBe(25);
    expect(r.temPrecoNovo).toBe(true);
    expect(r.temFora).toBe(false);
    expect(r.subtotal).toBe(50);
  });

  it("diferença de um centavo no produto já conta como preço novo", () => {
    const r = revisarSacola([linha({ preco: 24.99 })], CARDAPIO);
    expect(r.linhas[0].situacao).toBe("preco");
  });

  it("preço de complemento que mudou também é acusado e reprecificado", () => {
    const r = revisarSacola(
      [linha({ complementosEscolhidos: [{ id: "c1", nome: "Bacon", preco: 2 }] })],
      CARDAPIO,
    );
    expect(r.linhas[0].situacao).toBe("preco");
    expect(r.linhas[0].complementosEscolhidos[0].preco).toBe(4);
    expect(r.subtotal).toBe(29);
  });

  it("complemento que ficou indisponível tira o item do ar (não é só preço)", () => {
    const r = revisarSacola(
      [linha({ complementosEscolhidos: [{ id: "c-sumiu", nome: "Cheddar", preco: 3 }] })],
      CARDAPIO,
    );
    expect(r.linhas[0].situacao).toBe("fora");
    expect(r.temFora).toBe(true);
  });

  it("complemento de subgrupo aninhado continua sendo reconhecido", () => {
    const r = revisarSacola(
      [linha({ complementosEscolhidos: [{ id: "c3", nome: "Barbecue", preco: 1.5 }] })],
      CARDAPIO,
    );
    expect(r.linhas[0].situacao).toBe("ok");
  });

  it("item fora do cardápio ganha de preço mudado na mesma linha", () => {
    const r = revisarSacola([linha({ produto_id: 999, preco: 1 })], CARDAPIO);
    expect(r.linhas[0].situacao).toBe("fora");
  });

  it("id que voltou do sessionStorage como texto casa com o bigint do cardápio", () => {
    const r = revisarSacola([linha({ produto_id: "10" })], CARDAPIO);
    expect(r.linhas[0].situacao).toBe("ok");
  });

  it("sem cardápio na mão nada é acusado — falha nossa não apaga a sacola", () => {
    const itens = [linha({ produto_id: 999 })];
    const r = revisarSacola(itens, null);
    expect(r.linhas[0].situacao).toBe("ok");
    expect(r.temFora).toBe(false);
    expect(r.subtotal).toBe(25);
  });

  it("ruído de ponto flutuante entre dois JSONs não vira 'preço mudou'", () => {
    const cardapio = { produtos: [{ produto_id: 10, preco: 0.1 + 0.2, grupos: [] }], combos: [] };
    const r = revisarSacola([linha({ preco: 0.3 })], cardapio);
    expect(r.linhas[0].situacao).toBe("ok");
  });

  it("sacola vazia não inventa problema", () => {
    const r = revisarSacola([], CARDAPIO);
    expect(r.linhas).toEqual([]);
    expect(r.temFora).toBe(false);
    expect(r.temPrecoNovo).toBe(false);
    expect(r.subtotal).toBe(0);
  });

  it("linha antiga sem combo_id não é confundida com combo", () => {
    const item = linha();
    delete item.combo_id;
    const r = revisarSacola([item], CARDAPIO);
    expect(r.linhas[0].situacao).toBe("ok");
  });

  it("obs e _linha sobrevivem à revisão (a linha continua sendo a mesma)", () => {
    const r = revisarSacola([linha({ preco: 20, obs: "sem cebola" })], CARDAPIO);
    expect(r.linhas[0]._linha).toBe("L1");
    expect(r.linhas[0].obs).toBe("sem cebola");
  });
});

// ──────────────────────────────────────────────────────────────────
// Run 6, leva 9 — DL28: o erro que chega ao cliente anônimo.
//
// A vitrine mostrava `error.message` cru. As recusas de propósito da RPC
// são frases em português escritas para o cliente; qualquer outra falha
// traz jargão técnico em inglês, que é exatamente o que o Princípio nº 1
// proíbe na tela ("nada de jargão técnico").
//
// A régua é o SQLSTATE: `RAISE EXCEPTION 'texto'` do plpgsql sai como
// P0001, e os limites/guards que usam `USING ERRCODE = 'check_violation'`
// saem como 23514. Só esses dois têm texto feito para ser lido.
// ──────────────────────────────────────────────────────────────────
describe("mensagemDeErroDoPedido — nada de inglês técnico na tela do cliente", () => {
  const GENERICA = "Não foi possível enviar o pedido. Tente novamente.";

  describe("a recusa escrita pelo servidor passa inteira", () => {
    it("P0001 (RAISE EXCEPTION simples) chega ao cliente palavra por palavra", () => {
      const recusa = "Endereço de entrega é obrigatório.";
      expect(mensagemDeErroDoPedido({ code: "P0001", message: recusa })).toBe(recusa);
    });

    it("23514 (check_violation dos limites) também chega inteira", () => {
      const recusa = "Muitos pedidos em sequência. Aguarde um instante e tente de novo.";
      expect(mensagemDeErroDoPedido({ code: "23514", message: recusa })).toBe(recusa);
    });

    it("o pedido mínimo continua dizendo o valor que falta", () => {
      const recusa = "Pedido mínimo de R$ 30,00 não atingido.";
      expect(mensagemDeErroDoPedido({ code: "P0001", message: recusa })).toBe(recusa);
    });
  });

  describe("falha de infraestrutura vira frase em português", () => {
    // Cada um destes é um erro que o cliente REALMENTE veria na tela hoje.
    it.each([
      ["sem internet (supabase-js lança e o catch repassa)", undefined, "TypeError: Failed to fetch"],
      ["função fora do cache do PostgREST", "PGRST202", "Could not find the function public.criar_pedido_delivery(p_payload, p_slug) in the schema cache"],
      ["violação de RLS", "42501", "new row violates row-level security policy for table \"delivery_pedidos\""],
      ["estouro de tempo da consulta", "57014", "canceling statement due to statement timeout"],
      ["coluna que não existe (schema fora de sincronia)", "42703", "column \"taxa_km\" of relation \"delivery_pedidos\" does not exist"],
      ["chave duplicada", "23505", "duplicate key value violates unique constraint \"delivery_pedidos_tenant_numero_key\""],
    ])("%s não aparece na tela", (_titulo, code, message) => {
      expect(mensagemDeErroDoPedido({ code, message })).toBe(GENERICA);
    });

    it("nenhuma mensagem trocada contém palavra técnica em inglês", () => {
      const tecnicos = [
        { code: undefined, message: "TypeError: Failed to fetch" },
        { code: "42501", message: "new row violates row-level security policy" },
        { code: "PGRST301", message: "JWT expired" },
      ];
      for (const erro of tecnicos) {
        const saida = mensagemDeErroDoPedido(erro);
        expect(saida).not.toMatch(
          /error|failed|policy|schema|constraint|violates|null|undefined|JWT|fetch/i
        );
      }
    });
  });

  describe("nunca devolve vazio — a tela sempre tem o que dizer", () => {
    it.each([
      ["erro nulo (servidor devolveu ok:false sem erro)", null],
      ["erro indefinido", undefined],
      ["objeto sem message", { code: "P0001" }],
      ["message vazia", { code: "P0001", message: "" }],
      ["message só de espaço", { code: "P0001", message: "   " }],
      ["message que não é texto", { code: "P0001", message: { detalhe: "x" } }],
    ])("%s cai na frase genérica", (_titulo, erro) => {
      expect(mensagemDeErroDoPedido(erro)).toBe(GENERICA);
    });

    it("a frase genérica é em português e diz o que fazer", () => {
      const saida = mensagemDeErroDoPedido({ code: "42501", message: "boom" });
      expect(saida).toMatch(/tente novamente/i);
      expect(saida.trim().length).toBeGreaterThan(0);
    });
  });

  describe("o código é o que manda, não o texto", () => {
    it("texto em português com código técnico ainda é trocado", () => {
      // Não dá para confiar no idioma: a régua tem que ser o SQLSTATE.
      const saida = mensagemDeErroDoPedido({
        code: "42501",
        message: "permissão negada para a tabela",
      });
      expect(saida).toBe(GENERICA);
    });

    it("texto em inglês com P0001 passa (é recado nosso, mal escrito é outro problema)", () => {
      const saida = mensagemDeErroDoPedido({ code: "P0001", message: "Loja fechada." });
      expect(saida).toBe("Loja fechada.");
    });

    it("código ausente não é tratado como recado do servidor", () => {
      expect(mensagemDeErroDoPedido({ message: "Endereço de entrega é obrigatório." })).toBe(
        GENERICA
      );
    });

    it("espaço em volta da recusa é aparado antes de ir para a tela", () => {
      expect(mensagemDeErroDoPedido({ code: "P0001", message: "  Loja fechada.  " })).toBe(
        "Loja fechada."
      );
    });
  });
});

// ── Terceiros com prazo (Run 6, leva 11) ───────────────────────────
//
// O defeito: ViaCEP e Nominatim eram chamados com `fetch` puro, sem prazo
// nenhum. Um socket que abre e não responde fica pendurado por minutos — e
// no modo "taxa por distância" isso MATAVA o checkout: a tela ficava em
// "Calculando a taxa de entrega…" para sempre, o "Ir para o pagamento"
// nunca liberava e o "Tentar de novo" nem aparecia, porque os dois só
// existem depois de a busca TERMINAR. O cliente só saía dali recarregando
// a página, no meio da compra.

const PRAZO = 8000;

function erroDeAbort() {
  const e = new Error("The operation was aborted.");
  e.name = "AbortError";
  return e;
}

/**
 * Terceiro que abre a conexão e nunca responde — só o abort a encerra.
 * Fiel ao `fetch` de verdade em um ponto que importa: signal que chega já
 * cancelado rejeita na hora, sem nem abrir a conexão.
 */
function fetchPendurado() {
  return vi.fn((_url, opcoes) => {
    if (opcoes?.signal?.aborted) return Promise.reject(erroDeAbort());
    return new Promise((_resolver, rejeitar) => {
      opcoes?.signal?.addEventListener("abort", () => rejeitar(erroDeAbort()));
    });
  });
}

/** Terceiro saudável, com a resposta pronta. */
function fetchOk(corpo) {
  return vi.fn(async () => ({ ok: true, json: async () => corpo }));
}

/**
 * Terceiro que responde os cabeçalhos e pendura no corpo. Fiel ao `fetch`:
 * o abort chega à leitura do corpo, não só à abertura da conexão.
 */
function fetchCorpoPendurado() {
  return vi.fn(async (_url, opcoes) => ({
    ok: true,
    json: () =>
      new Promise((_resolver, rejeitar) => {
        opcoes?.signal?.addEventListener("abort", () => rejeitar(erroDeAbort()));
      }),
  }));
}

const fetchOriginal = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  vi.useRealTimers();
});

describe("prazo dos serviços de terceiro (Run 6, leva 11)", () => {
  it("ViaCEP pendurado desiste no prazo em vez de esperar para sempre", async () => {
    vi.useFakeTimers();
    globalThis.fetch = fetchPendurado();

    const promessa = buscarEnderecoViaCep("90000000");
    let assentou = false;
    promessa.then(() => {
      assentou = true;
    });

    // Antes do prazo não se desiste: CEP em 3G leva alguns segundos.
    await vi.advanceTimersByTimeAsync(PRAZO - 1000);
    expect(assentou).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(await promessa).toEqual({ data: null, error: null });
    // O abort tem que chegar ao fetch: sem o signal, o socket pendurado
    // continuaria de pé e a promessa nunca voltaria.
    expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("ViaCEP que responde preenche o endereço, e sem deixar timer para trás", async () => {
    vi.useFakeTimers();
    globalThis.fetch = fetchOk({
      bairro: "Centro",
      logradouro: "Rua X",
      localidade: "Porto Alegre",
      uf: "RS",
    });

    const { data } = await buscarEnderecoViaCep("90000-000");

    expect(data).toEqual({
      bairro: "Centro",
      logradouro: "Rua X",
      cidade: "Porto Alegre",
      uf: "RS",
    });
    // O alarme do prazo é desarmado no fim. Um alarme vivo por busca ficaria
    // acumulando na aba do cliente, e aqui denuncia o clearTimeout que falta.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("CEP inexistente segue devolvendo vazio (o ViaCEP responde ok com erro:true)", async () => {
    globalThis.fetch = fetchOk({ erro: true });
    expect(await buscarEnderecoViaCep("99999999")).toEqual({ data: null, error: null });
  });

  it("resposta não-ok do terceiro continua virando degradação graciosa", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect(await buscarEnderecoViaCep("90000000")).toEqual({ data: null, error: null });
    expect(await geocodificarEndereco("Rua X, 10")).toEqual({ data: null, error: null });
  });

  it("Nominatim pendurado desiste no prazo — é o que destrava o checkout", async () => {
    vi.useFakeTimers();
    globalThis.fetch = fetchPendurado();

    const promessa = geocodificarEndereco("Rua X, 10, Centro");
    let assentou = false;
    promessa.then(() => {
      assentou = true;
    });

    await vi.advanceTimersByTimeAsync(PRAZO - 1000);
    expect(assentou).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(await promessa).toEqual({ data: null, error: null });
    expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("Nominatim que responde continua devolvendo a coordenada", async () => {
    globalThis.fetch = fetchOk([{ lat: "-30.03", lon: "-51.23" }]);
    const { data } = await geocodificarEndereco("Rua X, 10, Centro");
    expect(data).toEqual({ lat: -30.03, lng: -51.23 });
  });

  it("autocomplete pendurado desiste no prazo, e o cancelamento de fora continua valendo", async () => {
    vi.useFakeTimers();
    globalThis.fetch = fetchPendurado();

    const pendurada = sugerirEnderecos("Rua X, 10, Centro");
    await vi.advanceTimersByTimeAsync(PRAZO);
    expect(await pendurada).toEqual({ data: [], error: null });

    // Quem digita rápido cancela a busca obsoleta ANTES do prazo. Esse
    // contrato já existia e não pode ter se perdido ao ganhar o prazo.
    const ctrl = new AbortController();
    const cancelada = sugerirEnderecos("Rua Y, 20, Centro", { signal: ctrl.signal });
    ctrl.abort();
    expect(await cancelada).toEqual({ data: [], error: null });
    expect(globalThis.fetch.mock.calls[1][1].signal.aborted).toBe(true);
    // E o alarme do prazo não fica de pé depois do cancelamento.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("autocomplete com o signal já cancelado não sai da tela sem resposta", async () => {
    globalThis.fetch = fetchPendurado();
    const ctrl = new AbortController();
    ctrl.abort();

    expect(await sugerirEnderecos("Rua X, 10", { signal: ctrl.signal })).toEqual({
      data: [],
      error: null,
    });
  });

  it("corpo que começa a chegar e para no meio também tem prazo", async () => {
    vi.useFakeTimers();
    globalThis.fetch = fetchCorpoPendurado();

    // O prazo tem que cobrir a leitura do corpo, não só a abertura da
    // conexão: um terceiro que devolve o cabeçalho e para no meio do JSON
    // pendura o checkout igual a um que nunca respondeu.
    const promessa = geocodificarEndereco("Rua X, 10, Centro");
    let assentou = false;
    promessa.then(() => {
      assentou = true;
    });

    await vi.advanceTimersByTimeAsync(PRAZO - 1000);
    expect(assentou).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(await promessa).toEqual({ data: null, error: null });
  });
});
