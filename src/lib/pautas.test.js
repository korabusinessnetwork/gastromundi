import { describe, it, expect, vi } from "vitest";

// As funções puras testadas aqui não tocam o banco, mas o módulo importa o
// client — sem VITE_SUPABASE_* no ambiente de teste, supabase.js lançaria.
vi.mock("./supabase", () => ({ supabase: {} }));

import {
  STATUS_PAUTA,
  STATUS_EM_ORDEM,
  rotuloStatus,
  statusValido,
  validarPauta,
  nomesDosEnvolvidos,
  filtrarPautas,
  contarPorStatus,
} from "./pautas";

const PESSOAS = [
  { slug: "matheus",   nome: "Matheus" },
  { slug: "guilherme", nome: "Guilherme" },
  { slug: "bonato",    nome: "Bonato" },
];

describe("statusValido / rotuloStatus", () => {
  it("os três estados da tela são os três estados válidos", () => {
    expect(STATUS_EM_ORDEM).toEqual(["pendente", "em_progresso", "finalizado"]);
    for (const s of STATUS_EM_ORDEM) expect(statusValido(s)).toBe(true);
  });

  it("qualquer outro valor é inválido", () => {
    expect(statusValido("concluido")).toBe(false);
    expect(statusValido("")).toBe(false);
    expect(statusValido(undefined)).toBe(false);
  });

  it("rótulo é o texto que vai na tela", () => {
    expect(rotuloStatus(STATUS_PAUTA.PENDENTE)).toBe("Pendente");
    expect(rotuloStatus(STATUS_PAUTA.EM_PROGRESSO)).toBe("Em progresso");
    expect(rotuloStatus(STATUS_PAUTA.FINALIZADO)).toBe("Finalizado");
  });

  it("status desconhecido não deixa a tela sem rótulo", () => {
    expect(rotuloStatus("qualquer")).toBe("Pendente");
  });
});

describe("validarPauta", () => {
  const ok = { titulo: "Fila offline do PDV", intuito: "Não perder pedido sem internet" };

  it("aceita título + intuito (contexto e envolvidos são opcionais)", () => {
    expect(validarPauta(ok)).toEqual({ valido: true, erro: null });
  });

  it("exige título", () => {
    expect(validarPauta({ ...ok, titulo: "   " })).toEqual({
      valido: false,
      erro: "Dê um nome para a pauta.",
    });
  });

  it("exige intuito — pauta sem 'para quê' é o que o sistema evita", () => {
    expect(validarPauta({ ...ok, intuito: "" })).toEqual({
      valido: false,
      erro: "Escreva para que serve esta pauta.",
    });
  });

  it("recusa textos longos demais", () => {
    expect(validarPauta({ ...ok, titulo: "a".repeat(121) }).valido).toBe(false);
    expect(validarPauta({ ...ok, intuito: "a".repeat(1001) }).valido).toBe(false);
    expect(validarPauta({ ...ok, contexto: "a".repeat(5001) }).valido).toBe(false);
  });

  it("recusa envolvidos que não são lista e status desconhecido", () => {
    expect(validarPauta({ ...ok, envolvidos: "matheus" }).valido).toBe(false);
    expect(validarPauta({ ...ok, status: "arquivado" }).valido).toBe(false);
    expect(validarPauta({ ...ok, status: STATUS_PAUTA.EM_PROGRESSO }).valido).toBe(true);
  });
});

describe("nomesDosEnvolvidos", () => {
  it("traduz slugs em nomes, na ordem da pauta", () => {
    expect(nomesDosEnvolvidos(["bonato", "matheus"], PESSOAS)).toEqual(["Bonato", "Matheus"]);
  });

  it("slug sem pessoa correspondente não some da tela", () => {
    expect(nomesDosEnvolvidos(["matheus", "antigo"], PESSOAS)).toEqual(["Matheus", "antigo"]);
  });

  it("lista vazia ou ausente devolve vazio", () => {
    expect(nomesDosEnvolvidos([], PESSOAS)).toEqual([]);
    expect(nomesDosEnvolvidos(undefined, PESSOAS)).toEqual([]);
    expect(nomesDosEnvolvidos(["matheus"], undefined)).toEqual(["matheus"]);
  });
});

const PAUTAS = [
  { id: "1", titulo: "Fila offline", intuito: "Não perder pedido", contexto: "PWA",   envolvidos: ["matheus"],             status: "pendente" },
  { id: "2", titulo: "Delivery",     intuito: "Abrir canal",       contexto: "",      envolvidos: ["guilherme", "bonato"], status: "em_progresso" },
  { id: "3", titulo: "Relatórios",   intuito: "Ver o mês",         contexto: "Excel", envolvidos: [],                      status: "finalizado" },
];

describe("filtrarPautas", () => {
  it("sem filtro, devolve tudo", () => {
    expect(filtrarPautas(PAUTAS)).toHaveLength(3);
    expect(filtrarPautas(PAUTAS, {})).toHaveLength(3);
  });

  it("filtra por status", () => {
    expect(filtrarPautas(PAUTAS, { status: "pendente" }).map((p) => p.id)).toEqual(["1"]);
  });

  it("filtra por pessoa envolvida", () => {
    expect(filtrarPautas(PAUTAS, { pessoa: "bonato" }).map((p) => p.id)).toEqual(["2"]);
    expect(filtrarPautas(PAUTAS, { pessoa: "matheus" }).map((p) => p.id)).toEqual(["1"]);
  });

  it("busca em título, intuito e contexto, ignorando caixa", () => {
    expect(filtrarPautas(PAUTAS, { busca: "OFFLINE" }).map((p) => p.id)).toEqual(["1"]);
    expect(filtrarPautas(PAUTAS, { busca: "canal" }).map((p) => p.id)).toEqual(["2"]);
    expect(filtrarPautas(PAUTAS, { busca: "excel" }).map((p) => p.id)).toEqual(["3"]);
  });

  it("combina filtros", () => {
    expect(filtrarPautas(PAUTAS, { status: "em_progresso", pessoa: "matheus" })).toEqual([]);
  });

  it("lista ausente não quebra", () => {
    expect(filtrarPautas(undefined, { status: "pendente" })).toEqual([]);
  });
});

describe("contarPorStatus", () => {
  it("conta cada estado e o total", () => {
    expect(contarPorStatus(PAUTAS)).toEqual({
      pendente: 1,
      em_progresso: 1,
      finalizado: 1,
      total: 3,
    });
  });

  it("lista vazia zera tudo", () => {
    expect(contarPorStatus([])).toEqual({ pendente: 0, em_progresso: 0, finalizado: 0, total: 0 });
    expect(contarPorStatus(null)).toEqual({ pendente: 0, em_progresso: 0, finalizado: 0, total: 0 });
  });

  it("status desconhecido entra no total mas não em nenhuma coluna", () => {
    const contagem = contarPorStatus([...PAUTAS, { id: "4", status: "arquivado" }]);
    expect(contagem.total).toBe(4);
    expect(contagem.pendente + contagem.em_progresso + contagem.finalizado).toBe(3);
  });
});
