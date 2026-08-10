// @vitest-environment jsdom
//
// Run 6, leva 9 — DL27: o número do pedido é a única cópia que o cliente tem.
//
// A tela de sucesso fechava no toque do fundo, como todos os outros modais da
// vitrine. Só que nos outros o dado sobrevive ao fechamento (a sacola continua
// lá); aqui não sobra NADA: não existe página de acompanhamento, comprovante,
// e-mail nem histórico, e a sacola foi apagada no aceite. `fecharConfirmacao`
// zera `resultado`, então o número some do cliente para sempre — e o fundo é
// justo onde o polegar cai num celular.
//
// Este arquivo não existia: Confirmacao.jsx era um dos dois arquivos da
// vitrine pública sem teste nenhum.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// formatarPreco vem de @/lib/delivery, que importa o client (exige VITE_*).
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import Confirmacao from "./Confirmacao";

const RESULTADO = { ok: true, numero: 42, status: "recebido", total: 87.5 };

let fechar;

function montar(props = {}) {
  const r = render(
    <Confirmacao
      resultado={RESULTADO}
      tempoPreparo={35}
      onFechar={fechar}
      {...props}
    />
  );
  return r.container;
}

const fundo = (container) => container.querySelector(".modal-fundo");

beforeEach(() => {
  fechar = vi.fn();
});

describe("Confirmacao — o número do pedido não some por um toque errado", () => {
  it("tocar no fundo NÃO fecha a tela de sucesso", async () => {
    const user = userEvent.setup();
    const container = montar();

    await user.click(fundo(container));

    expect(fechar).not.toHaveBeenCalled();
  });

  it("depois do toque no fundo o número continua na tela", async () => {
    const user = userEvent.setup();
    const container = montar();

    await user.click(fundo(container));

    // É este o prejuízo real: sem o número, o cliente não tem como falar do
    // pedido dele com o estabelecimento.
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/nº do pedido/i)).toBeInTheDocument();
  });

  it("o fundo não carrega handler de clique nenhum", () => {
    const container = montar();
    // Prova estrutural: mesmo que o React mudasse a forma de propagar, o
    // elemento de fundo não tem para onde chamar onFechar.
    expect(fundo(container).onclick).toBeNull();
  });

  it("tocar dentro do cartão também não fecha", async () => {
    const user = userEvent.setup();
    const container = montar();

    await user.click(container.querySelector(".modal-painel"));
    await user.click(screen.getByText(/pedido enviado/i));

    expect(fechar).not.toHaveBeenCalled();
  });
});

describe("Confirmacao — a saída existe e é a mais visível da tela", () => {
  it("o botão 'Voltar ao cardápio' fecha", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: /voltar ao cardápio/i }));

    expect(fechar).toHaveBeenCalledTimes(1);
  });

  it("há exatamente um botão na tela — não há como errar qual é a saída", () => {
    montar();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("Confirmacao — o que a tela informa", () => {
  it("mostra o número, o total e o tempo de preparo", () => {
    montar();

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("R$ 87,50")).toBeInTheDocument();
    expect(screen.getByText(/preparo em ~35 min/i)).toBeInTheDocument();
  });

  it("sem tempo de preparo a frase não fica pela metade", () => {
    montar({ tempoPreparo: null });

    expect(screen.queryByText(/preparo em/i)).not.toBeInTheDocument();
    expect(screen.getByText(/já recebeu seu pedido/i)).toBeInTheDocument();
  });

  it("sem total a linha de preço nem aparece (não mostra R$ 0,00)", () => {
    montar({ resultado: { ok: true, numero: 7 } });

    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("total zero (pedido cortesia) ainda é mostrado", () => {
    montar({ resultado: { ok: true, numero: 7, total: 0 } });

    expect(screen.getByText("R$ 0,00")).toBeInTheDocument();
  });
});
