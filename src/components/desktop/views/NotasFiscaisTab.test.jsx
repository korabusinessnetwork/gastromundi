// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import { setAppMock } from "@/test/mockApp";
import NotasFiscaisTab from "./NotasFiscaisTab";

const FORNECEDOR = { id: "f1", nome: "Distribuidora Sul", cnpj: null };
const PRODUTO = { id: "p1", name: "Farinha", emoji: "🌾", unidade_estoque: "kg" };
/** Produto que NÃO está na nota — serve para provar que ele não é tocado. */
const ACUCAR = { id: "p2", name: "Açúcar", emoji: "🍬", unidade_estoque: "kg" };

let recarregarEstoque;

/** Argumentos da única chamada à RPC de importação (tarefa 1.2). */
function argsImportacao() {
  const chamadas = mockSupabase.current.calls.filter(c => c.rpc === "importar_nota_fiscal");
  expect(chamadas).toHaveLength(1);
  return chamadas[0].args[0];
}

/** Nenhuma escrita direta nas tabelas da nota nem no saldo: tudo passa pela RPC. */
function escritasDiretas() {
  return mockSupabase.current.calls.filter(c =>
    ["insert", "update", "delete", "upsert"].includes(c.method)
    && ["notas_fiscais", "notas_fiscais_itens", "estoque_entradas", "estoque"].includes(c.table));
}

// 2026-07-16T00:30:00Z = 15/07 às 21h30 em São Paulo — o dia UTC já virou,
// o dia do restaurante não.
const NOITE = new Date("2026-07-16T00:30:00.000Z");

/** Roda `fn` com o relógio parado às 21h30 e devolve o relógio real depois. */
async function às21h30(fn) {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(NOITE);
    await fn();
  } finally {
    vi.useRealTimers();
  }
}

function montar() {
  return render(<NotasFiscaisTab fornecedores={[FORNECEDOR]} onAddFornecedor={vi.fn()} />);
}

const inputData = () => document.querySelector('input[type="date"]');

beforeEach(() => {
  mockSupabase.current.reset();
  recarregarEstoque = vi.fn(() => Promise.resolve());
  setAppMock({ products: [PRODUTO], recarregarEstoque });
  mockSupabase.current.setRpcResult("importar_nota_fiscal", {
    data: [{ nota_id: "nf1", produto_id: "p1", quantidade: 12, minimo: 5 }],
    error: null,
  });
});

/**
 * Percorre o wizard da nota manual até a tela de conferência (step 4), já com o
 * item vinculado ao produto do catálogo. É o caminho que o operador faz quando
 * digita uma nota do fornecedor na mão.
 *
 * `data: ""` apaga a data de emissão de propósito — é o caso em que o código cai
 * no "hoje" como último recurso.
 */
async function irAteConferencia({ quantidade = "2", data = "2026-07-15", fator } = {}) {
  fireEvent.click(await screen.findByRole("button", { name: /nova nota manual/i }));

  fireEvent.change(screen.getByPlaceholderText(/buscar fornecedor cadastrado/i), { target: { value: "Distribuidora" } });
  fireEvent.mouseDown(screen.getByText("Distribuidora Sul"));

  fireEvent.change(inputData(), { target: { value: data } });
  fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123" } });
  fireEvent.change(screen.getByPlaceholderText(/ex: farinha de trigo/i), { target: { value: "FARINHA 5KG" } });
  fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: quantidade } });
  fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

  // Vincula o item da nota ao produto do catálogo.
  fireEvent.change(await screen.findByPlaceholderText(/buscar produto/i), { target: { value: "Farinha" } });
  fireEvent.mouseDown(screen.getByText("Farinha"));

  // A unidade da nota é "UN" e a do produto é "kg": o fator fica editável.
  if (fator !== undefined) {
    fireEvent.change(screen.getByLabelText("Fator de conversão de FARINHA 5KG"), { target: { value: fator } });
  }

  fireEvent.click(screen.getByRole("button", { name: /ver preview/i }));
  return screen.findByRole("button", { name: /confirmar importação/i });
}

describe("NotasFiscaisTab, data de emissão sugerida", () => {
  it("nota manual aberta às 21h30 nasce com a data de hoje, não a de amanhã", async () => {
    montar();
    const abrir = await screen.findByRole("button", { name: /nova nota manual/i });

    // O relógio falso cobre só o clique (síncrono).
    await às21h30(async () => {
      fireEvent.click(abrir);
    });

    expect(inputData()).toHaveValue("2026-07-15");
  });
});

describe("NotasFiscaisTab, entrada de estoque sem data na nota", () => {
  it("nota sem data de emissão dá entrada no estoque hoje, não amanhã", async () => {
    montar();
    const confirmar = await irAteConferencia({ data: "" });

    // Aqui o relógio falso precisa cobrir o await: a data é calculada depois
    // que o insert da nota volta.
    await às21h30(async () => {
      await act(async () => {
        fireEvent.click(confirmar);
      });
    });

    await waitFor(() => expect(screen.getByText(/nota importada com sucesso/i)).toBeInTheDocument());
    const { p_nota } = argsImportacao();
    expect(p_nota.data_emissao).toBeNull();
    expect(p_nota.data_entrada).toBe("2026-07-15");
  });
});

