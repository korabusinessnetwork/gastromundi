import { describe, it, expect, vi, beforeEach } from "vitest";

const { registrarInsight, buscarInsights } = vi.hoisted(() => ({
  registrarInsight: vi.fn(),
  buscarInsights: vi.fn(),
}));

vi.mock("./jarvas", () => ({ registrarInsight, buscarInsights }));

import { verificarEstoqueMinimo, verificarOversell, gerarAlertaEstoque, gerarAlertaOversell, gerarAlertaBaixaFalhou, decidirAlertaDeLote, iniciarLoteDeBaixas, fecharLoteDeBaixas, LIMIAR_FALHA_SISTEMICA, processarBaixaEstoque, isRpcAusente } from "./estoque";

describe("verificarEstoqueMinimo", () => {
  it("detecta quando a baixa cruza o mínimo (estava acima, ficou em/abaixo)", () => {
    expect(verificarEstoqueMinimo(11, 10, 10)).toBe(true); // cruzou exatamente no limite
    expect(verificarEstoqueMinimo(12, 5, 10)).toBe(true);
    expect(verificarEstoqueMinimo(11, 0, 10)).toBe(true); // ruptura
  });

  it("não dispara quando o saldo continua acima do mínimo", () => {
    expect(verificarEstoqueMinimo(15, 12, 10)).toBe(false);
  });

  it("não dispara quando já estava abaixo do mínimo antes da baixa", () => {
    expect(verificarEstoqueMinimo(8, 5, 10)).toBe(false);
  });

  it("não dispara quando o saldo estava exatamente no mínimo antes (já era 'baixo')", () => {
    expect(verificarEstoqueMinimo(10, 9, 10)).toBe(false);
  });

  it("lida com mínimo ausente/inválido como zero", () => {
    expect(verificarEstoqueMinimo(5, 0, null)).toBe(true);
    expect(verificarEstoqueMinimo(0, 0, undefined)).toBe(false);
  });
});

describe("verificarOversell", () => {
  it("detecta baixa maior que o saldo disponível", () => {
    expect(verificarOversell(2, 5)).toBe(true);
    expect(verificarOversell(0, 1)).toBe(true);
  });

  it("não dispara quando o saldo cobre a baixa", () => {
    expect(verificarOversell(5, 5)).toBe(false);
    expect(verificarOversell(10, 3)).toBe(false);
  });

  it("saldo negativo/inválido conta como zero", () => {
    expect(verificarOversell(-2, 1)).toBe(true);
    expect(verificarOversell(null, 1)).toBe(true);
    expect(verificarOversell(undefined, 0)).toBe(false);
  });
});

describe("gerarAlertaOversell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra alerta 'danger' com a chave de oversell do produto", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });

    await gerarAlertaOversell({ produtoId: 7, nome: "Chopp", vendido: 5, disponivel: 2 }, "maria");

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "alerta",
        severidade: "danger",
        modulo: "estoque",
        origem: expect.objectContaining({ chave: "estoque:oversell:produto:7" }),
      }),
    );
  });

  it("dedupe: não registra se já existe alerta de oversell aberto para o produto", async () => {
    buscarInsights.mockResolvedValue({
      data: [{ id: "x", status: "novo", origem: { chave: "estoque:oversell:produto:7" } }],
      error: null,
    });

    await gerarAlertaOversell({ produtoId: 7, nome: "Chopp", vendido: 5, disponivel: 2 }, "maria");

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("nunca lança mesmo se o Jarvas falhar", async () => {
    buscarInsights.mockRejectedValue(new Error("falha de rede"));

    await expect(gerarAlertaOversell({ produtoId: 7, nome: "Chopp", vendido: 5, disponivel: 2 })).resolves.toBeUndefined();
  });
});

