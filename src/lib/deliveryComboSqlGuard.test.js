import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard da leva 12 do Run 6 — DL33.
 *
 * O defeito: um PRODUTO só aparece na vitrine pública com `p.active AND
 * pd.disponivel`, e as duas condições são conferidas de novo no envio do
 * pedido. Um COMBO era publicado com `WHERE cb.tenant_id = v_tenant AND
 * cb.ativo` e aceito conferindo só id/tenant/ativo — nada olhava os
 * produtos que formam o combo. O dono marcava "acabou" no X-Burguer, o
 * X-Burguer saía da vitrine na hora, e o "Combo X-Burguer" continuava no
 * ar vendendo o mesmo hambúrguer que acabou. A cozinha recebia pedido de
 * delivery que não tinha como montar.
 *
 * Não há Postgres no CI, então este arquivo garante o TEXTO da migração
 * corretiva — mesmo instrumento de deliveryPlanoSqlGuard.test.js e
 * deliveryEspelhoSqlGuard.test.js. A prova de comportamento é o
 * `DO $conf$` no fim da própria migração, que roda no banco de verdade na
 * hora de aplicar e aborta a transação se faltar ponta.
 *
 * O que cada teste aqui protege é um jeito concreto de o bug voltar:
 *   (a) a migração roda depois das que definiram as funções afetadas;
 *   (b) o predicado nasce fechado (SECURITY DEFINER, search_path fixo,
 *       sem STRICT — com STRICT, argumento nulo devolveria NULL e o
 *       `IF ... THEN` do envio não entraria, abrindo a porta);
 *   (c) ele olha os DOIS lugares onde vive o produto de um combo;
 *   (d) a DIREÇÃO da cláusula de produto_delivery: ausência de linha não
 *       é indisponibilidade — inverter isso tiraria do ar todo combo que
 *       usa item vendido só dentro de combo, ou seja, quase todos;
 *   (e) as duas portas (vitrine e envio) consultam o predicado;
 *   (f) as duas RPCs são cópia literal da versão mais nova, com só a
 *       guarda a mais — copiar um corpo antigo por cima desfaria em
 *       silêncio os consertos das levas anteriores.
 */
const RAIZ = join(__dirname, "../..");
const MIGRATIONS_DIR = join(RAIZ, "supabase/migrations");

const CORRETIVA = "20260907_delivery_combo_respeita_indisponivel.sql";
/** A última migração a definir as duas RPCs antes desta: a base da cópia. */
const BASE_DA_COPIA = "20260903_delivery_horario_e_numero_no_fuso.sql";
const FUNDACAO = "20260804_delivery_fundacao.sql";
const COMBO_MULTIPRODUTO = "20260726_combo_produtos.sql";

const RPCS = ["cardapio_publico", "criar_pedido_delivery"];

/** Arquivos são CRLF; normalizar deixa os padrões multilinha legíveis. */
function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8").split("\r\n").join("\n");
}

/** Linhas de SQL ativo — comentário `--` explicando o bug é permitido. */
function linhasAtivas(conteudo) {
  return conteudo.split("\n").filter((linha) => !linha.trim().startsWith("--"));
}

function semComentarios(conteudo) {
  return linhasAtivas(conteudo).join("\n");
}

