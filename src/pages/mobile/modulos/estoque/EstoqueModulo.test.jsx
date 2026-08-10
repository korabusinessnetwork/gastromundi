// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * Run 4 (estoque) — a tela "Estoque" do Palm.
 *
 * A tela lia `estoque[p.id] ?? 0` e chamava de "ruptura" todo produto com saldo
 * 0. Só que a maior parte do catálogo de um restaurante — os pratos do cardápio —
 * não tem linha na tabela `estoque`: quem controla saldo é o insumo. O cabeçalho
 * então anunciava um alerta por prato ("48 itens · 41 alertas"), a lista abria
 * vermelha de cima a baixo e o insumo que acabou de verdade ficava perdido no
 * meio. O número que devia dizer "vai faltar comida hoje" não dizia nada.
 *
 * A regra correta já existia no Jarvas (`regraEstoque` em src/lib/jarvas/jarvasEngine.js)
 * e agora na view desktop (`controlaEstoque` em EstoqueView): sem linha na
 * tabela, o produto não controla estoque.
 */

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock } from "@/test/mockApp";
import EstoqueModulo, { controlaEstoque } from "./EstoqueModulo";

/** Insumo: tem linha na tabela `estoque`, controla saldo. */
const CAFE = { id: 1, name: "Café", unidade_estoque: "kg" };
/** Prato do cardápio: não tem linha na tabela, não controla saldo. */
const FEIJOADA = { id: 2, name: "Feijoada", unidade_estoque: "un" };

let updateEstoque;

beforeEach(() => {
  vi.clearAllMocks();
  updateEstoque = vi.fn(() => Promise.resolve({ error: null }));
});

function montar({ products = [CAFE, FEIJOADA], estoque = { 1: 0 }, estoqueMinimos = { 1: 5 } } = {}) {
  setAppMock({ products, estoque, estoqueMinimos, updateEstoque, loading: false });
  return render(<EstoqueModulo onVoltar={vi.fn()} />);
}

const subtitulo = () => document.querySelector(".mod-header__subtitulo");
const cartao = (nome) => screen.getByText(nome).closest(".mod-cartao");
const nomesNaOrdem = () =>
  Array.from(document.querySelectorAll(".mod-cartao__titulo")).map((el) => el.textContent);

describe("controlaEstoque", () => {
  it("só é verdadeiro para produto com linha na tabela", () => {
    expect(controlaEstoque({ 1: 8 }, 1)).toBe(true);
    // Saldo zerado é saldo: o produto controla estoque e acabou.
    expect(controlaEstoque({ 1: 0 }, 1)).toBe(true);
    expect(controlaEstoque({ 1: 8 }, 2)).toBe(false);
    expect(controlaEstoque({}, 1)).toBe(false);
    expect(controlaEstoque(undefined, 1)).toBe(false);
    expect(controlaEstoque({ 1: null }, 1)).toBe(false);
  });
});

describe("EstoqueModulo — produto que não controla estoque", () => {
  it("cardápio não conta alerta no cabeçalho", () => {
    montar();
    // Dois itens na lista, mas só o café zerado é problema.
    expect(subtitulo()).toHaveTextContent("2 itens · 1 alerta");
  });

  it("cartão do prato mostra travessão e 'Não controla' em vez de 'Ruptura'", () => {
    montar();
    expect(cartao("Feijoada")).toHaveTextContent("Não controla");
    expect(cartao("Feijoada")).not.toHaveTextContent("Ruptura");
    // Sem saldo não existe número para mostrar — nem o 0, que seria mentira.
    expect(cartao("Feijoada").querySelector(".estoque-modulo__qtd")).toHaveTextContent("—");
    // E o cartão não fica pintado de vermelho junto com os insumos que acabaram.
    expect(cartao("Feijoada").className).toBe("mod-cartao");
  });

  it("insumo zerado continua 'Ruptura' e em vermelho", () => {
    montar();
    expect(cartao("Café")).toHaveTextContent("Ruptura");
    expect(cartao("Café").className).toContain("mod-cartao--red");
  });

  it("quem não controla estoque desce para o fim da lista", () => {
    // Café com saldo saudável: sem a regra, a feijoada (ruptura falsa) subia
    // para o topo e empurrava o insumo de verdade para baixo.
    montar({ estoque: { 1: 20 }, estoqueMinimos: { 1: 5 } });
    expect(nomesNaOrdem()).toEqual(["Café", "Feijoada"]);
  });
});

/**
 * A busca só baixava a caixa das letras. Quem digita "acai" no teclado do
 * celular — no meio do serviço, ninguém procura o "ç" e o "í" — não achava
 * "Açaí" e concluía que o item não estava cadastrado.
 */
