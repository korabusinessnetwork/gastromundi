// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Run 4 (estoque) — a tela de estoque do desktop.
 *
 * Os dois campos digitáveis da tela (saldo direto e mínimo) gravavam no banco a
 * cada tecla. Isso produzia dois estragos concretos:
 *
 *   1. Apagar o campo de saldo para digitar outro número gravava 0 — o saldo do
 *      produto ia para zero no banco sem ninguém pedir.
 *   2. Apagar o campo de mínimo gravava mínimo 0, desligando em silêncio o
 *      alerta de estoque baixo daquele produto.
 *
 * E nenhum dos caminhos de gravação olhava o `error` que o AppContext devolve.
 * Como o AppContext desfaz o valor otimista quando a gravação falha, o número
 * voltava sozinho e o operador achava que tinha salvo.
 *
 * Cada teste aqui prende um desses comportamentos.
 */

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/console/adminAuth", () => ({
  verificarSenhaAdmin: vi.fn(() => Promise.resolve({ ok: true, erro: null })),
}));

import { setAppMock } from "@/test/mockApp";
import { verificarSenhaAdmin } from "@/lib/console/adminAuth";
import EstoqueView, { lerQuantidade, controlaEstoque } from "./EstoqueView";

const CAFE = { id: 1, name: "Café", category: "Insumo", price: 12, unidade_estoque: "kg" };
/** Mesmo café, mas comprado em saca de 60 kg — habilita a coluna de entrada com conversão. */
const CAFE_SACA = { ...CAFE, unidades_compra: [{ unidade: "saca", fator: 60 }] };

let updateEstoque, setMinimoEstoque, entradaEstoque;

beforeEach(() => {
  vi.clearAllMocks();
  updateEstoque    = vi.fn(() => Promise.resolve({ error: null }));
  setMinimoEstoque = vi.fn(() => Promise.resolve({ error: null }));
  entradaEstoque   = vi.fn(() => Promise.resolve({ error: null }));
});

function montar({ products = [CAFE], estoque = { 1: 8 }, estoqueMinimos = { 1: 5 } } = {}) {
  setAppMock({ products, estoque, estoqueMinimos, updateEstoque, setMinimoEstoque, entradaEstoque });
  return render(<MemoryRouter><EstoqueView /></MemoryRouter>);
}

