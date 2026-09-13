// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * A faixa que devolve ao operador a hora do recarregamento.
 *
 * O service worker estava em `autoUpdate`, e nesse modo o plugin recarrega a
 * aba sozinho quando a versão nova ativa. Como a produção sobe a cada push, um
 * deploy no meio do expediente derrubava a tela do caixa sem avisar, levando o
 * carrinho montado e ainda não lançado.
 */

import {
  anunciarNovaVersao,
  esquecerNovaVersao,
} from "@/lib/novaVersao";
import AvisoNovaVersao from "./AvisoNovaVersao";

beforeEach(() => esquecerNovaVersao());
afterEach(() => vi.restoreAllMocks());

const faixa = () => screen.queryByRole("status");
const botao = () => screen.getByRole("button", { name: /atualizar/i });

describe("AvisoNovaVersao", () => {
  it("não aparece enquanto não há versão nova", () => {
    render(<AvisoNovaVersao />);

    expect(faixa()).toBeNull();
  });

  it("aparece quando o service worker anuncia a versão nova", async () => {
    render(<AvisoNovaVersao />);

    await act(async () => { anunciarNovaVersao(vi.fn()); });

    expect(faixa()).toHaveTextContent(/versão nova disponível/i);
    expect(botao()).toBeEnabled();
  });

  it("já aparece montada quando o anúncio veio antes do render", () => {
    anunciarNovaVersao(vi.fn());

    render(<AvisoNovaVersao />);

    expect(faixa()).toHaveTextContent(/versão nova disponível/i);
  });

  it("o botão troca a versão pedindo o recarregamento", async () => {
    const trocar = vi.fn(() => Promise.resolve());
    anunciarNovaVersao(trocar);
    render(<AvisoNovaVersao />);

    await userEvent.click(botao());

    expect(trocar).toHaveBeenCalledWith(true);
  });

  it("falha ao trocar avisa e devolve o botão, em vez de travar", async () => {
    anunciarNovaVersao(() => Promise.reject(new Error("rede caiu")));
    render(<AvisoNovaVersao />);

    await userEvent.click(botao());

    expect(faixa()).toHaveTextContent(/não deu para atualizar agora/i);
    expect(botao()).toBeEnabled();
  });

  it("nada é bloqueado: a faixa é aviso, não janela modal", async () => {
    anunciarNovaVersao(vi.fn());
    render(<AvisoNovaVersao />);

    // Sem `role="dialog"` e sem `aria-modal`: quem está no meio de uma venda
    // segue operando com a faixa na tela.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(faixa().getAttribute("aria-modal")).toBeNull();
  });
});