describe("gerarAlertaEstoque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra alerta 'warning' para estoque baixo (não zerado)", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });

    await gerarAlertaEstoque({ produtoId: 1, nome: "Suco", quantidade: 5, minimo: 10 }, "maria");

    expect(registrarInsight).toHaveBeenCalledTimes(1);
    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "alerta",
        severidade: "warning",
        modulo: "estoque",
        origem: expect.objectContaining({ chave: "estoque:minimo:produto:1" }),
      }),
    );
  });

  it("registra alerta 'danger' quando o estoque zerou", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });

    await gerarAlertaEstoque({ produtoId: 2, nome: "Água", quantidade: 0, minimo: 10 }, "maria");

    expect(registrarInsight).toHaveBeenCalledWith(expect.objectContaining({ severidade: "danger" }));
  });

  it("dedupe: não registra se já existe alerta aberto (novo/lido) para o mesmo produto", async () => {
    buscarInsights.mockResolvedValue({
      data: [{ id: "x", status: "novo", origem: { chave: "estoque:minimo:produto:1" } }],
      error: null,
    });

    await gerarAlertaEstoque({ produtoId: 1, nome: "Suco", quantidade: 5, minimo: 10 }, "maria");

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("registra normalmente quando o alerta aberto é de outro produto", async () => {
    buscarInsights.mockResolvedValue({
      data: [{ id: "x", status: "novo", origem: { chave: "estoque:minimo:produto:999" } }],
      error: null,
    });

    await gerarAlertaEstoque({ produtoId: 1, nome: "Suco", quantidade: 5, minimo: 10 }, "maria");

    expect(registrarInsight).toHaveBeenCalledTimes(1);
  });

  it("nunca lança mesmo se buscarInsights ou registrarInsight falharem", async () => {
    buscarInsights.mockRejectedValue(new Error("falha de rede"));

    await expect(gerarAlertaEstoque({ produtoId: 1, nome: "Suco", quantidade: 5, minimo: 10 }, "maria")).resolves.toBeUndefined();
    expect(registrarInsight).not.toHaveBeenCalled();
  });
});