describe("EstoqueModulo — busca", () => {
  const ACAI = { id: 3, name: "Açaí", unidade_estoque: "kg", codigo_barras: "PLP-01" };

  const buscar = (termo) =>
    fireEvent.change(screen.getByPlaceholderText("Buscar item ou SKU…"), { target: { value: termo } });

  it("acha produto acentuado com o termo sem acento", () => {
    montar({ products: [CAFE, ACAI], estoque: { 1: 10, 3: 4 }, estoqueMinimos: { 1: 5, 3: 1 } });
    buscar("acai");
    expect(nomesNaOrdem()).toEqual(["Açaí"]);
  });

  it("acha por SKU e ignora espaço em volta", () => {
    montar({ products: [CAFE, ACAI], estoque: { 1: 10, 3: 4 }, estoqueMinimos: { 1: 5, 3: 1 } });
    buscar("  plp-01 ");
    expect(nomesNaOrdem()).toEqual(["Açaí"]);
  });
});

describe("EstoqueModulo — ordem alfabética dentro do mesmo grupo", () => {
  const AGUA  = { id: 6, name: "Água",  unidade_estoque: "un" };
  const ZEBRA = { id: 7, name: "Zebra", unidade_estoque: "un" };

  it("produto com acento na primeira letra não cai para o fim da lista", () => {
    // Os dois estão em situação "ok": quem decide a ordem é o desempate
    // alfabético. Comparando por código Unicode, "á" (U+00E1) vem depois de
    // "z" (U+007A), e "Água" ia para o fim da lista de estoque do bar.
    montar({ products: [ZEBRA, AGUA], estoque: { 6: 5, 7: 5 }, estoqueMinimos: { 6: 1, 7: 1 } });
    expect(nomesNaOrdem()).toEqual(["Água", "Zebra"]);
  });
});

/**
 * Contar um produto que não controlava estoque é como ele PASSA a controlar —
 * a contagem cria a linha na tabela. A revisão precisa dizer isso, porque
 * "Estoque atual 0 → Diferença +12" descrevia um saldo que nunca existiu.
 */
describe("EstoqueModulo — contagem de produto que não controlava estoque", () => {
  async function contar(nome, valor) {
    fireEvent.click(screen.getByRole("button", { name: /Iniciar contagem/ }));
    fireEvent.change(screen.getByLabelText(`Quantidade contada de ${nome}`), { target: { value: valor } });
  }

  it("revisão diz que o produto passa a controlar estoque", async () => {
    montar();
    await contar("Feijoada", "12");

    fireEvent.click(screen.getByRole("button", { name: /Revisar ajustes/ }));

    const revisao = cartao("Feijoada");
    expect(revisao).toHaveTextContent("passa a controlar estoque");
    // O saldo anterior não é 0: não havia saldo.
    expect(revisao).toHaveTextContent("Estoque atual—");
    expect(revisao).toHaveTextContent("Contado12 un");
  });

  it("grava a contagem e o produto começa a controlar estoque", async () => {
    montar();
    await contar("Feijoada", "12");
    fireEvent.click(screen.getByRole("button", { name: /Revisar ajustes/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Confirmar e gravar/ }));
    });

    expect(updateEstoque).toHaveBeenCalledTimes(1);
    expect(updateEstoque).toHaveBeenCalledWith(2, 12);
  });

  it("diferença de insumo que já controlava continua aparecendo", async () => {
    montar({ estoque: { 1: 20 }, estoqueMinimos: { 1: 5 } });
    await contar("Café", "18");
    fireEvent.click(screen.getByRole("button", { name: /Revisar ajustes/ }));

    const revisao = cartao("Café");
    expect(revisao).toHaveTextContent("Estoque atual20 kg");
    expect(revisao).toHaveTextContent("Diferença-2 kg");
    expect(revisao).not.toHaveTextContent("passa a controlar");
  });
});

/**
 * Run 4, leva 11 — a contagem é uma FOTO.
 *
 * A diferença era calculada contra o saldo AO VIVO. Contar estoque leva alguns
 * minutos e o restaurante não para: um pedido lançado no meio da contagem chega
 * pelo realtime, muda `estoque` e mexia no que o operador já tinha revisado.
 *
 * Três estragos, todos calados:
 *   1. a diferença revisada mudava sozinha ("-2 kg" virava "+1 kg");
 *   2. se o saldo novo batesse exatamente no valor contado, a diferença virava
 *      0, o item saía da lista de ajustes e o botão de gravar desligava — o
 *      operador apertava e não acontecia nada, sem erro nenhum;
 *   3. a lista se reordenava debaixo do dedo dele (alerta primeiro), então o
 *      campo que ele ia tocar mudava de lugar.
 */
