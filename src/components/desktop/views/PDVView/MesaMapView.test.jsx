// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MesaMapView, { comandaAbertaDaMesa, statusMesa } from "./MesaMapView";

/**
 * Run 3 (mesas e comandas) — o mapa de mesas é o caminho pelo qual o caixa
 * chega na conta. Toda mesa que aparece com o status errado é ou uma conta
 * que ninguém consegue cobrar, ou uma segunda comanda aberta na mesma mesa.
 */

const comanda = (over = {}) => ({
  id: "o1", comanda: "1", mesa: "5", status: "open", items: [], total: 0, ...over,
});

describe("comandaAbertaDaMesa", () => {
  it("acha a comanda aberta da mesa mesmo sem nenhum item lançado", () => {
    // O Palm (persistirLancamento) e a sincronização offline da Ponte criam a
    // comanda com items:[] ANTES de lançar. Exigir item aqui fazia a mesa voltar
    // a "Livre" com conta aberta — e o clique abria uma SEGUNDA comanda.
    const pedido = comanda({ items: [] });
    expect(comandaAbertaDaMesa({ numero: "5" }, [pedido])).toBe(pedido);
  });

  it("acha a comanda com todos os itens cancelados", () => {
    const pedido = comanda({ items: [{ price: 10, qty: 1, cancelado: true }] });
    expect(comandaAbertaDaMesa({ numero: "5" }, [pedido])).toBe(pedido);
  });

  it("compara número como texto (mesa 5 casa com comanda de mesa '5')", () => {
    const pedido = comanda({ mesa: 5 });
    expect(comandaAbertaDaMesa({ numero: "5" }, [pedido])).toBe(pedido);
  });

  it("ignora comanda fechada", () => {
    expect(comandaAbertaDaMesa({ numero: "5" }, [comanda({ status: "closed" })])).toBe(null);
  });

  it("comanda sem mesa (balcão/delivery) não acende mesa nenhuma", () => {
    // String(null) === String(undefined) é false, mas String(null) casava com
    // mesa cujo `numero` viesse nulo — toda venda de balcão acendia essa mesa.
    expect(comandaAbertaDaMesa({ numero: null }, [comanda({ mesa: null })])).toBe(null);
    expect(comandaAbertaDaMesa({ numero: undefined }, [comanda({ mesa: undefined })])).toBe(null);
  });

  it("tolera lista ausente", () => {
    expect(comandaAbertaDaMesa({ numero: "5" }, null)).toBe(null);
    expect(comandaAbertaDaMesa({ numero: "5" }, [])).toBe(null);
  });
});

describe("statusMesa", () => {
  it("mesa com conta aberta e vazia é 'aberta', não 'livre'", () => {
    expect(statusMesa({ numero: "5" }, [comanda({ items: [] })])).toBe("aberta");
  });

  it("mesa em manutenção COM conta aberta é 'aberta' (a conta precisa ser cobrável)", () => {
    expect(
      statusMesa({ numero: "5", status_manual: "manutencao" }, [comanda()]),
    ).toBe("aberta");
  });

  it("mesa em manutenção sem conta é 'manutencao'", () => {
    expect(statusMesa({ numero: "5", status_manual: "manutencao" }, [])).toBe("manutencao");
  });

  it("reservada e livre sem conta aberta", () => {
    expect(statusMesa({ numero: "5", status_manual: "reservada" }, [])).toBe("reservada");
    expect(statusMesa({ numero: "5" }, [])).toBe("livre");
  });

  it("conta aberta vence reserva", () => {
    expect(statusMesa({ numero: "5", status_manual: "reservada" }, [comanda()])).toBe("aberta");
  });
});