describe("gerarAlertaBaixaFalhou", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buscarInsights.mockResolvedValue({ data: [], error: null });
  });

  it("registra alerta grave no módulo de estoque, com ação que leva ao estoque", async () => {
    await gerarAlertaBaixaFalhou(
      { produtoId: 9, nome: "Chopp", quantidade: 3, erro: { message: "new row violates row-level security policy" } },
      "maria",
    );

    expect(registrarInsight).toHaveBeenCalledTimes(1);
    const insight = registrarInsight.mock.calls[0][0];
    expect(insight).toMatchObject({
      tipo: "alerta",
      severidade: "danger",
      visibilidade: "operacional",
      modulo: "estoque",
      acao: { tipo: "abrir_estoque", params: { produto_ids: [9] } },
    });
    expect(insight.origem.chave).toBe("estoque:baixa-falhou:produto:9");
  });

  it("o texto que o gestor lê não tem jargão do banco — o erro técnico fica em origem", async () => {
    const cru = "new row violates row-level security policy for table \"estoque\"";
    await gerarAlertaBaixaFalhou({ produtoId: 9, nome: "Chopp", quantidade: 3, erro: { message: cru } }, "maria");

    const insight = registrarInsight.mock.calls[0][0];
    expect(insight.titulo).not.toContain(cru);
    expect(insight.descricao).not.toContain(cru);
    expect(insight.titulo).toContain("Chopp");
    expect(insight.descricao).toContain("Chopp");
    expect(insight.origem.dados.erro).toBe(cru);
  });

  it("não repete o alerta enquanto o do mesmo produto continua aberto", async () => {
    buscarInsights.mockResolvedValue({
      data: [{ origem: { chave: "estoque:baixa-falhou:produto:9" } }],
      error: null,
    });

    await gerarAlertaBaixaFalhou({ produtoId: 9, nome: "Chopp", quantidade: 3, erro: { message: "falha" } }, "maria");

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("subproduto tem chave própria — não é confundido com o produto de mesmo id", async () => {
    buscarInsights.mockResolvedValue({
      data: [{ origem: { chave: "estoque:baixa-falhou:produto:9" } }],
      error: null,
    });

    await gerarAlertaBaixaFalhou({ subprodutoId: 9, nome: "Molho da casa", quantidade: 0.5, erro: null }, "maria");

    expect(registrarInsight).toHaveBeenCalledTimes(1);
    const insight = registrarInsight.mock.calls[0][0];
    expect(insight.origem.chave).toBe("estoque:baixa-falhou:subproduto:9");
    expect(insight.origem.dados).toMatchObject({ subproduto_id: 9, quantidade: 0.5, erro: null });
    expect(insight.acao.params).toEqual({ subproduto_ids: [9] });
  });

  it("item sem nome ainda gera alerta legível", async () => {
    await gerarAlertaBaixaFalhou({ produtoId: 42, nome: null, quantidade: 1, erro: { code: "42501" } }, "maria");

    const insight = registrarInsight.mock.calls[0][0];
    expect(insight.titulo).toContain("Produto 42");
    expect(insight.origem.dados.erro).toBe("42501"); // erro sem `message` cai no código
  });

  it("falha do próprio Jarvas não quebra a venda", async () => {
    buscarInsights.mockRejectedValue(new Error("falha de rede"));

    await expect(
      gerarAlertaBaixaFalhou({ produtoId: 9, nome: "Chopp", quantidade: 3, erro: { message: "falha" } }, "maria"),
    ).resolves.toBeUndefined();
    expect(registrarInsight).not.toHaveBeenCalled();
  });

  // O supabase-js NÃO lança quando a RLS recusa o insert: devolve `{ error }`.
  // Sem olhar esse erro o alerta some em silêncio — e é justamente o alerta
  // que existe para não deixar o furo de estoque em silêncio.
  it("registra no console quando o próprio insight é recusado pelo banco", async () => {
    const erroDoBanco = { message: "new row violates row-level security policy" };
    registrarInsight.mockResolvedValue({ data: null, error: erroDoBanco });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      gerarAlertaBaixaFalhou({ produtoId: 9, nome: "Chopp", quantidade: 3, erro: null }, "maria"),
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("não registrado"), erroDoBanco);
    spy.mockRestore();
  });

  it("não quebra quando o registrarInsight não devolve o par { data, error }", async () => {
    registrarInsight.mockResolvedValue(undefined);

    await expect(
      gerarAlertaBaixaFalhou({ produtoId: 9, nome: "Chopp", quantidade: 3, erro: null }, "maria"),
    ).resolves.toBeUndefined();
  });
});

describe("decidirAlertaDeLote", () => {
  const item = (n) => ({ produtoId: n, nome: `Item ${n}`, quantidade: 1 });

  it("lote vazio não vira alerta nenhum", () => {
    expect(decidirAlertaDeLote([]).modo).toBe("nenhum");
    expect(decidirAlertaDeLote(null).modo).toBe("nenhum");
    expect(decidirAlertaDeLote(undefined).modo).toBe("nenhum");
  });

  it("poucas falhas continuam sendo alerta por item — pode ser problema do produto", () => {
    expect(decidirAlertaDeLote([item(1)]).modo).toBe("individual");
    expect(decidirAlertaDeLote([item(1), item(2)]).modo).toBe("individual");
  });

  it("do limiar em diante é falha sistêmica: o problema é o sistema, não o item", () => {
    expect(decidirAlertaDeLote([item(1), item(2), item(3)]).modo).toBe("sistemica");
    expect(decidirAlertaDeLote([item(1), item(2), item(3), item(4)]).modo).toBe("sistemica");
    expect(LIMIAR_FALHA_SISTEMICA).toBe(3);
  });

  it("limiar é ajustável, e valor inválido cai no padrão", () => {
    expect(decidirAlertaDeLote([item(1), item(2)], 2).modo).toBe("sistemica");
    expect(decidirAlertaDeLote([item(1), item(2)], 0).modo).toBe("individual");
    expect(decidirAlertaDeLote([item(1), item(2)], null).modo).toBe("individual");
  });

  it("descarta buracos da lista antes de contar", () => {
    expect(decidirAlertaDeLote([item(1), null, undefined]).modo).toBe("individual");
    expect(decidirAlertaDeLote([null, null]).modo).toBe("nenhum");
  });
});

