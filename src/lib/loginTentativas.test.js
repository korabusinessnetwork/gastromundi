// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TD008 — o cliente das RPCs de tentativas de login.
 *
 * Duas coisas precisam ser verdade aqui, e as duas são de segurança:
 *
 *   1. Quando o servidor não responde, ninguém fica preso do lado de fora.
 *      Este módulo falha ABERTO de propósito (o spec explica por quê): rede
 *      caída ou migration ainda não aplicada não pode impedir o caixa de abrir.
 *      Todo caminho de erro tem que devolver `disponivel: false`, que é o sinal
 *      para `login` voltar ao contador local.
 *
 *   2. A função que ZERA o contador não manda chave nenhuma. Se ela aceitasse
 *      um parâmetro, quem ainda não entrou poderia zerar o próprio bloqueio
 *      entre as tentativas, e o freio inteiro viraria enfeite. A identidade sai
 *      do JWT, dentro do banco. O teste trava esse contrato.
 */

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mockRpc } }));

import { consultarBloqueio, registrarFalha, registrarSucesso } from "@/lib/loginTentativas";

const CHAVE = "admin@casa_coffee.local";

beforeEach(() => {
  mockRpc.mockReset();
});

describe("consultarBloqueio", () => {
  it("traduz a resposta do banco para a forma que a tela usa", async () => {
    mockRpc.mockResolvedValue({ data: { bloqueado: false, restantes: 3, segundos: 0 }, error: null });

    const r = await consultarBloqueio(CHAVE);

    expect(mockRpc).toHaveBeenCalledWith("login_tentativas_estado", { p_chave: CHAVE });
    expect(r).toEqual({ disponivel: true, bloqueado: false, restantes: 3, segundos: 0 });
  });

  it("devolve o bloqueio com os segundos que faltam, arredondados para cima", async () => {
    mockRpc.mockResolvedValue({ data: { bloqueado: true, restantes: 0, segundos: 71.4 }, error: null });

    const r = await consultarBloqueio(CHAVE);

    expect(r.bloqueado).toBe(true);
    // Arredondar para baixo mostraria "71s" numa espera que ainda tem 71,4s:
    // a pessoa tentaria de novo antes da hora e levaria outro "bloqueado".
    expect(r.segundos).toBe(72);
  });

  it("falha ABERTO quando a RPC devolve erro", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });

    const r = await consultarBloqueio(CHAVE);

    expect(r.disponivel).toBe(false);
    expect(r.bloqueado).toBe(false);
  });

  it("falha ABERTO quando a chamada explode (rede caída)", async () => {
    mockRpc.mockRejectedValue(new Error("Failed to fetch"));

    const r = await consultarBloqueio(CHAVE);

    expect(r.disponivel).toBe(false);
    expect(r.bloqueado).toBe(false);
  });

  it("falha ABERTO quando o payload não tem a forma esperada", async () => {
    // `data: null` é o que a migration não aplicada produz num projeto onde a
    // função ainda não existe mas o PostgREST responde 200.
    mockRpc.mockResolvedValue({ data: null, error: null });

    expect(await consultarBloqueio(CHAVE)).toEqual(
      { disponivel: false, bloqueado: false, restantes: null, segundos: 0 },
    );
  });

  it("não vai ao servidor sem chave", async () => {
    const r = await consultarBloqueio("");

    expect(mockRpc).not.toHaveBeenCalled();
    expect(r.disponivel).toBe(false);
  });
});

describe("registrarFalha", () => {
  it("soma a falha e devolve o estado resultante", async () => {
    mockRpc.mockResolvedValue({ data: { bloqueado: false, restantes: 2, segundos: 0 }, error: null });

    const r = await registrarFalha(CHAVE);

    expect(mockRpc).toHaveBeenCalledWith("login_tentativas_falha", { p_chave: CHAVE });
    expect(r).toEqual({ disponivel: true, bloqueado: false, restantes: 2, segundos: 0 });
  });

  it("devolve o bloqueio quando a falha foi a quinta", async () => {
    mockRpc.mockResolvedValue({ data: { bloqueado: true, restantes: 0, segundos: 120 }, error: null });

    const r = await registrarFalha(CHAVE);

    expect(r).toEqual({ disponivel: true, bloqueado: true, restantes: 0, segundos: 120 });
  });

  it("falha ABERTO quando a RPC recusa, e não derruba o login", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "23514" } });

    await expect(registrarFalha(CHAVE)).resolves.toEqual(
      { disponivel: false, bloqueado: false, restantes: null, segundos: 0 },
    );
  });

  it("nunca devolve `restantes` negativo", async () => {
    mockRpc.mockResolvedValue({ data: { bloqueado: true, restantes: -3, segundos: 10 }, error: null });

    expect((await registrarFalha(CHAVE)).restantes).toBe(0);
  });
});

describe("registrarSucesso", () => {
  it("chama a RPC SEM parâmetro nenhum: a identidade sai do JWT", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await registrarSucesso();

    expect(mockRpc).toHaveBeenCalledWith("login_tentativas_sucesso");
    // O segundo argumento não existe de propósito. Se um dia alguém acrescentar
    // uma chave aqui, a função no banco vira alcançável por quem não entrou.
    expect(mockRpc.mock.calls[0]).toHaveLength(1);
  });

  it("engole a falha: zerar contador não é problema de quem está entrando", async () => {
    mockRpc.mockRejectedValue(new Error("Failed to fetch"));

    await expect(registrarSucesso()).resolves.toBeUndefined();
  });
});
