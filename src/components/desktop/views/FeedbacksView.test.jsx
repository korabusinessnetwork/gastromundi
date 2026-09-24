// @vitest-environment jsdom
//
// A tela que faltava. Os dois canais de feedback gravavam desde a
// migração 20261010 e não havia lugar nenhum para ler: o dono tinha os
// dados e nenhuma forma de olhar para eles.
//
// O que esta suíte prende é o comportamento que faz a tela servir:
// abrir já na lista do que falta fazer, dizer nos botões quanto tem em
// cada recorte, distinguir "nada chegou" de "nada com este filtro", e
// nunca mostrar lista vazia quando o que houve foi falha de leitura.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Só a ida ao banco é dublada; as funções puras (filtrar, contar, datar)
// continuam as de verdade, porque é delas que a tela depende para acertar
// as contagens dos botões.
const { listar, marcar } = vi.hoisted(() => ({ listar: vi.fn(), marcar: vi.fn() }));
vi.mock("@/lib/feedback", async (importOriginal) => ({
  ...(await importOriginal()),
  listarFeedbacks: listar,
  marcarResolvido: marcar,
}));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import FeedbacksView from "./FeedbacksView";

const hoje = new Date().toISOString();

const FEEDBACKS = [
  {
    id: "1", origem: "equipe", texto: "A comanda não salva a observação.",
    nota: null, tela: "Frente de Caixa", autor: "caixa1",
    pedido_id: null, resolvido: false, created_at: hoje,
  },
  {
    id: "2", origem: "equipe", texto: "A impressora repete a via.",
    nota: null, tela: "Cozinha", autor: "gerente",
    pedido_id: null, resolvido: true, created_at: hoje,
  },
  {
    id: "3", origem: "cliente", texto: "Veio frio.",
    nota: 2, tela: null, autor: null, pedido_id: null,
    resolvido: false, created_at: hoje,
  },
  {
    id: "4", origem: "cliente", texto: "Chegou rápido demais, adorei.",
    nota: 5, tela: null, autor: null, pedido_id: null,
    resolvido: false, created_at: hoje,
  },
];

function abrir(lista = FEEDBACKS, error = null) {
  listar.mockResolvedValue({ data: error ? [] : lista, error });
  const user = userEvent.setup();
  render(<FeedbacksView />);
  return { user };
}

/** Os cartões da lista que estão na tela agora. */
const cartoes = () => [...document.querySelectorAll(".feedbacks-view__item")];

/**
 * O chip de filtro pelo texto dele ("Abertos", "Da equipe"...). Ancorado
 * no início: o chip "Todos" e o atalho "Ver todos" convivem na tela, e um
 * /Todos/ solto casaria com os dois.
 */
const chip = (nome) => screen.getByRole("button", { name: new RegExp(`^${nome}`, "i") });

beforeEach(() => {
  vi.clearAllMocks();
  marcar.mockResolvedValue({ error: null });
});

describe("FeedbacksView, o que a tela mostra ao abrir", () => {
  it("abre na lista do que falta fazer, e diz que está filtrando", async () => {
    abrir();

    await waitFor(() => expect(cartoes()).toHaveLength(3));
    // Os três abertos, sem o resolvido.
    expect(screen.getByText("A comanda não salva a observação.")).toBeInTheDocument();
    expect(screen.queryByText("A impressora repete a via.")).not.toBeInTheDocument();
    // Filtrar escondendo coisa sem avisar é o que faz o dono achar que
    // sumiu; o caminho de volta fica ao lado da contagem.
    expect(screen.getByText(/Mostrando 3 de 4/)).toBeInTheDocument();
  });

  it("os dois números do topo são os que a pessoa veio buscar", async () => {
    abrir();

    await waitFor(() => expect(cartoes()).toHaveLength(3));
    // Média só das avaliações de cliente: (2 + 5) / 2.
    expect(screen.getByText("3,5")).toBeInTheDocument();
    expect(screen.getByText("2 avaliações")).toBeInTheDocument();
    // Três em aberto (um da equipe e dois de clientes).
    const esperando = screen.getByText("Esperando resposta").parentElement;
    expect(within(esperando).getByText("3")).toBeInTheDocument();
  });

  it("sem nenhuma avaliação, diz que ainda não avaliaram em vez de nota zero", async () => {
    abrir([FEEDBACKS[0]]);

    await waitFor(() => expect(cartoes()).toHaveLength(1));
    expect(screen.getByText("Ainda não avaliaram")).toBeInTheDocument();
  });

  it("a nota do cliente sai por extenso além das estrelas", async () => {
    abrir();

    await waitFor(() => expect(cartoes()).toHaveLength(3));
    expect(screen.getByText("Fraco")).toBeInTheDocument(); // nota 2
    expect(screen.getByText("Ótimo")).toBeInTheDocument(); // nota 5
  });

  it("o relato da equipe mostra a tela e quem escreveu", async () => {
    abrir();

    await waitFor(() => expect(cartoes()).toHaveLength(3));
    const relato = cartoes().find((c) => c.textContent.includes("não salva a observação"));
    // A tela em que a pessoa estava é o dado que mais se esquece de contar
    // e o que mais ajuda a consertar.
    expect(within(relato).getByText("Frente de Caixa")).toBeInTheDocument();
    expect(within(relato).getByText("caixa1")).toBeInTheDocument();
  });
});