describe("EstoqueModulo — contagem não muda debaixo do operador", () => {
  const ARROZ = { id: 5, name: "Arroz", unidade_estoque: "kg" };

  /** Outro aparelho mexeu no estoque: o provider re-renderiza com saldo novo. */
  function chegaDoRealtime(view, { products = [CAFE, FEIJOADA], estoque, estoqueMinimos = { 1: 5 } }) {
    setAppMock({ products, estoque, estoqueMinimos, updateEstoque, loading: false });
    view.rerender(<EstoqueModulo onVoltar={vi.fn()} />);
  }

  const contar = (nome, valor) => {
    fireEvent.click(screen.getByRole("button", { name: /Iniciar contagem/ }));
    fireEvent.change(screen.getByLabelText(`Quantidade contada de ${nome}`), { target: { value: valor } });
  };

  const gravar = async () =>
    act(async () => { fireEvent.click(screen.getByRole("button", { name: /Confirmar e gravar/ })); });

  it("venda no meio da contagem não muda a diferença já revisada", async () => {
    const view = montar({ estoque: { 1: 20 }, estoqueMinimos: { 1: 5 } });
    contar("Café", "18");
    fireEvent.click(screen.getByRole("button", { name: /Revisar ajustes/ }));
    expect(cartao("Café")).toHaveTextContent("Diferença-2 kg");

    // Saíram 3 kg num pedido enquanto o operador revisava.
    chegaDoRealtime(view, { estoque: { 1: 17 } });

    expect(cartao("Café")).toHaveTextContent("Estoque atual20 kg");
    expect(cartao("Café")).toHaveTextContent("Diferença-2 kg");

    // E grava o que ele contou: contagem física manda no saldo.
    await gravar();
    expect(updateEstoque).toHaveBeenCalledWith(1, 18);
  });

  it("item não desaparece da lista de ajustes quando o saldo bate no valor contado", async () => {
    const view = montar({ estoque: { 1: 20 }, estoqueMinimos: { 1: 5 } });
    contar("Café", "18");
    fireEvent.click(screen.getByRole("button", { name: /Revisar ajustes/ }));

    // O saldo do sistema caiu para exatamente 18 — a diferença "some".
    chegaDoRealtime(view, { estoque: { 1: 18 } });

    const botao = screen.getByRole("button", { name: /Confirmar e gravar/ });
    expect(botao).toHaveTextContent("(1)");
    expect(botao).not.toBeDisabled();

    await gravar();
    expect(updateEstoque).toHaveBeenCalledWith(1, 18);
  });

  it("lista não se reordena no meio da contagem", () => {
    const view = montar({
      products: [CAFE, ARROZ],
      estoque: { 1: 20, 5: 30 },
      estoqueMinimos: { 1: 5, 5: 5 },
    });
    contar("Café", "18");
    expect(nomesNaOrdem()).toEqual(["Arroz", "Café"]);

    // O café zerou no sistema: sem a foto, ele viraria "Ruptura" e pularia para
    // o topo, embaixo do dedo de quem estava digitando.
    chegaDoRealtime(view, {
      products: [CAFE, ARROZ],
      estoque: { 1: 0, 5: 30 },
      estoqueMinimos: { 1: 5, 5: 5 },
    });

    expect(nomesNaOrdem()).toEqual(["Arroz", "Café"]);
    expect(cartao("Café")).toHaveTextContent("atual: 20 kg");
    expect(cartao("Café")).not.toHaveTextContent("Ruptura");
  });

  it("depois de gravar, a tela volta a mostrar o saldo ao vivo", async () => {
    const view = montar({ estoque: { 1: 20 }, estoqueMinimos: { 1: 5 } });
    contar("Café", "18");
    fireEvent.click(screen.getByRole("button", { name: /Revisar ajustes/ }));
    await gravar();

    // A foto não pode ficar presa: gravou, acabou a contagem.
    chegaDoRealtime(view, { estoque: { 1: 17 } });
    expect(cartao("Café").querySelector(".estoque-modulo__qtd")).toHaveTextContent("17");
  });

  it("cancelar a contagem também solta a foto", () => {
    const view = montar({ estoque: { 1: 20 }, estoqueMinimos: { 1: 5 } });
    contar("Café", "18");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    chegaDoRealtime(view, { estoque: { 1: 17 } });
    expect(cartao("Café").querySelector(".estoque-modulo__qtd")).toHaveTextContent("17");
  });
});