describe("lote de baixas recusadas", () => {
  const falha = (id, nome) => ({ produtoId: id, nome, quantidade: 2, erro: { message: "RLS" } });

  beforeEach(() => {
    vi.clearAllMocks();
    buscarInsights.mockResolvedValue({ data: [], error: null });
    registrarInsight.mockResolvedValue({ data: null, error: null });
  });

  it("com lote aberto, nada é registrado até o fechamento", async () => {
    iniciarLoteDeBaixas();
    await gerarAlertaBaixaFalhou(falha(1, "Chopp"), "maria");
    await gerarAlertaBaixaFalhou(falha(2, "Água"), "maria");

    expect(registrarInsight).not.toHaveBeenCalled();

    await fecharLoteDeBaixas("maria");
    expect(registrarInsight).toHaveBeenCalledTimes(2);
  });

  it("uma venda que falha em tudo vira UM alerta, não um cartão por produto", async () => {
    iniciarLoteDeBaixas();
    await gerarAlertaBaixaFalhou(falha(1, "Chopp"), "maria");
    await gerarAlertaBaixaFalhou(falha(2, "Água"), "maria");
    await gerarAlertaBaixaFalhou({ subprodutoId: 7, nome: "Molho", quantidade: 0.2, erro: { message: "RLS" } }, "maria");
    await fecharLoteDeBaixas("maria");

    expect(registrarInsight).toHaveBeenCalledTimes(1);
    const insight = registrarInsight.mock.calls[0][0];
    expect(insight).toMatchObject({ tipo: "alerta", severidade: "danger", modulo: "estoque" });
    expect(insight.origem.chave).toBe("estoque:baixa-falhou:sistemica");
    expect(insight.origem.dados.total).toBe(3);
    expect(insight.acao.params).toEqual({ produto_ids: [1, 2], subproduto_ids: [7] });
  });

  it("o texto do alerta sistêmico nomeia os itens sem despejar o erro do banco", async () => {
    iniciarLoteDeBaixas();
    for (const [id, nome] of [[1, "Chopp"], [2, "Água"], [3, "Suco"]]) {
      await gerarAlertaBaixaFalhou(falha(id, nome), "maria");
    }
    await fecharLoteDeBaixas("maria");

    const insight = registrarInsight.mock.calls[0][0];
    expect(insight.descricao).toContain("Chopp");
    expect(insight.descricao).toContain("Suco");
    expect(insight.descricao).not.toContain("RLS");
    expect(insight.origem.dados.erro).toBe("RLS");
  });

  it("com muitos itens, a descrição corta a lista em vez de virar um paredão", async () => {
    iniciarLoteDeBaixas();
    for (let i = 1; i <= 8; i++) await gerarAlertaBaixaFalhou(falha(i, `Item ${i}`), "maria");
    await fecharLoteDeBaixas("maria");

    const insight = registrarInsight.mock.calls[0][0];
    expect(insight.descricao).toContain("Item 5");
    expect(insight.descricao).not.toContain("Item 6");
    expect(insight.descricao).toContain("e mais 3");
  });

  it("um alerta sistêmico aberto não é repetido a cada venda seguinte", async () => {
    buscarInsights.mockResolvedValue({
      data: [{ origem: { chave: "estoque:baixa-falhou:sistemica" } }],
      error: null,
    });

    iniciarLoteDeBaixas();
    for (let i = 1; i <= 4; i++) await gerarAlertaBaixaFalhou(falha(i, `Item ${i}`), "maria");
    await fecharLoteDeBaixas("maria");

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("venda sem nenhuma falha fecha o lote sem alertar nada", async () => {
    iniciarLoteDeBaixas();
    await fecharLoteDeBaixas("maria");

    expect(registrarInsight).not.toHaveBeenCalled();
    expect(buscarInsights).not.toHaveBeenCalled();
  });

  it("fechar sem lote aberto é inofensivo", async () => {
    await expect(fecharLoteDeBaixas("maria")).resolves.toBeUndefined();
    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("lote aninhado só publica no fechamento mais externo", async () => {
    iniciarLoteDeBaixas();
    iniciarLoteDeBaixas();
    await gerarAlertaBaixaFalhou(falha(1, "Chopp"), "maria");

    await fecharLoteDeBaixas("maria");
    expect(registrarInsight).not.toHaveBeenCalled();

    await fecharLoteDeBaixas("maria");
    expect(registrarInsight).toHaveBeenCalledTimes(1);
  });

  it("fechado o lote, a próxima falha volta a alertar na hora", async () => {
    iniciarLoteDeBaixas();
    await fecharLoteDeBaixas("maria");

    await gerarAlertaBaixaFalhou(falha(9, "Chopp"), "maria");

    expect(registrarInsight).toHaveBeenCalledTimes(1);
    expect(registrarInsight.mock.calls[0][0].origem.chave).toBe("estoque:baixa-falhou:produto:9");
  });

  it("falha do próprio Jarvas ao publicar o lote não quebra a venda", async () => {
    buscarInsights.mockRejectedValue(new Error("falha de rede"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    iniciarLoteDeBaixas();
    for (let i = 1; i <= 3; i++) await gerarAlertaBaixaFalhou(falha(i, `Item ${i}`), "maria");

    await expect(fecharLoteDeBaixas("maria")).resolves.toBeUndefined();
    expect(registrarInsight).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("processarBaixaEstoque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("baixa que cruza o mínimo dispara o alerta do Jarvas (teste de integração da venda)", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [{ quantidade: 5, minimo: 10 }], error: null }));

    const { quantidade, error } = await processarBaixaEstoque({
      produtoId: 1, qty: 6, quantidadeAnterior: 11, nomeProduto: "Suco",
      usuario: "maria", chamarRpc,
    });

    expect(error).toBeNull();
    expect(quantidade).toBe(5);
    expect(chamarRpc).toHaveBeenCalledWith(1, 6);
    await vi.waitFor(() => expect(registrarInsight).toHaveBeenCalledTimes(1));
    expect(registrarInsight.mock.calls[0][0].origem.chave).toBe("estoque:minimo:produto:1");
  });

  it("baixa que continua acima do mínimo NÃO dispara alerta", async () => {
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [{ quantidade: 12, minimo: 10 }], error: null }));

    await processarBaixaEstoque({
      produtoId: 2, qty: 3, quantidadeAnterior: 15, nomeProduto: "Água",
      usuario: "maria", chamarRpc,
    });

    await new Promise((r) => setTimeout(r, 0)); // dá chance a um fire-and-forget indevido aparecer
    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("erro na RPC não dispara alerta e devolve o erro (não quebra a venda)", async () => {
    const chamarRpc = vi.fn(() => Promise.resolve({ data: null, error: { message: "falha" } }));

    const { error, quantidade } = await processarBaixaEstoque({
      produtoId: 3, qty: 2, quantidadeAnterior: 5, nomeProduto: "Pizza",
      usuario: "maria", chamarRpc,
    });

    expect(error).toEqual({ message: "falha" });
    // TD012: o banco recusou, então NADA foi descontado — o saldo continua
    // sendo o de antes. Devolver 3 (a estimativa `5 - 2`) seria inventar um
    // número que só existe aqui dentro, que foi como o bug de RLS se escondeu.
    expect(quantidade).toBe(5);
    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("RPC que LANÇA vira erro normal — a exceção não sobe para a venda", async () => {
    const chamarRpc = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));

    const { error, quantidade } = await processarBaixaEstoque({
      produtoId: 3, qty: 2, quantidadeAnterior: 5, nomeProduto: "Pizza",
      usuario: "maria", chamarRpc,
    });

    expect(error).toEqual({ message: "Failed to fetch" });
    expect(quantidade).toBe(5);
    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("oversell (baixa maior que o saldo) dispara o alerta de venda sem estoque", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [{ quantidade: 0, minimo: 10 }], error: null }));

    const { quantidade, error } = await processarBaixaEstoque({
      produtoId: 7, qty: 5, quantidadeAnterior: 2, nomeProduto: "Chopp",
      usuario: "maria", chamarRpc,
    });

    expect(error).toBeNull();
    expect(quantidade).toBe(0);
    await vi.waitFor(() => expect(registrarInsight).toHaveBeenCalledTimes(1));
    expect(registrarInsight.mock.calls[0][0].origem.chave).toBe("estoque:oversell:produto:7");
    expect(registrarInsight.mock.calls[0][0].origem.dados).toMatchObject({ vendido: 5, disponivel: 2 });
  });

  it("oversell tem precedência sobre o alerta de mínimo (um alerta só, o mais grave)", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });
    // Cruzou o mínimo E vendeu mais do que tinha: 12 → 0 com baixa de 15.
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [{ quantidade: 0, minimo: 10 }], error: null }));

    await processarBaixaEstoque({
      produtoId: 8, qty: 15, quantidadeAnterior: 12, nomeProduto: "Água",
      usuario: "maria", chamarRpc,
    });

    await vi.waitFor(() => expect(registrarInsight).toHaveBeenCalledTimes(1));
    expect(registrarInsight.mock.calls[0][0].origem.chave).toBe("estoque:oversell:produto:8");
  });

  it("RPC OK sem linha nenhuma é FALHA, não sucesso silencioso", async () => {
    // O UPDATE não achou o produto em `estoque`: nada foi descontado. Antes
    // isso passava como sucesso e o app estimava `anterior - qty` — o mesmo
    // erro do TD012, com a tela caindo enquanto o banco não mexia.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [], error: null }));

    const { error, quantidade } = await processarBaixaEstoque({
      produtoId: 9, qty: 3, quantidadeAnterior: 10, nomeProduto: "Pastel",
      usuario: "maria", chamarRpc,
    });

    expect(error?.code).toBe("estoque_sem_linha");
    expect(quantidade).toBe(10); // saldo de antes, não a estimativa 7
    expect(registrarInsight).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("usa minimoFallback quando a RPC não devolve minimo", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [{ quantidade: 4 }], error: null }));

    await processarBaixaEstoque({
      produtoId: 4, qty: 6, quantidadeAnterior: 10, nomeProduto: "Bolo",
      minimoFallback: 5, usuario: "maria", chamarRpc,
    });

    await vi.waitFor(() => expect(registrarInsight).toHaveBeenCalledTimes(1));
    expect(registrarInsight.mock.calls[0][0].origem.dados.minimo).toBe(5);
  });
});

