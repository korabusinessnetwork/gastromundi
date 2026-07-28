import { describe, it, expect, vi } from "vitest";
import {
  CHAVE_ULTIMA_RECUPERACAO,
  JANELA_ANTI_LOOP_MS,
  instalarRecuperacaoDeploy,
  podeRecarregar,
} from "./recuperacaoDeploy";

function armazenamentoFake(inicial = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: vi.fn((chave) => (chave in dados ? dados[chave] : null)),
    setItem: vi.fn((chave, valor) => {
      dados[chave] = valor;
    }),
  };
}

function janelaFake() {
  const ouvintes = {};
  return {
    ouvintes,
    location: { reload: vi.fn() },
    addEventListener: vi.fn((evento, fn) => {
      ouvintes[evento] = fn;
    }),
  };
}

describe("podeRecarregar", () => {
  it("libera quando nunca houve tentativa", () => {
    expect(podeRecarregar(null, 1_000)).toBe(true);
    expect(podeRecarregar("", 1_000)).toBe(true);
    expect(podeRecarregar("lixo", 1_000)).toBe(true);
  });

  it("segura a segunda tentativa dentro da janela", () => {
    const agora = 1_000_000;
    expect(podeRecarregar(String(agora - 5_000), agora)).toBe(false);
  });

  it("libera de novo depois da janela", () => {
    const agora = 1_000_000;
    expect(podeRecarregar(String(agora - JANELA_ANTI_LOOP_MS - 1), agora)).toBe(true);
  });

  it("com carimbo no futuro (relógio ajustado) não recarrega", () => {
    expect(podeRecarregar("2000", 1_000)).toBe(false);
  });
});

describe("instalarRecuperacaoDeploy", () => {
  it("recarrega uma vez quando o pedaço do app não existe mais", () => {
    const janela = janelaFake();
    const armazenamento = armazenamentoFake();
    const agora = vi.fn(() => 500_000);

    instalarRecuperacaoDeploy({ janela, armazenamento, agora });
    const evento = { preventDefault: vi.fn() };
    janela.ouvintes["vite:preloadError"](evento);

    expect(evento.preventDefault).toHaveBeenCalled();
    expect(janela.location.reload).toHaveBeenCalledTimes(1);
    expect(armazenamento.setItem).toHaveBeenCalledWith(CHAVE_ULTIMA_RECUPERACAO, "500000");
  });

  it("não entra em loop: segunda falha seguida não recarrega de novo", () => {
    const janela = janelaFake();
    const armazenamento = armazenamentoFake({ [CHAVE_ULTIMA_RECUPERACAO]: "499000" });

    const recuperar = instalarRecuperacaoDeploy({
      janela,
      armazenamento,
      agora: () => 500_000,
    });

    expect(recuperar()).toBe(false);
    expect(janela.location.reload).not.toHaveBeenCalled();
  });

  it("sessionStorage indisponível não derruba o app — recarrega assim mesmo", () => {
    const janela = janelaFake();
    const armazenamento = {
      getItem: vi.fn(() => {
        throw new Error("bloqueado");
      }),
      setItem: vi.fn(() => {
        throw new Error("bloqueado");
      }),
    };

    const recuperar = instalarRecuperacaoDeploy({ janela, armazenamento, agora: () => 1 });

    expect(recuperar()).toBe(true);
    expect(janela.location.reload).toHaveBeenCalledTimes(1);
  });
});
