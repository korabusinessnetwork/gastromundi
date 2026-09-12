import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR, ultimaDefinicaoDe } from "@/test/migracoes";
import { instrucaoGrupo } from "./gruposEscolha";
import { grupoSatisfeito, rotuloRegraGrupo } from "./delivery";

/**
 * Guard de 20261004_escolhas_sem_limite.sql.
 *
 * "Escolha quantos sabores de pizza quiser" não tinha como ser cadastrado:
 * os dois editores travavam o máximo em 1 no piso, e do lado do PDV o
 * banco ainda carregava `CHECK (maximo >= 1)`.
 *
 * O caso perigoso é o do delivery, porque lá a regra já estava METADE
 * feita: a vitrine lia 0 como sem limite (`grupoSatisfeito`) e o servidor
 * não. Um grupo com máximo 0 aceitaria tudo na tela e o pedido morreria no
 * envio com "No máximo 0 opção(ões)" — regra na tela e não no servidor.
 * Por isso o que se prova aqui é o SERVIDOR concordando com o JS.
 */
const MIGRACAO = "20261004_escolhas_sem_limite.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

describe("o banco do PDV aceita máximo 0", () => {
  it("o CHECK que exigia maximo >= 1 sai de cena", () => {
    // Derrubado pelo catálogo, não por nome adivinhado: o CHECK inline
    // nasceu sem nome escolhido e o gerado varia com a ordem de criação.
    expect(sql).toContain("FROM pg_constraint");
    expect(sql).toMatch(/DROP CONSTRAINT %I/);
    expect(sql).toContain("CHECK (maximo >= 0)");
    expect(sql).not.toMatch(/ADD CONSTRAINT[\s\S]{0,80}CHECK \(maximo >= 1\)/);
  });

  it("o teto abaixo do piso continua barrado — só o 0 é exceção", () => {
    // Sem o `maximo = 0 OR`, um grupo "ao menos 2, quantas quiser" seria
    // recusado pelo banco; sem o `maximo >= minimo`, "de 2 a 1" passaria e
    // travaria o pedido para sempre.
    expect(sql).toContain("CHECK (maximo = 0 OR maximo >= minimo)");
  });
});

describe("o servidor do delivery deixa de recusar o grupo sem limite", () => {
  const corpo = ultimaDefinicaoDe("criar_pedido_delivery");

  it("a última definição da RPC é a desta migração", () => {
    expect(corpo).toContain("v_grp.max_escolhas > 0");
  });

  it("o teto só é cobrado quando existe teto", () => {
    // A linha inteira, para que trocar a ordem das condições (e voltar a
    // recusar tudo quando o máximo é 0) apareça aqui.
    expect(corpo).toMatch(
      /IF v_grp\.max_escolhas IS NOT NULL AND v_grp\.max_escolhas > 0\s*\n\s*AND v_grp_qtd > v_grp\.max_escolhas THEN/,
    );
  });

  it("o mínimo continua sendo cobrado — sem limite não é sem regra", () => {
    expect(corpo).toContain("v_grp_qtd < COALESCE(v_grp.min_escolhas, 0)");
  });

  it("as guardas conquistadas antes sobrevivem à cópia", () => {
    // Migração é histórico imutável e a ÚLTIMA definição vence: uma cópia
    // que esqueça uma guarda a apaga do banco em silêncio.
    for (const guarda of [
      "launched_at",
      "telefone_br_valido",
      "v_retirada",
      "dispositivo_id",
    ]) {
      expect(corpo).toContain(guarda);
    }
  });
});

describe("servidor e navegador cobram a MESMA regra", () => {
  // O servidor recusa quando `max > 0 AND qtd > max`. É exatamente o que
  // grupoSatisfeito faz do lado do cliente — este teste é o que impede um
  // dos dois de mudar sozinho.
  const servidorAceita = (max, qtd) => !(max !== null && max > 0 && qtd > max);

  it.each([
    [0, 0], [0, 1], [0, 7], [0, 99],
    [1, 0], [1, 1], [1, 2],
    [3, 3], [3, 4],
  ])("máximo %i com %i escolhas: os dois lados decidem igual", (max, qtd) => {
    expect(grupoSatisfeito({ min: 0, max }, qtd)).toBe(servidorAceita(max, qtd));
  });

  it("NULL no banco (grupo antigo) também é sem limite dos dois lados", () => {
    expect(servidorAceita(null, 50)).toBe(true);
    expect(grupoSatisfeito({ min: 0, max: null }, 50)).toBe(true);
  });
});

describe("os dois lados do produto falam a mesma língua", () => {
  // PDV (grupos_escolha) e delivery (grupos_complemento) são tabelas
  // diferentes com telas diferentes; o que o dono lê não pode divergir.
  it("máximo 0 nunca vira 'até 0' nem 'escolha 0' em nenhuma das telas", () => {
    expect(instrucaoGrupo(0, 0)).toBe("Opcional — escolha quantas quiser");
    expect(instrucaoGrupo(2, 0)).toBe("Escolha ao menos 2");
    expect(rotuloRegraGrupo({ min: 0, max: 0 })).toBe("Opcional");
    expect(rotuloRegraGrupo({ min: 2, max: 0, itens: [{}, {}, {}] })).toBe("Escolha ao menos 2");
  });
});