describe("FeedbacksView, os filtros", () => {
  it("cada botão traz a própria contagem dentro", async () => {
    abrir();

    await waitFor(() => expect(cartoes()).toHaveLength(3));
    expect(chip("Da equipe")).toHaveTextContent("2");
    expect(chip("Dos clientes")).toHaveTextContent("2");
    expect(chip("Abertos")).toHaveTextContent("3");
    expect(chip("Resolvidos")).toHaveTextContent("1");
  });

  it("origem e situação se combinam", async () => {
    const { user } = abrir();
    await waitFor(() => expect(cartoes()).toHaveLength(3));

    await user.click(chip("Dos clientes"));

    // Clientes E abertos: os dois, sem o relato da equipe.
    expect(cartoes()).toHaveLength(2);
    expect(screen.queryByText("A comanda não salva a observação.")).not.toBeInTheDocument();
  });

  it("'Todos' traz de volta inclusive o resolvido", async () => {
    const { user } = abrir();
    await waitFor(() => expect(cartoes()).toHaveLength(3));

    await user.click(chip("Todos"));

    expect(cartoes()).toHaveLength(4);
    expect(screen.getByText("A impressora repete a via.")).toBeInTheDocument();
  });

  it("nada com o filtro diz que é o filtro, e oferece a saída", async () => {
    const { user } = abrir([FEEDBACKS[1]]); // só um, e resolvido
    await waitFor(() => expect(screen.getByText(/Nenhum feedback com esses filtros/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Ver todos/i }));

    expect(cartoes()).toHaveLength(1);
  });

  it("caixa vazia de verdade não é a mesma notícia que filtro vazio", async () => {
    abrir([]);

    await waitFor(() =>
      expect(screen.getByText("Ainda não chegou nenhum feedback")).toBeInTheDocument(),
    );
    // E diz por onde os feedbacks entram, senão o dono não sabe se está
    // quebrado ou se ninguém escreveu.
    expect(screen.getByText(/Reportar algo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver todos/i })).toBeNull();
  });
});

describe("FeedbacksView, resolver", () => {
  it("marcar como resolvido grava e o cartão muda ali mesmo", async () => {
    const { user } = abrir();
    await waitFor(() => expect(cartoes()).toHaveLength(3));

    const relato = cartoes().find((c) => c.textContent.includes("não salva a observação"));
    await user.click(within(relato).getByRole("button", { name: /Marcar como resolvido/i }));

    await waitFor(() => expect(marcar).toHaveBeenCalledWith("1", true));
    // Estava em "Abertos": resolver tira o cartão da lista, sem recarregar
    // tudo e sem fazer os outros saltarem de lugar.
    await waitFor(() => expect(cartoes()).toHaveLength(2));
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it("resolver tem volta, então ninguém precisa ter certeza antes de clicar", async () => {
    const { user } = abrir();
    await waitFor(() => expect(cartoes()).toHaveLength(3));

    await user.click(chip("Resolvidos"));
    const resolvido = cartoes()[0];
    await user.click(within(resolvido).getByRole("button", { name: /Reabrir/i }));

    await waitFor(() => expect(marcar).toHaveBeenCalledWith("2", false));
  });

  it("falha ao salvar avisa, e o cartão não mente dizendo que salvou", async () => {
    marcar.mockResolvedValue({ error: { message: "sem rede" } });
    const { user } = abrir();
    await waitFor(() => expect(cartoes()).toHaveLength(3));

    const relato = cartoes().find((c) => c.textContent.includes("não salva a observação"));
    await user.click(within(relato).getByRole("button", { name: /Marcar como resolvido/i }));

    await waitFor(() => expect(screen.getByText(/Não deu para salvar/)).toBeInTheDocument());
    expect(cartoes()).toHaveLength(3);
  });
});

describe("FeedbacksView, quando a leitura falha", () => {
  it("avisa em vez de mostrar caixa vazia como se fosse verdade", async () => {
    abrir([], { message: "timeout" });

    await waitFor(() =>
      expect(screen.getByText(/Não deu para carregar os feedbacks/)).toBeInTheDocument(),
    );
    // A frase de caixa vazia não pode aparecer junto: ela afirmaria algo
    // que não se sabe.
    expect(screen.queryByText("Ainda não chegou nenhum feedback")).toBeNull();
  });

  it("dá para tentar de novo sem sair da tela", async () => {
    const { user } = abrir([], { message: "timeout" });
    await waitFor(() => expect(screen.getByText(/Não deu para carregar/)).toBeInTheDocument());

    listar.mockResolvedValue({ data: FEEDBACKS, error: null });
    await user.click(screen.getByRole("button", { name: /Atualizar/i }));

    await waitFor(() => expect(cartoes()).toHaveLength(3));
    expect(screen.queryByText(/Não deu para carregar/)).toBeNull();
  });
});
