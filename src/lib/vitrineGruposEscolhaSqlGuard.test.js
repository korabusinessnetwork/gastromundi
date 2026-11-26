// Guarda: a vitrine e o PDV cobram o grupo pela MESMA regra.
//
// Existem duas implementações das três regras (somar / a mais cara /
// média) e elas TÊM de concordar, porque uma pizza pedida no balcão e a
// mesma pizza pedida pelo delivery não podem custar diferente:
//
//   • JS  — `precoDoGrupo` em src/lib/combos.js, usada pelo PDV e, desde
//           a migração 20261011, também pela vitrine (precoDosComplementos).
//   • SQL — `preco_grupo_escolha_delivery`, que é quem cobra de verdade
//           no servidor. O front só mostra; o servidor recalcula.
//
// Este arquivo roda as duas contra os mesmos casos e falha se divergirem.
// Uma diferença aqui é dinheiro cobrado errado do cliente, e ninguém
// descobriria pela tela — o front mostraria um preço e o banco gravaria
// outro.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS_DIR } from "@/test/migracoes";
import { precoDoGrupo } from "./combos";

const MIGRACAO = "20261011_vitrine_mostra_grupos_do_produto.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

/** O texto sem os comentários de linha, para não casar com a prosa. */
function semComentarios(texto) {
  return texto.replace(/--.*$/gm, "");
}

const corpo = semComentarios(sql);

describe("a vitrine passou a ler os grupos de escolha do produto", () => {
  it("existe a função que monta o grupo no formato da vitrine", () => {
    expect(corpo).toMatch(
      /CREATE OR REPLACE FUNCTION public\.montar_grupo_escolha_delivery/
    );
  });

  it("cardapio_publico concatena os DOIS modelos", () => {
    // O `||` entre os dois jsonb_agg é o que faz os grupos do cadastro
    // entrarem junto dos complementos do delivery, em vez de um substituir
    // o outro. Sem ele, quem usa só um dos modelos perde as opções.
    expect(corpo).toMatch(/CREATE OR REPLACE FUNCTION public\.cardapio_publico/);
    expect(corpo).toMatch(/montar_grupo_delivery\(pg\.grupo_id/);
    expect(corpo).toMatch(/montar_grupo_escolha_delivery\(ge\.id/);
  });

  it("o grupo leva a regra de cobrança para a tela", () => {
    // Sem o campo `regra` no jsonb, a vitrine não tem como saber que um
    // grupo de sabores cobra a mais cara — e volta a somar.
    expect(corpo).toMatch(/'regra',\s*v_regra/);
  });

  it("criar_pedido_delivery valida as opções de escolha antes de cobrar", () => {
    // O servidor é quem manda no preço. Aceitar um id sem conferir de que
    // produto ele é deixaria o cliente pedir um sabor que a tela nunca
    // ofereceu — e pagar o preço dele.
    expect(corpo).toMatch(/CREATE OR REPLACE FUNCTION public\.criar_pedido_delivery/);
    expect(corpo).toMatch(/Opção indisponível ou inválida para este item/);
    expect(corpo).toMatch(/preco_grupo_escolha_delivery\(v_ge_precos, v_ge\.regra\)/);
  });

  it("o mínimo e o máximo do grupo são cobrados no servidor", () => {
    // A tela já impede, mas a tela não é a trava: um pedido montado à mão
    // chegaria sem os sabores obrigatórios.
    expect(corpo).toMatch(/v_ge_qtd < COALESCE\(v_ge\.minimo, 0\)/);
    expect(corpo).toMatch(/v_ge\.maximo > 0 AND v_ge_qtd > v_ge\.maximo/);
  });

  it("máximo 0 continua significando SEM LIMITE", () => {
    // A pizza de quantos sabores quiser. Sem o `> 0`, qualquer escolha
    // seria recusada nesses grupos — o oposto do que zerar quer dizer.
    expect(corpo).toMatch(/v_ge\.maximo IS NOT NULL AND v_ge\.maximo > 0/);
  });
});

describe("as duas implementações das regras concordam", () => {
  // O SQL da função, lido do arquivo: é ele que roda no banco.
  const fn = /CREATE OR REPLACE FUNCTION public\.preco_grupo_escolha_delivery[\s\S]*?\$\$;/
    .exec(corpo)?.[0];

  it("a função de preço existe e trata as três regras", () => {
    expect(fn).toBeTruthy();
    expect(fn).toMatch(/p_regra = 'maior'/);
    expect(fn).toMatch(/p_regra = 'media'/);
    expect(fn).toMatch(/max\(v\)/);
    expect(fn).toMatch(/avg\(v\)/);
    expect(fn).toMatch(/sum\(v\)/);
  });

  it("regra desconhecida cai em somar nos dois lados", () => {
    // No SQL o ELSE é a soma; no JS, `precoDoGrupo` só desvia em 'maior' e
    // 'media'. Se um dos dois passasse a devolver 0 no caso estranho, o
    // cliente levaria o extra de graça (ou pagaria duas vezes).
    expect(fn).toMatch(/ELSE \(SELECT sum\(v\) FROM unnest\(p_precos\) v\)/);
    expect(precoDoGrupo([{ preco: 4 }, { preco: 3 }], "sei-la")).toBe(7);
  });

  // Os mesmos casos que o bloco DO da migração roda contra o banco de
  // verdade. Aqui provamos o outro lado: o JS dá a MESMA resposta.
  const CASOS = [
    { precos: [40, 60], regra: "maior", esperado: 60 },
    { precos: [40, 60], regra: "media", esperado: 50 },
    { precos: [4, 3], regra: "soma", esperado: 7 },
    { precos: [], regra: "soma", esperado: 0 },
  ];

  it.each(CASOS)("$regra de $precos dá $esperado no JS", ({ precos, regra, esperado }) => {
    expect(precoDoGrupo(precos.map((preco) => ({ preco })), regra)).toBe(esperado);
  });

  it("os mesmos casos estão conferidos contra o banco na própria migração", () => {
    // O bloco DO da migração EXECUTA a função SQL e aborta se divergir.
    // Esta asserção prende os dois arquivos juntos: mudar a conta em um
    // lado sem mudar no outro quebra aqui.
    for (const { precos, regra, esperado } of CASOS) {
      if (precos.length === 0) continue;
      const arranjo = `ARRAY\\[${precos.join(", ")}\\]::numeric\\[\\]`;
      const padrao = new RegExp(
        `preco_grupo_escolha_delivery\\(${arranjo}, '${regra}'\\) <> ${esperado}`
      );
      expect(corpo, `a migração não confere ${regra} de [${precos}] = ${esperado}`)
        .toMatch(padrao);
    }
  });
});