/**
 * Leva 6 — a importação de nota fiscal e o estoque.
 *
 * O passo final da importação montava `{ ...estoque }` — o mapa INTEIRO de
 * saldos que este navegador tinha em memória — e mandava tudo de volta num
 * upsert. Importar uma nota de 3 itens regravava o saldo de TODOS os produtos do
 * catálogo com o valor que a aba viu quando carregou. Qualquer venda ou ajuste
 * feito em outro aparelho desde então era apagado, em silêncio, em produtos que
 * nem estavam na nota.
 *
 * Agora só os itens da nota são tocados, e quem soma é o banco. Desde a tarefa
 * 1.2 do plano de refatoração, a soma acontece dentro da RPC
 * `importar_nota_fiscal`, na mesma transação da nota: ou tudo, ou nada.
 */
describe("NotasFiscaisTab, importação e saldo do estoque", () => {
  it("toca só os produtos da nota, o resto do catálogo fica intacto", async () => {
    setAppMock({
      products: [PRODUTO, ACUCAR],
      estoque: { p1: 10, p2: 99 },
      recarregarEstoque,
    });
    montar();
    const confirmar = await irAteConferencia();
    await act(async () => { fireEvent.click(confirmar); });

    await waitFor(() => expect(screen.getByText(/nota importada com sucesso/i)).toBeInTheDocument());
    // Uma chamada só, levando apenas o produto da nota, com o quanto entrou.
    const { p_itens } = argsImportacao();
    expect(p_itens).toHaveLength(1);
    expect(p_itens[0]).toMatchObject({ product_id: "p1", quantidade_estoque: 2 });
    // Nenhuma gravação direta: era o upsert do mapa inteiro que apagava o
    // saldo de produtos que nem estavam na nota.
    expect(escritasDiretas()).toHaveLength(0);
    // A tela relê o saldo que o banco confirmou.
    expect(recarregarEstoque).toHaveBeenCalled();
  });

  it("recusa do banco não deixa nada gravado e diz o motivo", async () => {
    // Antes, uma falha depois da nota deixava a nota gravada pela metade e a
    // reimportação era recusada. Agora a recusa desfaz tudo; o aviso diz por quê.
    mockSupabase.current.setRpcError("importar_nota_fiscal", {
      code: "23505",
      message: 'duplicate key value violates unique constraint "notas_fiscais_chave_acesso_key"',
    });
    montar();
    const confirmar = await irAteConferencia();
    await act(async () => { fireEvent.click(confirmar); });

    expect(await screen.findByText(/esta nota já foi importada/i)).toBeInTheDocument();
    expect(screen.queryByText(/nota importada com sucesso/i)).not.toBeInTheDocument();
    expect(recarregarEstoque).not.toHaveBeenCalled();
    expect(escritasDiretas()).toHaveLength(0);
  });

  it("fator fracionário não grava dízima no saldo", async () => {
    montar();
    // 3 unidades × 0,35 kg: em JS isso dá 1.0499999999999998.
    const confirmar = await irAteConferencia({ quantidade: "3", fator: "0.35" });
    await act(async () => { fireEvent.click(confirmar); });

    await waitFor(() => expect(screen.getByText(/nota importada com sucesso/i)).toBeInTheDocument());
    // Saldo e histórico saem do mesmo número no banco: quantidade_estoque.
    expect(argsImportacao().p_itens[0].quantidade_estoque).toBe(1.05);
  });

  it("quantidade com mais casas que o saldo guarda entra arredondada", async () => {
    montar();
    // O operador digita 2,6667 e vincula o produto sem tocar no fator — quem
    // arredonda aí é o vínculo. A tela mostra 2,667 (três casas): o banco tem
    // de receber o mesmo número que ele leu, não 2,6667.
    const confirmar = await irAteConferencia({ quantidade: "2.6667" });
    await act(async () => { fireEvent.click(confirmar); });

    await waitFor(() => expect(screen.getByText(/nota importada com sucesso/i)).toBeInTheDocument());
    expect(argsImportacao().p_itens[0].quantidade_estoque).toBe(2.667);
  });

  it("fator apagado bloqueia a importação em vez de importar quantidade 0", async () => {
    montar();
    // Operador apaga o campo de fator: o parse cai para 0 e a conversão dá 0.
    const confirmar = await irAteConferencia({ fator: "" });

    expect(confirmar).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Farinha ficou com quantidade 0 para o estoque.",
    );
    // Nada foi gravado: antes a nota entrava, o saldo não mexia e a tela dizia
    // "1 produto atualizado no estoque".
    await act(async () => { fireEvent.click(confirmar); });
    expect(mockSupabase.current.calls.filter(c => c.rpc === "importar_nota_fiscal")).toHaveLength(0);
    expect(escritasDiretas()).toHaveLength(0);
  });
});
