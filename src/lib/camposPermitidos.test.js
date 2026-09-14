import { describe, it, expect } from "vitest";
import {
  separarCampos,
  COLUNAS_ESCRITA_USERS,
  COLUNAS_ESCRITA_PENDING,
} from "./camposPermitidos";

describe("separarCampos", () => {
  it("deixa passar o que está na lista", () => {
    const { campos, ignorados } = separarCampos({ name: "Ana", role: "caixa" }, ["name", "role"]);
    expect(campos).toEqual({ name: "Ana", role: "caixa" });
    expect(ignorados).toEqual([]);
  });

  it("separa o que não está, sem jogar fora em silêncio", () => {
    const { campos, ignorados } = separarCampos({ name: "Ana", tenant_id: "outro" }, ["name"]);
    expect(campos).toEqual({ name: "Ana" });
    expect(ignorados).toEqual(["tenant_id"]);
  });

  it("preserva valor falsy, que é dado e não ausência", () => {
    // `active: false` e `cliente_id: null` são escritas legítimas. Um
    // filtro que usasse truthiness comeria as duas.
    const { campos } = separarCampos({ active: false, cliente_id: null, total: 0 }, [
      "active",
      "cliente_id",
      "total",
    ]);
    expect(campos).toEqual({ active: false, cliente_id: null, total: 0 });
  });

  it("não inventa chave que o objeto não tem", () => {
    const { campos } = separarCampos({ name: "Ana" }, ["name", "role", "active"]);
    expect(Object.keys(campos)).toEqual(["name"]);
  });

  it("aguenta entrada que não é objeto", () => {
    for (const entrada of [null, undefined, "texto", 7, [1, 2]]) {
      expect(separarCampos(entrada, ["name"])).toEqual({ campos: {}, ignorados: [] });
    }
  });

  it("lista de permitidos ausente recusa tudo", () => {
    const { campos, ignorados } = separarCampos({ name: "Ana" }, undefined);
    expect(campos).toEqual({});
    expect(ignorados).toEqual(["name"]);
  });

  it("ignora chave herdada do protótipo, que nem chega ao banco", () => {
    const base = { role: "admin" };
    const objeto = Object.create(base);
    objeto.name = "Ana";
    const { campos, ignorados } = separarCampos(objeto, ["name", "role"]);
    expect(campos).toEqual({ name: "Ana" });
    expect(ignorados).toEqual([]);
  });
});

describe("as listas fecham o que interessa", () => {
  it("users não deixa a tela gravar id nem tenant_id", () => {
    // `id` é do banco e `tenant_id` é da RLS mais o DEFAULT da coluna.
    // Se um dia alguém precisar mexer em tenant_id, é caso de Edge
    // Function com service_role, nunca do client do app.
    expect(COLUNAS_ESCRITA_USERS).not.toContain("id");
    expect(COLUNAS_ESCRITA_USERS).not.toContain("tenant_id");
    const { ignorados } = separarCampos(
      { name: "Ana", id: 99, tenant_id: "de-outro-estabelecimento" },
      COLUNAS_ESCRITA_USERS,
    );
    expect(ignorados.sort()).toEqual(["id", "tenant_id"]);
  });

  it("users deixa passar o que a tela de funcionários realmente manda", () => {
    const doFormulario = { name: "Ana", username: "ana", role: "caixa", permissions: null, active: true };
    const { campos, ignorados } = separarCampos(doFormulario, COLUNAS_ESCRITA_USERS);
    expect(campos).toEqual(doFormulario);
    expect(ignorados).toEqual([]);
  });

  it("pending não deixa gravar tenant_id nem a trava de edição", () => {
    // `editando_por` e companhia são gravadas pelo UPDATE condicional da
    // trava (Leva 14), que é outro caminho. Passar por `updatePending`
    // roubaria a trava de quem está com a comanda aberta.
    const { ignorados } = separarCampos(
      { items: [], tenant_id: "outro", editando_por: "alguem", id: "x" },
      COLUNAS_ESCRITA_PENDING,
    );
    expect(ignorados.sort()).toEqual(["editando_por", "id", "tenant_id"]);
  });

  it("pending deixa passar o que o PDV e o Palm mandam hoje", () => {
    const casos = [
      { items: [{ name: "X" }], total: 10 },
      { mesa: "3", apelido: "Ana" },
      { cliente_id: "uuid", cliente_nome: "Ana" },
    ];
    for (const caso of casos) {
      const { campos, ignorados } = separarCampos(caso, COLUNAS_ESCRITA_PENDING);
      expect(campos).toEqual(caso);
      expect(ignorados).toEqual([]);
    }
  });
});