describe("isRpcAusente", () => {
  it("reconhece a função que o banco ainda não tem", () => {
    // Resposta real do PostgREST quando o app subiu antes da migration.
    expect(isRpcAusente({
      code: "PGRST202",
      message: "Could not find the function public.entrada_estoque(p_delta, p_op_id, p_produto_id) in the schema cache",
    })).toBe(true);
    // Mesma situação chegando pelo Postgres, sem o code do PostgREST.
    expect(isRpcAusente({ message: 'function public.entrada_estoque(bigint, numeric, uuid) does not exist' })).toBe(true);
    expect(isRpcAusente({ code: "42883", message: "erro" })).toBe(true);
  });

  it("não confunde com erro de rede, de permissão ou de dado", () => {
    expect(isRpcAusente(null)).toBe(false);
    expect(isRpcAusente(undefined)).toBe(false);
    expect(isRpcAusente({ message: "TypeError: Failed to fetch" })).toBe(false);
    expect(isRpcAusente({ code: "42501", message: "Sem permissão para dar entrada em estoque." })).toBe(false);
    expect(isRpcAusente({ code: "P0001", message: "Quantidade de entrada inválida: -3" })).toBe(false);
    // "does not exist" sobre uma COLUNA não é função faltando.
    expect(isRpcAusente({ code: "42703", message: 'column "tipo" does not exist' })).toBe(false);
  });
});
