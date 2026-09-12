// @vitest-environment jsdom
//
// O vigia dos lançamentos que chegam pelo realtime é o que faz o Palm do
// garçom imprimir COM internet (decisão do dono 2026-07-29), e não tinha um
// teste sequer. As três regras dele são todas do tipo que quebra em silêncio,
// porque o erro não aparece na tela: aparece na bancada da cozinha, em papel
// que não saiu ou que saiu duas vezes.
//
//   1. A SEMEADURA. Tudo que já está na tela quando o caixa abre nasce
//      marcado como visto. Sem isso, a primeira carga do dia cospe de novo
//      toda comanda aberta desde ontem.
//   2. O LANÇAMENTO NOVO sai, uma vez só.
//   3. O ECO do realtime (a mesma comanda voltando do banco depois da
//      gravação) NÃO sai de novo. É por isso que o lançamento é marcado
//      ANTES da impressão, que é assíncrona.
//
// Mais a falha de impressão, que antes morria num console.error.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { imprimirLancamento } = vi.hoisted(() => ({ imprimirLancamento: vi.fn() }));
// A impressão de verdade não entra neste teste (e evita arrastar o Supabase).
vi.mock("@/lib/impressao/despacho", () => ({ imprimirLancamento }));

import { useImpressaoLancamentos, rotuloDaComanda } from "./useImpressaoLancamentos";

const ONTEM = "2026-09-11T22:40:00.000Z";
const AGORA = "2026-09-12T19:30:00.000Z";

/**
 * Comanda com um lançamento só. O `id` é único em cada teste porque o registro
 * de lançamentos vistos é um por aparelho, compartilhado por este arquivo.
 */
const comanda = (id, nome, instante, extra = {}) => ({
  id,
  comanda: nome,
  items: [{ name: "X-Burguer", qty: 1, launched_at: instante }],
  ...extra,
});

/** Nomes das comandas que foram mandadas para a impressora. */
const comandasImpressas = () =>
  imprimirLancamento.mock.calls.map(([pedido]) => pedido.comanda);

const montar = (props) => renderHook(
  (p) => useImpressaoLancamentos(p),
  { initialProps: { ativo: true, loading: false, pending: [], ...props } },
);

let erroNoConsole;

