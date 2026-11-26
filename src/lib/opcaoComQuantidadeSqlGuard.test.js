// Guarda: a opção do delivery tem quantidade, e os dois lados contam igual.
//
// A vitrine passou a pedir a MESMA opção mais de uma vez ("2 de filezinho
// e 1 de coxinha da asa"), e com isso duas coisas deixaram de poder
// divergir entre o JS e o SQL:
//
//   • QUANTAS — o mínimo e o máximo do grupo contam PORÇÕES, não opções
//     distintas. Se o servidor voltasse a contar opções, a tela liberaria
//     um pedido que o banco recusa, e o cliente levaria um erro seco no
//     último clique.
//   • QUANTO — repetir uma opção multiplica em 'soma', pondera em 'media'
//     e NÃO muda nada em 'maior' (duas fatias de calabresa continuam
//     sendo uma pizza). Uma diferença aqui é dinheiro cobrado errado, e
//     ninguém descobriria pela tela: o front mostra um preço e o banco
//     grava outro.
//
// O SQL carrega a quantidade repetindo o preço no array que
// `preco_grupo_escolha_delivery` recebe. Este arquivo prova que o JS
// (`precoDoGrupo`, com `qtd`) dá a MESMA resposta que o array repetido, e
// que a migração de fato confere isso contra o banco.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS_DIR } from "@/test/migracoes";
import { precoDoGrupo } from "./combos";

const MIGRACAO = "20261013_opcao_com_quantidade.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

/** O texto sem os comentários de linha, para não casar com a prosa. */
function semComentarios(texto) {
  return texto.replace(/--.*$/gm, "");
}

const corpo = semComentarios(sql);

describe("o servidor aceita a quantidade que a tela agora pede", () => {
  it("existe a função que lê quantas porções a opção tem", () => {
    expect(corpo).toMatch(/CREATE OR REPLACE FUNCTION public\.qtd_da_opcao/);
  });

  it("opção fora do mapa vale 1, que é o pedido de sempre", () => {
    // Sem esse COALESCE, a lista de ids soltos (o formato de antes, e o
    // que um navegador com o app em cache continua mandando) passaria a
    // valer zero porção e o pedido sairia sem os complementos.
    expect(corpo).toMatch(/GREATEST\(1, COALESCE\(NULLIF\(p_opcoes ->> p_id, ''\)::int, 1\)\)/);
  });

  it("as duas formas do payload são aceitas: id solto e { id, qtd }", () => {
    expect(corpo).toMatch(/jsonb_typeof\(e\) = 'object'/);
    expect(corpo).toMatch(/e #>> '\{\}'/);
  });

  it("id repetido soma em vez de ser descartado", () => {
    // Era o DISTINCT do array que fazia a segunda porção sumir sem
    // ninguém notar. Agora as entradas são agrupadas e as quantidades
    // somadas.
    expect(corpo).toMatch(/jsonb_object_agg\(t\.id, t\.qtd\)/);
    expect(corpo).toMatch(/GROUP BY 1/);
  });

  it("o mínimo e o máximo do grupo de complemento contam porções", () => {
    // `count(*)` contava opções distintas: duas de bacon valiam 1.
    expect(corpo).toMatch(
      /COALESCE\(sum\(public\.qtd_da_opcao\(v_opcoes, c\.id::text\)\), 0\) INTO v_grp_qtd/
    );
    expect(corpo).not.toMatch(/count\(\*\) INTO v_grp_qtd/);
  });

  it("o preço do complemento é multiplicado pela quantidade", () => {
    expect(corpo).toMatch(/sum\(c\.preco \* public\.qtd_da_opcao\(v_opcoes, c\.id::text\)\)/);
  });

  it("o nome sai com a quantidade na frente, que é o que a cozinha lê", () => {
    // "Bacon" numa comanda de dois bacons é o item que sai montado errado
    // e volta.
    expect(corpo).toMatch(/\|\| 'x ' \|\| c\.nome/);
    expect(corpo).toMatch(/\|\| 'x ' \|\| e\.nome/);
  });

  it("o array de preços do grupo de escolha entra repetido pela quantidade", () => {
    // É o que faz as três regras continuarem valendo sem caso especial.
    expect(corpo).toMatch(/generate_series\(1, e\.q\)/);
  });

  it("o mínimo e o máximo do grupo de escolha continuam cobrados", () => {
    expect(corpo).toMatch(/v_ge_qtd < COALESCE\(v_ge\.minimo, 0\)/);
    expect(corpo).toMatch(/v_ge\.maximo > 0 AND v_ge_qtd > v_ge\.maximo/);
  });

  it("o aceite automático da migração anterior sobreviveu ao splice", () => {
    // A função é reescrita inteira a cada migração, e a última definição
    // vence: perder uma linha aqui apaga silenciosamente uma feature.
    expect(corpo).toMatch(/aceite_automatico/);
  });
});

describe("repetir a opção custa o mesmo no JS e no SQL", () => {
  // O SQL repete o preço no array; o JS leva `qtd` em cada escolha. Os
  // dois têm de dar o mesmo número.
  const CASOS = [
    {
      nome: "somar multiplica pela quantidade",
      escolhas: [{ preco: 4, qtd: 2 }],
      arranjo: [4, 4],
      regra: "soma",
      esperado: 8,
    },
    {
      nome: "a mais cara ignora quantas são",
      escolhas: [
        { preco: 40, qtd: 2 },
        { preco: 60, qtd: 1 },
      ],
      arranjo: [40, 40, 60],
      regra: "maior",
      esperado: 60,
    },
    {
      nome: "média pondera pelas porções",
      escolhas: [
        { preco: 30, qtd: 3 },
        { preco: 60, qtd: 1 },
      ],
      arranjo: [30, 30, 30, 60],
      regra: "media",
      esperado: 37.5,
    },
  ];

  it.each(CASOS)("$nome", ({ escolhas, arranjo, regra, esperado }) => {
    // O JS, com a quantidade dentro da escolha.
    expect(precoDoGrupo(escolhas, regra)).toBe(esperado);
    // O SQL recebe o mesmo grupo como array repetido: a conta é a mesma,
    // e é assim que a migração o monta.
    expect(precoDoGrupo(arranjo.map((preco) => ({ preco })), regra)).toBe(esperado);
  });

  it("os casos de repetição estão conferidos contra o banco na própria migração", () => {
    // O bloco DO da migração EXECUTA a função SQL e aborta se divergir.
    // Esta asserção prende os dois arquivos juntos.
    expect(corpo).toMatch(
      /preco_grupo_escolha_delivery\(ARRAY\[40, 40, 60\]::numeric\[\], 'maior'\) <> 60/
    );
    expect(corpo).toMatch(
      /preco_grupo_escolha_delivery\(ARRAY\[4, 4\]::numeric\[\], 'soma'\) <> 8/
    );
  });

  it("a migração confere a contagem em porções contra o banco", () => {
    // Duas porções não passam num mínimo de três, e quatro não passam num
    // máximo de três — as duas provadas com pedido de verdade.
    expect(corpo).toMatch(/duas porções não podiam passar num mínimo de três/);
    expect(corpo).toMatch(/quatro porções não podiam passar num máximo de três/);
  });

  it("a migração confere que a lista de ids de antes continua valendo", () => {
    expect(corpo).toMatch(/o pedido no formato antigo tinha de dar 29/);
  });
});