/** A coluna de entrada é protegida por senha de gerente — libera para poder digitar. */
async function liberarEntrada() {
  fireEvent.click(screen.getByRole("button", { name: /Liberar Entrada/ }));
  fireEvent.change(screen.getByPlaceholderText("Digite a senha..."), { target: { value: "1234" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Liberar" })); });
}

async function montarLiberado(opcoes) {
  const r = montar(opcoes);
  await liberarEntrada();
  return r;
}

const campoSaldo  = () => screen.getByLabelText("Saldo em estoque de Café");
const campoMinimo = () => screen.getByLabelText("Estoque mínimo de Café");

/** Digita num campo e sai dele — é assim que o operador confirma o valor. */
async function digitarESair(campo, valor) {
  fireEvent.change(campo, { target: { value: valor } });
  await act(async () => { fireEvent.blur(campo); });
}

describe("lerQuantidade", () => {
  it("campo vazio não vira zero", () => {
    expect(lerQuantidade("")).toBeNull();
    expect(lerQuantidade("   ")).toBeNull();
    expect(lerQuantidade(null)).toBeNull();
    expect(lerQuantidade(undefined)).toBeNull();
  });

  it("recusa texto e negativo, aceita vírgula decimal", () => {
    expect(lerQuantidade("abc")).toBeNull();
    expect(lerQuantidade("-3")).toBeNull();
    expect(lerQuantidade("2,5")).toBe(2.5);
    expect(lerQuantidade("2.5")).toBe(2.5);
    expect(lerQuantidade("0")).toBe(0);
  });
});

describe("EstoqueView — campo de saldo", () => {
  it("digitar não grava nada até o operador sair do campo", async () => {
    await montarLiberado();
    // Digitando "2" e depois "25": antes isso gravava saldo 2 e depois 25.
    fireEvent.change(campoSaldo(), { target: { value: "2" } });
    fireEvent.change(campoSaldo(), { target: { value: "25" } });
    expect(updateEstoque).not.toHaveBeenCalled();
    // O que foi digitado continua na tela.
    expect(campoSaldo()).toHaveValue(25);
  });

  it("grava uma única vez, com o valor final, ao sair do campo", async () => {
    await montarLiberado();
    fireEvent.change(campoSaldo(), { target: { value: "2" } });
    await digitarESair(campoSaldo(), "25");

    expect(updateEstoque).toHaveBeenCalledTimes(1);
    expect(updateEstoque).toHaveBeenCalledWith(1, 25);
  });

  it("apagar o campo não zera o estoque do produto", async () => {
    await montarLiberado();
    await digitarESair(campoSaldo(), "");

    expect(updateEstoque).not.toHaveBeenCalled();
    // O campo volta a mostrar o saldo que está no banco.
    expect(campoSaldo()).toHaveValue(8);
  });

  it("sair do campo sem mudar o número não gera gravação", async () => {
    await montarLiberado();
    await digitarESair(campoSaldo(), "8");
    expect(updateEstoque).not.toHaveBeenCalled();
  });

  it("Enter confirma o valor digitado", async () => {
    await montarLiberado();
    const campo = campoSaldo();
    campo.focus();
    fireEvent.change(campo, { target: { value: "13" } });
    await act(async () => { fireEvent.keyDown(campo, { key: "Enter" }); });

    expect(updateEstoque).toHaveBeenCalledWith(1, 13);
  });

  it("os botões + e − continuam gravando na hora", async () => {
    await montarLiberado();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button").find(b => b.className.includes("direto-btn")));
    });
    // O primeiro botão da dupla é o "−": 8 − 1 = 7.
    expect(updateEstoque).toHaveBeenCalledWith(1, 7);
  });
});

describe("EstoqueView — campo de mínimo", () => {
  it("digitar não grava até sair do campo, e grava só o valor final", async () => {
    await montarLiberado();
    fireEvent.change(campoMinimo(), { target: { value: "1" } });
    expect(setMinimoEstoque).not.toHaveBeenCalled();

    await digitarESair(campoMinimo(), "12");
    expect(setMinimoEstoque).toHaveBeenCalledTimes(1);
    expect(setMinimoEstoque).toHaveBeenCalledWith(1, 12);
  });

  it("apagar o campo não desliga o alerta do produto (mínimo 0)", async () => {
    await montarLiberado();
    await digitarESair(campoMinimo(), "");

    expect(setMinimoEstoque).not.toHaveBeenCalled();
    expect(campoMinimo()).toHaveValue(5);
  });
});

describe("EstoqueView — gravação que falha", () => {
  it("saldo: avisa na tela em vez de deixar o número voltar sozinho", async () => {
    updateEstoque = vi.fn(() => Promise.resolve({ error: { message: "rede caiu" } }));
    await montarLiberado();
    await digitarESair(campoSaldo(), "25");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o saldo de Café. Confira a conexão e tente de novo.",
    );
    // O número digitado fica na tela para o operador tentar de novo.
    expect(campoSaldo()).toHaveValue(25);
  });

  it("mínimo: avisa na tela", async () => {
    setMinimoEstoque = vi.fn(() => Promise.resolve({ error: { message: "rede caiu" } }));
    await montarLiberado();
    await digitarESair(campoMinimo(), "12");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o mínimo de Café. Confira a conexão e tente de novo.",
    );
  });

  it("gravação seguinte que dá certo limpa o aviso", async () => {
    updateEstoque = vi.fn()
      .mockResolvedValueOnce({ error: { message: "rede caiu" } })
      .mockResolvedValueOnce({ error: null });
    await montarLiberado();

    await digitarESair(campoSaldo(), "25");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await digitarESair(campoSaldo(), "30");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/**
 * Entrada de mercadoria (leva 4).
 *
 * A tela somava na memória dela e gravava o TOTAL. Duas pessoas conferindo a
 * mesma nota ao mesmo tempo perdiam mercadoria: saldo 8, uma lança 5 e grava
 * 13, a outra — que ainda via 8 — lança 3 e grava 11. Os 5 da primeira somem
 * sem erro nenhum na tela. Agora a tela manda só o QUANTO ENTROU e quem soma é
 * o banco, então o que estes testes prendem é o número que sai da tela.
 */
const campoEntrada = () => screen.getByLabelText("Entrada de Café");
const botaoAdicionar = () => screen.getByRole("button", { name: /Adicionar/ });

describe("EstoqueView — entrada de mercadoria", () => {
  it("manda o quanto entrou, não o saldo somado na tela", async () => {
    await montarLiberado({ products: [CAFE_SACA] });
    // Aba do estoque direto ("kg"), para tirar a conversão do caminho.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /kg/ })); });
    fireEvent.change(campoEntrada(), { target: { value: "5" } });
    await act(async () => { fireEvent.click(botaoAdicionar()); });

    // 5, e não 13 (8 de saldo + 5): é essa diferença que impedia a perda.
    expect(entradaEstoque).toHaveBeenCalledWith(1, 5);
    expect(updateEstoque).not.toHaveBeenCalled();
  });

  it("entrada em unidade de compra converte antes de mandar", async () => {
    await montarLiberado({ products: [CAFE_SACA] });
    // Aba padrão é a primeira unidade de compra: 2 sacas de 60 kg = 120 kg.
    fireEvent.change(campoEntrada(), { target: { value: "2" } });
    await act(async () => { fireEvent.click(botaoAdicionar()); });

    expect(entradaEstoque).toHaveBeenCalledWith(1, 120);
  });

  it("Enter no campo lança a entrada", async () => {
    await montarLiberado({ products: [CAFE_SACA] });
    const campo = campoEntrada();
    fireEvent.change(campo, { target: { value: "1" } });
    await act(async () => { fireEvent.keyDown(campo, { key: "Enter" }); });

    expect(entradaEstoque).toHaveBeenCalledWith(1, 60);
  });

  it("entrada que falha avisa na tela e mantém o número digitado", async () => {
    entradaEstoque = vi.fn(() => Promise.resolve({ error: { message: "rede caiu" } }));
    await montarLiberado({ products: [CAFE_SACA] });
    fireEvent.change(campoEntrada(), { target: { value: "2" } });
    await act(async () => { fireEvent.click(botaoAdicionar()); });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível salvar a entrada de Café. Confira a conexão e tente de novo.",
    );
    expect(campoEntrada()).toHaveValue(2);
  });

  it("entrada que dá certo limpa o campo", async () => {
    await montarLiberado({ products: [CAFE_SACA] });
    fireEvent.change(campoEntrada(), { target: { value: "2" } });
    await act(async () => { fireEvent.click(botaoAdicionar()); });

    expect(campoEntrada()).toHaveValue(null);
  });
});

/**
 * Entrada que a conversão zera (leva 7).
 *
 * A conta `quantidade × fator` pode dar 0 mesmo com o operador tendo digitado um
 * número válido: o fator do cadastro está em branco, a unidade selecionada
 * deixou de existir (produto editado em outro aparelho), ou a quantidade é menor
 * que a menor fração que o saldo guarda. Nesses casos a tela mandava uma entrada
 * de 0 para o banco: o campo limpava, nenhum aviso aparecia e o saldo não
 * mexia. O operador só descobria conferindo a prateleira.
 */
describe("EstoqueView — entrada zerada pela conversão", () => {
  const MSG = "A entrada de Café ficou em 0 depois da conversão. Confira a unidade de compra do produto e a quantidade digitada.";

  it("fator em branco no cadastro não grava entrada de 0", async () => {
    // Unidade de compra cadastrada sem preencher o fator.
    await montarLiberado({ products: [{ ...CAFE, unidades_compra: [{ unidade: "saca", fator: "" }] }] });
    fireEvent.change(campoEntrada(), { target: { value: "2" } });
    await act(async () => { fireEvent.click(botaoAdicionar()); });

    expect(entradaEstoque).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(MSG);
    // O número digitado fica na tela: o que precisa de correção é o cadastro.
    expect(campoEntrada()).toHaveValue(2);
  });

  it("quantidade menor que a menor fração do saldo não grava entrada de 0", async () => {
    // Compra em gramas: 0,4 g = 0,0004 kg, abaixo do grama que o saldo guarda.
    await montarLiberado({ products: [{ ...CAFE, unidades_compra: [{ unidade: "g", fator: 0.001 }] }] });
    fireEvent.change(campoEntrada(), { target: { value: "0.4" } });
    await act(async () => { fireEvent.click(botaoAdicionar()); });

    expect(entradaEstoque).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(MSG);
  });

  it("1 g ainda entra — a guarda não barra o que dá pelo menos 1 grama", async () => {
    await montarLiberado({ products: [{ ...CAFE, unidades_compra: [{ unidade: "g", fator: 0.001 }] }] });
    fireEvent.change(campoEntrada(), { target: { value: "1" } });
    await act(async () => { fireEvent.click(botaoAdicionar()); });

    expect(entradaEstoque).toHaveBeenCalledWith(1, 0.001);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/**
 * Produto que não controla estoque (leva 8).
 *
 * A tela lia `estoque[p.id] ?? 0` e tratava o 0 como saldo real. Só que a maior
 * parte do catálogo de um restaurante — os pratos do cardápio — não tem linha na
 * tabela `estoque`: quem controla saldo é o insumo. O resultado: o KPI
 * "Sem estoque" mostrava o cardápio inteiro, a coluna de saldo ficava vermelha
 * de ponta a ponta e o insumo que acabou de verdade se perdia no meio.
 *
 * A regra correta já existia no Jarvas (`regraEstoque` em src/lib/jarvas/jarvasEngine.js):
 * sem linha na tabela, o produto não controla estoque. Agora a tela usa a mesma.
 */
describe("EstoqueView — produto que não controla estoque", () => {
  const PRATO = { id: 2, name: "Feijoada", category: "Prato", price: 45, unidade_estoque: "un" };

  /**
   * Lê o número de um cartão de KPI pelo rótulo. Busca pela classe do rótulo em
   * vez de `getByText`: "Sem estoque" também é o status escrito em cada linha.
   */
  const kpi = (label) =>
    Array.from(document.querySelectorAll(".estoque-view__kpi"))
      .find(c => c.querySelector(".estoque-view__kpi-label").textContent === label)
      .querySelector(".estoque-view__kpi-valor").textContent;

  const statusDe = (nome) =>
    screen.getByLabelText(`Estoque mínimo de ${nome}`)
      .closest(".estoque-view__saldo")
      .querySelector(".estoque-view__saldo-status");

  const saldoDe = (nome) =>
    screen.getByLabelText(`Estoque mínimo de ${nome}`)
      .closest(".estoque-view__saldo")
      .querySelector(".estoque-view__saldo-valor");

  it("controlaEstoque só é verdadeiro para produto com linha na tabela", () => {
    expect(controlaEstoque({ 1: 8 }, 1)).toBe(true);
    // Saldo zerado é saldo: o produto controla estoque e acabou.
    expect(controlaEstoque({ 1: 0 }, 1)).toBe(true);
    expect(controlaEstoque({ 1: 8 }, 2)).toBe(false);
    expect(controlaEstoque({}, 1)).toBe(false);
    expect(controlaEstoque(undefined, 1)).toBe(false);
    // Linha apagada no meio do caminho também não controla.
    expect(controlaEstoque({ 1: null }, 1)).toBe(false);
  });

  it('KPI "Sem estoque" não conta o cardápio — só insumo que zerou', async () => {
    montar({ products: [CAFE, PRATO], estoque: { 1: 0 }, estoqueMinimos: { 1: 5 } });

    // Antes marcava 2: o café zerado e a feijoada, que nem controla estoque.
    expect(kpi("Sem estoque")).toBe("1");
  });

  it("linha do produto sem estoque controlado mostra travessão e status neutro", async () => {
    montar({ products: [CAFE, PRATO], estoque: { 1: 0 }, estoqueMinimos: { 1: 5 } });

    expect(saldoDe("Feijoada")).toHaveTextContent("—");
    expect(statusDe("Feijoada")).toHaveTextContent("Não controla");
    // Cinza, não vermelho — a cor é o que o operador vê primeiro.
    expect(statusDe("Feijoada").style.color).toBe("var(--gm-muted)");
  });

  it("insumo zerado continua vermelho e escrito 'Sem estoque'", async () => {
    montar({ products: [CAFE, PRATO], estoque: { 1: 0 }, estoqueMinimos: { 1: 5 } });

    expect(saldoDe("Café")).toHaveTextContent("0");
    expect(statusDe("Café")).toHaveTextContent("Sem estoque");
    expect(statusDe("Café").style.color).toBe("var(--gm-red)");
  });

  it('KPI "Total em estoque" não mostra dízima na tela (leva 9)', () => {
    // 0,1 + 0,2 em JavaScript dá 0.30000000000000004. Sem formatar, era isso
    // que aparecia no cartão — dezessete casas depois da vírgula.
    montar({ products: [CAFE, PRATO], estoque: { 1: 0.1, 2: 0.2 }, estoqueMinimos: {} });

    expect(kpi("Total em estoque")).toBe("0.3");
  });
});

/**
 * Busca, ordenação e chips de categoria (leva 10).
 *
 * Três defeitos na mesma barra de filtros:
 *
 *   1. A busca só baixava a caixa das letras. Quem digita "acai" — ninguém
 *      digita "ç" e "í" no meio do serviço — não achava "Açaí".
 *   2. A ordenação comparava as strings com `<` e `>`, que é ordem de código
 *      Unicode: "ç" (U+00E7) vem depois de "z" (U+007A). Todo produto acentuado
 *      ia para o fim da lista.
 *   3. Havia uma categoria escrita no código ("Insumo"). O chip aparecia mesmo
 *      em estabelecimento que não usa esse nome, e clicar nele dava tabela
 *      vazia — além de contrariar o white-label (decisão 017).
 */
describe("EstoqueView — busca, ordenação e categorias", () => {
  const ACAI  = { id: 3, name: "Açaí",  category: "Polpa",  price: 20, unidade_estoque: "kg" };
  const ZEBRA = { id: 4, name: "Zebra", category: "Bebida", price: 10, unidade_estoque: "un" };
  const DOIS  = { products: [ZEBRA, ACAI], estoque: { 3: 5, 4: 5 }, estoqueMinimos: { 3: 1, 4: 1 } };
  /**
   * "Água" tem o acento na PRIMEIRA letra — é o caso que revela o defeito.
   * Comparando por código Unicode, "á" (U+00E1) vem depois de "z" (U+007A), e o
   * produto ia para o fim da lista. Em "Açaí" o acento está no meio, e ali a
   * comparação errada dá o mesmo resultado da certa: só ele não prova nada.
   */
  const AGUA  = { id: 5, name: "Água",  category: "Bebida", price: 4,  unidade_estoque: "un" };
  const TRES  = {
    products: [ZEBRA, ACAI, AGUA],
    estoque: { 3: 5, 4: 5, 5: 5 },
    estoqueMinimos: { 3: 1, 4: 1, 5: 1 },
  };

  /** Os nomes na ordem em que as linhas aparecem na tabela. */
  const nomesNaOrdem = () =>
    Array.from(document.querySelectorAll('[aria-label^="Estoque mínimo de "]'))
      .map(el => el.getAttribute("aria-label").replace("Estoque mínimo de ", ""));

  const chips = () =>
    Array.from(document.querySelectorAll(".estoque-view__categoria")).map(b => b.textContent);

  const buscar = (termo) =>
    fireEvent.change(screen.getByPlaceholderText("Buscar produto..."), { target: { value: termo } });

  it("busca sem acento acha produto acentuado", () => {
    montar(DOIS);
    buscar("acai");
    expect(nomesNaOrdem()).toEqual(["Açaí"]);
  });

  it("busca ignora maiúscula e acento digitado", () => {
    montar(DOIS);
    buscar("AÇAÍ");
    expect(nomesNaOrdem()).toEqual(["Açaí"]);
    buscar("  aÇa  ");
    expect(nomesNaOrdem()).toEqual(["Açaí"]);
  });

  it("produto acentuado entra na ordem alfabética, não no fim da lista", () => {
    montar(TRES);
    // Ordem inicial é por nome, crescente. Com a comparação por código Unicode,
    // "Água" aparecia depois de "Zebra".
    expect(nomesNaOrdem()).toEqual(["Açaí", "Água", "Zebra"]);
  });

  it("clicar no cabeçalho inverte a ordem alfabética", () => {
    montar(TRES);
    fireEvent.click(screen.getByText("Produto"));
    expect(nomesNaOrdem()).toEqual(["Zebra", "Água", "Açaí"]);
  });

  it("ordenação por saldo continua numérica", () => {
    montar({ ...DOIS, estoque: { 3: 9, 4: 2 } });
    fireEvent.click(screen.getByText("Saldo"));
    expect(nomesNaOrdem()).toEqual(["Zebra", "Açaí"]);
  });

  it("chip de categoria só existe se algum produto usa a categoria", () => {
    montar(DOIS);
    expect(chips()).toEqual(["Todos", "Bebida", "Polpa"]);
    // "Insumo" estava escrito no código e aparecia para todo mundo.
    expect(chips()).not.toContain("Insumo");
  });

  it("filtrar por categoria mostra só os produtos dela", () => {
    montar(DOIS);
    fireEvent.click(screen.getByRole("button", { name: "Polpa" }));
    expect(nomesNaOrdem()).toEqual(["Açaí"]);
  });
});

/**
 * Portão de senha da liberação de entrada (Run 5, leva 9).
 *
 * A tela traduzia todo `false` da verificação em "Senha incorreta". Só que a RPC
 * `verificar_senha_admin` trava em 5 tentativas por minuto, e sem internet ela
 * nem responde — nos dois casos o gerente digitava a senha CERTA e lia "Senha
 * incorreta", sem nenhuma pista do que fazer. Agora a verificação devolve
 * `{ ok, erro }` e a tela mostra o `erro` quando ele existe.
 *
 * O par de testes abaixo é o que importa: o texto próprio da tela tem de
 * continuar aparecendo na senha errada, e sumir quando há motivo de verdade.
 */
describe("EstoqueView — portão de senha da entrada", () => {
  const MSG_BLOQUEIO = "Muitas tentativas de senha. Aguarde um minuto e tente novamente.";
  const MSG_SEM_REDE = "Sem internet: a senha de administrador só pode ser validada online.";

  async function tentarLiberar(resultado, senha = "1234") {
    verificarSenhaAdmin.mockResolvedValueOnce(resultado);
    montar({ products: [CAFE_SACA] });
    fireEvent.click(screen.getByRole("button", { name: /Liberar Entrada/ }));
    fireEvent.change(screen.getByPlaceholderText("Digite a senha..."), { target: { value: senha } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Liberar" })); });
  }

  it("senha errada continua dizendo que a senha está errada", async () => {
    await tentarLiberar({ ok: false, erro: null }, "errada");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Senha incorreta. Apenas administrador ou gerente pode liberar.",
    );
    // A coluna de entrada continua trancada e a caixa de senha continua aberta.
    expect(screen.queryByLabelText("Entrada de Café")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Digite a senha...")).toBeInTheDocument();
  });

  it("bloqueio por tentativas aparece na tela em vez de 'Senha incorreta'", async () => {
    await tentarLiberar({ ok: false, erro: MSG_BLOQUEIO });

    expect(screen.getByRole("alert")).toHaveTextContent(MSG_BLOQUEIO);
    expect(screen.queryByText(/Senha incorreta/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Entrada de Café")).not.toBeInTheDocument();
  });

  it("sem internet a tela diz que falta internet", async () => {
    await tentarLiberar({ ok: false, erro: MSG_SEM_REDE });

    expect(screen.getByRole("alert")).toHaveTextContent(MSG_SEM_REDE);
    expect(screen.queryByText(/Senha incorreta/)).not.toBeInTheDocument();
  });

  it("senha certa libera a coluna de entrada", async () => {
    await tentarLiberar({ ok: true, erro: null });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Entrada de Café")).toBeInTheDocument();
  });
});