beforeEach(() => {
  vi.clearAllMocks();
  imprimirLancamento.mockResolvedValue({ error: null });
  erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { erroNoConsole.mockRestore(); });

describe("useImpressaoLancamentos, a semeadura da abertura do caixa", () => {
  it("não reimprime a comanda que já estava aberta quando o sistema abriu", async () => {
    const véspera = [comanda("s-1", "3", ONTEM), comanda("s-2", "5", ONTEM)];
    const { rerender } = montar({ pending: véspera });

    // Segunda passada com a mesma lista: é o que acontece a cada re-render do
    // app, e nada disso é novidade para a cozinha.
    rerender({ ativo: true, loading: false, pending: [...véspera] });
    await Promise.resolve();
    expect(imprimirLancamento).not.toHaveBeenCalled();
  });

  it("espera as comandas carregarem para semear, e aí não imprime o que chegou na carga", async () => {
    // Sequência real da abertura: `loading` verdadeiro com a lista ainda
    // vazia, e só depois as comandas da véspera chegam do banco. Semear a
    // lista vazia faria a carga seguinte parecer um salão inteiro de pedidos
    // novos, e a bobina sairia com a noite anterior toda.
    const { rerender } = montar({ loading: true, pending: [] });
    rerender({ ativo: true, loading: true, pending: [comanda("s-3", "7", ONTEM)] });
    rerender({ ativo: true, loading: false, pending: [comanda("s-3", "7", ONTEM)] });

    await Promise.resolve();
    expect(imprimirLancamento).not.toHaveBeenCalled();
  });

  it("com o aparelho desligado como impressor, nada sai deste computador", async () => {
    // Dois caixas abertos recebem o mesmo evento do realtime: se os dois
    // imprimissem, cada pedido sairia em duas bobinas.
    const { rerender } = montar({ ativo: false, pending: [] });
    rerender({ ativo: false, loading: false, pending: [comanda("s-4", "9", AGORA)] });

    await Promise.resolve();
    expect(imprimirLancamento).not.toHaveBeenCalled();
  });
});

describe("useImpressaoLancamentos, o lançamento novo e o eco do realtime", () => {
  it("o pedido que chega pelo realtime sai na produção, uma vez só", async () => {
    const { rerender } = montar({ pending: [] });
    rerender({ ativo: true, loading: false, pending: [comanda("n-1", "12", AGORA)] });

    await waitFor(() => expect(imprimirLancamento).toHaveBeenCalledTimes(1));
    expect(comandasImpressas()).toEqual(["12"]);
    // Só os itens do lançamento, que é o que a cozinha ainda não recebeu.
    expect(imprimirLancamento.mock.calls[0][0].items).toHaveLength(1);
  });

  it("o eco da gravação não gera um segundo papel da mesma comanda", async () => {
    const pedido = comanda("n-2", "14", AGORA);
    const { rerender } = montar({ pending: [] });
    rerender({ ativo: true, loading: false, pending: [pedido] });

    // O realtime devolve a comanda gravada, com outra identidade de objeto e
    // campos do banco por cima. É o mesmo lançamento, e a cozinha não pode
    // receber duas vias do mesmo pedido.
    rerender({
      ativo: true,
      loading: false,
      pending: [{ ...pedido, updated_at: AGORA, items: [{ ...pedido.items[0] }] }],
    });
    rerender({ ativo: true, loading: false, pending: [{ ...pedido }] });

    await waitFor(() => expect(imprimirLancamento).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(imprimirLancamento).toHaveBeenCalledTimes(1);
  });

  it("o segundo lançamento da MESMA comanda sai, porque é outro pedido do cliente", async () => {
    const primeiro = comanda("n-3", "16", AGORA);
    const { rerender } = montar({ pending: [] });
    rerender({ ativo: true, loading: false, pending: [primeiro] });
    await waitFor(() => expect(imprimirLancamento).toHaveBeenCalledTimes(1));

    const depois = "2026-09-12T20:05:00.000Z";
    rerender({
      ativo: true,
      loading: false,
      pending: [{
        ...primeiro,
        items: [...primeiro.items, { name: "Refrigerante", qty: 2, launched_at: depois }],
      }],
    });

    await waitFor(() => expect(imprimirLancamento).toHaveBeenCalledTimes(2));
    // A segunda via leva só a rodada nova, nunca o que já foi para a bancada.
    expect(imprimirLancamento.mock.calls[1][0].items).toEqual([
      { name: "Refrigerante", qty: 2, launched_at: depois },
    ]);
  });
});

describe("useImpressaoLancamentos, a falha que antes ninguém via", () => {
  it("papel que não saiu é devolvido para a tela com o nome da comanda", async () => {
    imprimirLancamento.mockResolvedValue({
      error: { message: "Não foi possível abrir a janela de impressão. Verifique se o navegador bloqueou o pop-up." },
    });
    const { result, rerender } = montar({ pending: [] });
    rerender({ ativo: true, loading: false, pending: [comanda("f-1", "21", AGORA)] });

    await waitFor(() => expect(result.current.falhas).toHaveLength(1));
    expect(result.current.falhas[0].rotulo).toBe("Comanda 21");

    // Botão "Já reimprimi": alguém resolveu pela Cozinha, o alarme já
    // trabalhou.
    act(() => { result.current.dispensarFalhas(); });
    expect(result.current.falhas).toEqual([]);
  });

  it("exceção no meio da impressão também vira aviso, sem parar a fila", async () => {
    imprimirLancamento
      .mockRejectedValueOnce(new Error("impressora desapareceu"))
      .mockResolvedValueOnce({ error: null });
    const { result, rerender } = montar({ pending: [] });
    rerender({
      ativo: true,
      loading: false,
      pending: [comanda("f-2", "22", AGORA), comanda("f-3", "23", "2026-09-12T19:31:00.000Z")],
    });

    await waitFor(() => expect(result.current.falhas).toHaveLength(1));
    expect(result.current.falhas[0].rotulo).toBe("Comanda 22");
    // A comanda seguinte não pode ficar sem papel por causa da anterior.
    expect(comandasImpressas()).toEqual(["22", "23"]);
  });

  it("o lançamento que falhou NÃO é tentado de novo sozinho", async () => {
    // Destravar pareceria generoso e é o pior dos dois: o `pending` muda
    // várias vezes por minuto e cada mudança tentaria outra vez. Com pop-up
    // bloqueado nada mudaria, e com a impressora de volta a via sairia
    // repetida, o que na bancada é pedido feito duas vezes. Quem destrava é
    // uma pessoa, com um clique, na reimpressão da Cozinha.
    imprimirLancamento.mockResolvedValue({ error: { message: "sem papel" } });
    const pedido = comanda("f-4", "24", AGORA);
    const { result, rerender } = montar({ pending: [] });
    rerender({ ativo: true, loading: false, pending: [pedido] });
    await waitFor(() => expect(result.current.falhas).toHaveLength(1));

    rerender({ ativo: true, loading: false, pending: [{ ...pedido }] });
    rerender({ ativo: true, loading: false, pending: [{ ...pedido, updated_at: AGORA }] });
    await Promise.resolve();

    expect(imprimirLancamento).toHaveBeenCalledTimes(1);
    // E o aviso continua um só, não vira uma pilha da mesma comanda.
    expect(result.current.falhas).toHaveLength(1);
  });
});

describe("rotuloDaComanda, o nome que o aviso mostra", () => {
  it("comanda numerada ganha a palavra Comanda, como no PDV e na Cozinha", () => {
    expect(rotuloDaComanda({ comanda: "12" })).toBe("Comanda 12");
  });

  it("nome digitado pelo garçom aparece como ele escreveu", () => {
    expect(rotuloDaComanda({ comanda: "Balcão" })).toBe("Balcão");
  });

  it("sem nome, cai na mesa, e sem mesa ainda diz algo legível", () => {
    expect(rotuloDaComanda({ comanda: "", mesa: "4" })).toBe("Mesa 4");
    // Nunca o marcador de célula vazia: numa frase ele não diria nada.
    expect(rotuloDaComanda({})).toBe("Comanda sem nome");
  });
});