/** Da assinatura da função até o `$$;` que a fecha — só o corpo dela. */
function corpoDaFuncao(sql, nomeFuncao) {
  const inicio = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nomeFuncao}(`);
  if (inicio < 0) return null;
  const fim = sql.indexOf("\n$$;", inicio);
  if (fim < 0) return null;
  return sql.slice(inicio, fim + "\n$$;".length);
}

const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));
const conteudo = ler(CORRETIVA);
const ativo = semComentarios(conteudo);
const predicado = corpoDaFuncao(ativo, "combo_indisponivel");

describe("Delivery público — guard do combo que respeita o item indisponível (DL33)", () => {
  it("a migração corretiva existe e roda depois de tudo em que ela se apoia", () => {
    expect(arquivos).toContain(CORRETIVA);

    // O predicado lê combos, combo_produtos, products e produto_delivery:
    // as tabelas precisam existir antes. combo_produtos é a mais nova.
    for (const dependencia of [FUNDACAO, COMBO_MULTIPRODUTO, BASE_DA_COPIA]) {
      expect(arquivos).toContain(dependencia);
      expect(CORRETIVA > dependencia).toBe(true);
    }

    // E depois de toda versão anterior das duas RPCs — CREATE OR REPLACE
    // é destrutivo: rodar antes deixaria um corpo antigo por cima.
    for (const rpc of RPCS) {
      const versoes = arquivos.filter(
        (n) =>
          n !== CORRETIVA &&
          new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\b`).test(
            semComentarios(ler(n))
          )
      );
      expect(versoes.length, `nenhuma migração anterior define ${rpc}`).toBeGreaterThan(0);
      for (const anterior of versoes) {
        expect(CORRETIVA > anterior, `${CORRETIVA} não roda depois de ${anterior}`).toBe(
          true
        );
      }
      // A base da cópia é mesmo a mais nova das anteriores.
      expect(versoes.sort().pop()).toBe(BASE_DA_COPIA);
    }
  });

  it("o predicado nasce fechado: SECURITY DEFINER, search_path fixo, STABLE e sem STRICT", () => {
    expect(predicado, "combo_indisponivel não foi criada").not.toBeNull();

    // Ela lê products/produto_delivery no caminho ANÔNIMO, por trás do RLS:
    // sem SECURITY DEFINER a vitrine inteira cairia.
    expect(predicado).toMatch(/SECURITY DEFINER/);
    // Ela decide o que um anônimo vê: search_path solto é sequestro de tabela.
    expect(predicado).toMatch(/SET search_path = public/);
    expect(predicado).toMatch(/\bSTABLE\b/);

    // STRICT devolveria NULL para argumento nulo. Sob `AND NOT f(...)` isso
    // até filtra a linha, mas sob `IF f(...) THEN` o ramo NÃO é tomado — o
    // envio do pedido voltaria a aceitar o combo. Fail-open silencioso.
    expect(predicado).not.toMatch(/\bSTRICT\b/);
    expect(predicado).not.toMatch(/RETURNS NULL ON NULL INPUT/);
  });

  it("o predicado é helper interno: nada de EXECUTE para o anon", () => {
    expect(ativo).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.combo_indisponivel\(uuid, uuid\) FROM PUBLIC;/
    );
    // Um GRANT aqui exporia a disponibilidade do catálogo a quem chama a
    // API direto. Ela roda DENTRO das RPCs; o anon não precisa alcançá-la.
    const linhasDeGrant = linhasAtivas(conteudo).filter(
      (linha) => /\bGRANT\b/.test(linha) && /combo_indisponivel/.test(linha)
    );
    expect(linhasDeGrant).toEqual([]);
  });

  it("combo que não existe, não é do tenant ou está inativo lê como indisponível", () => {
    // Sem esta primeira ponta o predicado responderia "disponível" para
    // combo inexistente: um EXISTS(componentes ruins) sobre zero linhas é
    // false. Nenhum dos dois chamadores de hoje chega aqui com combo
    // inexistente, mas um predicado de disponibilidade com default aberto
    // é um furo esperando pelo terceiro chamador.
    expect(predicado).toMatch(
      /SELECT NOT EXISTS \(\s*SELECT 1\s*FROM public\.combos c\s*WHERE c\.id = p_combo_id\s*AND c\.tenant_id = p_tenant\s*AND c\.ativo\s*\)/
    );
  });

  it("o predicado olha os DOIS lugares onde vive o produto de um combo", () => {
    // A 20260726 passou o combo a agregar vários produtos e NÃO fez
    // backfill do principal para combo_produtos. Olhar só uma das duas
    // deixa metade dos combos sem guarda — e nada quebraria.
    expect(predicado).toMatch(
      /SELECT c\.item_principal_id AS produto_id\s*FROM public\.combos c\s*WHERE c\.id = p_combo_id AND c\.tenant_id = p_tenant\s*UNION\s*SELECT cp\.produto_id\s*FROM public\.combo_produtos cp\s*WHERE cp\.combo_id = p_combo_id/
    );
  });

  it("produto que sumiu, inativo ou marcado como 'acabou' derruba o combo", () => {
    // LEFT JOIN + p.id IS NULL: produto apagado do catálogo (a FK de
    // combo_produtos é ON DELETE RESTRICT, mas a de item_principal_id é
    // CASCADE) não pode passar como disponível.
    expect(predicado).toMatch(
      /LEFT JOIN public\.products p\s*ON p\.id = ids\.produto_id AND p\.tenant_id = p_tenant/
    );
    expect(predicado).toMatch(/WHERE p\.id IS NULL/);

    // COALESCE nos dois: aqui a polaridade é negativa, e `NOT NULL` é NULL.
    // Um NULL escorregando deixaria o combo no ar — fail-OPEN.
    expect(predicado).toMatch(/OR NOT COALESCE\(p\.active, false\)/);
    expect(predicado).toMatch(/AND NOT COALESCE\(pd\.disponivel, false\)/);
    expect(predicado).not.toMatch(/OR NOT p\.active\b/);
    expect(predicado).not.toMatch(/AND NOT pd\.disponivel\b/);

    // E a linha de produto_delivery tem de ser do mesmo tenant e do mesmo
    // produto: sem um dos dois, o "acabou" de um estabelecimento apagaria
    // o combo do outro.
    expect(predicado).toMatch(/WHERE pd\.produto_id = p\.id\s*AND pd\.tenant_id\s*= p_tenant/);
  });

  it("a FALTA de linha em produto_delivery não conta como indisponível", () => {
    // Esta é a direção que importa. A linha em produto_delivery nasce só
    // de publicação explícita, sempre com disponivel = true
    // (deliveryAdmin.js, importarProdutosDelivery): "sem linha" quer dizer
    // "não é vendido avulso no delivery" — a batata P que só existe dentro
    // do combo. Tratar ausência como indisponibilidade tiraria do ar quase
    // todo combo já publicado, e a vitrine ficaria vazia sem erro nenhum.
    expect(predicado).toMatch(
      /OR EXISTS \(\s*SELECT 1\s*FROM public\.produto_delivery pd/
    );
    // O inverso — exigir que EXISTA linha disponível — é exatamente o
    // engano a evitar.
    expect(predicado).not.toMatch(/NOT EXISTS \([^)]*produto_delivery/);
    expect(predicado).not.toMatch(/JOIN public\.produto_delivery/);

    // Prova pela estrutura: o produto entra por LEFT JOIN (pode não ter
    // linha) e a checagem de disponibilidade é um EXISTS separado, não uma
    // condição do JOIN.
    const clausulas = predicado.slice(predicado.indexOf("WHERE p.id IS NULL"));
    expect(clausulas).toMatch(/EXISTS/);
  });

  it("combo_produtos é filtrada por combo_id, e isso é de propósito", () => {
    // A coluna tenant_id entrou em combo_produtos por ADD COLUMN
    // condicional, com DEFAULT tenant_atual_id(): linha antiga pode ter
    // tenant_id nulo e escaparia da guarda. O combo já foi conferido por
    // tenant na primeira metade, e combo_id tem FK ON DELETE CASCADE — não
    // há como a junção cruzar estabelecimento.
    expect(predicado).not.toMatch(/cp\.tenant_id/);
  });

  it("a vitrine passou a cobrar o predicado no bloco dos combos", () => {
    const vitrine = corpoDaFuncao(ativo, "cardapio_publico");
    expect(vitrine, "a corretiva não recria cardapio_publico").not.toBeNull();

    // A guarda tem de estar na subconsulta dos combos, com o id do combo e
    // o tenant já resolvido — passar outra coisa aqui liberaria geral sem
    // quebrar sintaxe.
    const subconsulta = vitrine.slice(vitrine.indexOf("'combos', COALESCE(("));
    expect(subconsulta).toMatch(/FROM public\.combos cb/);
    expect(subconsulta).toMatch(
      /WHERE cb\.tenant_id = v_tenant AND cb\.ativo\s*AND NOT public\.combo_indisponivel\(cb\.id, v_tenant\)/
    );

    // E nenhuma linha ativa publica combo sem a guarda: a condição antiga
    // não pode sobreviver em outro lugar do arquivo.
    const publicacoes = linhasAtivas(conteudo)
      .map((linha, i, todas) => ({ linha, proxima: todas[i + 1] || "" }))
      .filter(({ linha }) => /WHERE cb\.tenant_id = v_tenant AND cb\.ativo/.test(linha));
    expect(publicacoes.length).toBeGreaterThan(0);
    for (const { proxima } of publicacoes) {
      expect(proxima).toMatch(/AND NOT public\.combo_indisponivel\(cb\.id, v_tenant\)/);
    }
  });

  it("o envio do pedido cobra o predicado no ramo do combo, antes de montar a linha", () => {
    const envio = corpoDaFuncao(ativo, "criar_pedido_delivery");
    expect(envio, "a corretiva não recria criar_pedido_delivery").not.toBeNull();

    const ramo = envio.slice(
      envio.indexOf("IF v_item ? 'combo_id'"),
      envio.indexOf("v_preco_base := COALESCE(v_combo.preco_total, 0);")
    );
    expect(ramo).toMatch(
      /IF public\.combo_indisponivel\(v_combo\.id, v_tenant\) THEN\s*RAISE EXCEPTION 'Item indisponível\.';\s*END IF;/
    );
    // Antes de v_nome/v_preco_base: recusar depois de montar a linha seria
    // a mesma recusa, mas a ordem aqui é o que mantém o ramo legível e
    // igual ao do produto solto.
    expect(ramo.indexOf("combo_indisponivel")).toBeLessThan(
      ramo.indexOf("v_nome := v_combo.nome;")
    );

    // A mensagem é a mesma dos outros itens indisponíveis: a vitrine já
    // traduz "Item indisponível." para o cliente.
    expect(envio).not.toMatch(/RAISE EXCEPTION 'Combo/);
  });

  it("as duas RPCs são cópia literal da versão mais nova, com só a guarda a mais", () => {
    // O jeito mais fácil de perder um conserto antigo é recriar a função a
    // partir de um corpo desatualizado: o SQL aplica, nada quebra, e a
    // correção de fuso/número/limite volta a não existir. Esta é a prova
    // de que nada além da guarda mudou.
    const base = semComentarios(ler(BASE_DA_COPIA));

    const remocoes = {
      cardapio_publico: [
        "        AND NOT public.combo_indisponivel(cb.id, v_tenant)\n",
      ],
      criar_pedido_delivery: [
        "      IF public.combo_indisponivel(v_combo.id, v_tenant) THEN\n" +
          "        RAISE EXCEPTION 'Item indisponível.';\n" +
          "      END IF;\n",
      ],
    };

    for (const rpc of RPCS) {
      const nova = corpoDaFuncao(ativo, rpc);
      const antiga = corpoDaFuncao(base, rpc);
      expect(antiga, `${BASE_DA_COPIA} não define ${rpc}`).not.toBeNull();

      let semGuarda = nova;
      for (const trecho of remocoes[rpc]) {
        expect(semGuarda.includes(trecho), `guarda ausente em ${rpc}`).toBe(true);
        semGuarda = semGuarda.replace(trecho, "");
      }
      expect(semGuarda, `${rpc} divergiu de ${BASE_DA_COPIA} além da guarda`).toBe(antiga);
    }
  });

  it("a conferência ao vivo cobre as duas pontas e os dois casos fail-closed", () => {
    // O DO $conf$ é a única prova de comportamento que existe (não há
    // Postgres no CI). Se ele for afrouxado, a migração passa a aplicar
    // meia-boca em silêncio.
    expect(ativo).toMatch(/DO \$conf\$/);

    // O predicado existe e está fechado, no banco de verdade.
    expect(ativo).toMatch(/IF NOT v_secdef THEN/);
    expect(ativo).toMatch(/search_path=public/);
    expect(ativo).toMatch(/has_function_privilege\('public'/);

    // As duas portas consultam o predicado — no pg_proc, não no arquivo.
    expect(ativo).toMatch(
      /FOREACH v_rpc IN ARRAY ARRAY\['cardapio_publico', 'criar_pedido_delivery'\]/
    );
    expect(ativo).toMatch(/position\('combo_indisponivel' in v_def\) = 0/);

    // E os dois casos fail-closed, executados de verdade.
    expect(ativo).toMatch(
      /public\.combo_indisponivel\(gen_random_uuid\(\), gen_random_uuid\(\)\) IS NOT TRUE/
    );
    expect(ativo).toMatch(/public\.combo_indisponivel\(NULL::uuid, NULL::uuid\) IS NOT TRUE/);

    // Nada de escrever em tabela real para conferir: não há precedente no
    // projeto, e combo_produtos.tenant_id é NOT NULL com default vindo do
    // JWT — nulo no SQL Editor, onde o dono aplica.
    expect(ativo).not.toMatch(/INSERT INTO public\.(combos|combo_produtos|products)/);
    expect(ativo).not.toMatch(/\bROLLBACK\b/);
  });
});