describe("MesaMapView (mapa)", () => {
  let onSelectComanda, onOpenEmpty;

  beforeEach(() => {
    onSelectComanda = vi.fn();
    onOpenEmpty     = vi.fn();
  });

  const renderMapa = (mesas, abertas = []) =>
    render(
      <MesaMapView
        mesas={mesas} loading={false} abertas={abertas}
        onSelectComanda={onSelectComanda} onOpenEmpty={onOpenEmpty}
      />,
    );

  it("clicar em mesa com comanda aberta e vazia entra na comanda (não abre uma segunda)", () => {
    const pedido = comanda({ items: [] });
    renderMapa([{ numero: "5" }], [pedido]);

    fireEvent.click(screen.getByTitle(/^Mesa 5/));

    expect(onSelectComanda).toHaveBeenCalledWith(pedido);
    expect(onOpenEmpty).not.toHaveBeenCalled();
  });

  it("clicar em mesa em manutenção com conta aberta entra na comanda", () => {
    const pedido = comanda();
    renderMapa([{ numero: "5", status_manual: "manutencao" }], [pedido]);

    fireEvent.click(screen.getByTitle(/^Mesa 5/));

    expect(onSelectComanda).toHaveBeenCalledWith(pedido);
  });

  it("clicar em mesa em manutenção sem conta não abre comanda nenhuma", () => {
    renderMapa([{ numero: "5", status_manual: "manutencao" }], []);

    fireEvent.click(screen.getByTitle(/^Mesa 5/));

    expect(onSelectComanda).not.toHaveBeenCalled();
    expect(onOpenEmpty).not.toHaveBeenCalled();
  });

  it("clicar em mesa livre abre comanda nova nessa mesa", () => {
    renderMapa([{ numero: "7" }], []);

    fireEvent.click(screen.getByTitle(/^Mesa 7/));

    expect(onOpenEmpty).toHaveBeenCalledWith("7", { mesa: "7" });
    expect(onSelectComanda).not.toHaveBeenCalled();
  });

  it("o card mostra só o total dos itens ativos", () => {
    renderMapa(
      [{ numero: "5" }],
      [comanda({ items: [
        { price: 16.1, qty: 3 },
        { price: 99, qty: 1, cancelado: true },
      ] })],
    );

    expect(screen.getByText("R$ 48.30")).toBeInTheDocument();
    expect(screen.queryByText("R$ 147.30")).not.toBeInTheDocument();
  });

  it("mesa sem coordenada vai para a faixa própria, fora do mapa posicionado", () => {
    // O fallback `?? 1` jogava toda mesa sem coordenada em (1,1), empilhadas
    // uma sobre a outra: mesa com conta aberta desaparecia atrás de outra.
    renderMapa(
      [
        { numero: "1", posicao_x: 1, posicao_y: 1 },
        { numero: "2", posicao_x: 2, posicao_y: 1 },
        { numero: "9" },                              // sem coordenada
        { numero: "10", posicao_x: 3 },               // só x, sem y
      ],
      [],
    );

    expect(screen.getByText(/Sem posição no mapa/)).toBeInTheDocument();

    const faixa = document.querySelector(".mesa-map__sem-posicao-grid");
    expect(faixa.contains(screen.getByTitle(/^Mesa 9/))).toBe(true);
    expect(faixa.contains(screen.getByTitle(/^Mesa 10/))).toBe(true);
    expect(faixa.contains(screen.getByTitle(/^Mesa 1 /))).toBe(false);
    expect(faixa.contains(screen.getByTitle(/^Mesa 2 /))).toBe(false);
  });

  it("mesa da faixa sem posição continua clicável", () => {
    renderMapa([{ numero: "1", posicao_x: 1, posicao_y: 1 }, { numero: "9" }], []);

    fireEvent.click(screen.getByTitle(/^Mesa 9/));

    expect(onOpenEmpty).toHaveBeenCalledWith("9", { mesa: "9" });
  });

  it("sem nenhuma mesa sem coordenada, a faixa não aparece", () => {
    renderMapa([{ numero: "1", posicao_x: 1, posicao_y: 1 }], []);

    expect(screen.queryByText(/Sem posição no mapa/)).not.toBeInTheDocument();
  });
});
