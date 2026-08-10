import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard de regressão do F022-HISTORICO — o estorno de um pagamento de
 * assinatura mexe nas duas coisas que decidem se um cliente opera ou fica
 * bloqueado: `data_vencimento` e o histórico do dinheiro.
 *
 * O que precisa continuar verdade na `20260913`:
 *
 *   (a) só a plataforma estorna, e a guarda é a PRIMEIRA coisa que roda —
 *       guarda depois da escrita é guarda que não existe;
 *   (b) o estabelecimento sai da própria linha de pagamento, nunca do
 *       cliente: com `p_tenant_id` daria para estornar o pagamento de um
 *       e descontar o ciclo de outro;
 *   (c) estorno NÃO apaga — a linha vira marcada, com quem cancelou e por
 *       quê. Um DELETE destruiria a auditoria justamente do caminho do
 *       dinheiro;
 *   (d) motivo obrigatório NO BANCO, não só na tela;
 *   (e) o vencimento volta EXATAMENTE um ciclo e o status é derivado por
 *       `calcular_status_assinatura` (ADR-006 §3), com 'cancelado'
 *       preservado;
 *   (f) `ultima_renovacao` é recalculada só sobre pagamento que sobrou;
 *   (g) o índice único de competência é PARCIAL e mantém o MESMO nome —
 *       parcial para o mês estornado poder ser lançado de novo, mesmo nome
 *       para a conferência ao vivo da 20260909 continuar passando;
 *   (h) o lock começa em `assinaturas`, como na renovação: ordem invertida
 *       abre deadlock entre um estorno e uma confirmação simultâneos;
 *   (i) REVOKE antes do GRANT — na ordem inversa o REVOKE de PUBLIC também
 *       tira o EXECUTE de `authenticated`;
 *   (j) nenhuma política de escrita nasce nas tabelas de assinatura;
 *   (k) a frase que o cliente JS duplica é byte a byte a do banco.
 *
 * Não há Postgres no CI: o que este arquivo garante é o TEXTO da migração.
 * A garantia de que a PRODUÇÃO ficou assim é o bloco DO $conf$ do fim do
 * arquivo, que consulta pg_proc/pg_indexes/pg_policies ao vivo.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const ESTORNO = "20260913_estorno_pagamento_assinatura.sql";
const RENOVACAO = "20260909_renovacao_assinatura_so_plataforma.sql";

const FN = "public.estornar_pagamento_assinatura(uuid, text, text)";
const INDICE = "assinaturas_pagamentos_competencia_uidx";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/**
 * Linhas de SQL ativo, sem CR — o cabeçalho e o corpo explicam o desenho em
 * português e usam de propósito as palavras "DELETE", "apagar" e
 * "p_tenant_id"; conferir o texto cru daria falso positivo nos dois sentidos.
 */
function semComentarios(conteudo) {
  return conteudo
    .split("\n")
    .map((linha) => linha.replace(/\r$/, ""))
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
}

/** Recorta um trecho entre duas âncoras, incluindo as duas. */
function recorte(conteudo, inicio, fim) {
  const i = conteudo.indexOf(inicio);
  expect(i).toBeGreaterThanOrEqual(0);
  const j = conteudo.indexOf(fim, i);
  expect(j).toBeGreaterThan(i);
  return conteudo.slice(i, j + fim.length);
}

const bruto = ler(ESTORNO);
const sql = semComentarios(bruto);
// Corpo da função, entre o CREATE e o fim do bloco — é sobre ele que valem
// as afirmações de ordem.
const corpo = recorte(sql, "CREATE OR REPLACE FUNCTION public.estornar_pagamento_assinatura", "$$;");
/**
 * A migração sem o bloco de conferência. A conferência CITA em texto o que
 * proíbe ("p_tenant_id", "DELETE FROM …") dentro de comparações LIKE — procurar
 * essas palavras no arquivo inteiro acusaria justamente o guarda como se fosse
 * o infrator.
 */
const migracao = sql.slice(0, sql.indexOf("DO $conf$"));

describe("20260913 — a migração existe e roda na hora certa", () => {
  it("está na pasta de migrações e depois da renovação que ela desfaz", () => {
    const arquivos = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    expect(arquivos).toContain(ESTORNO);
    expect(arquivos).toContain(RENOVACAO);
    // Supabase aplica em ordem de nome: o estorno depende da tabela e do
    // índice criados antes.
    expect(ESTORNO > RENOVACAO).toBe(true);
  });

  it("as três colunas do estorno são aditivas e idempotentes", () => {
    expect(sql).toMatch(/ALTER TABLE public\.assinaturas_pagamentos/);
    for (const coluna of ["estornado_em", "estornado_por", "estorno_motivo"]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${coluna}\\b`));
    }
    // Coluna NOT NULL quebraria todo o histórico já gravado.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS\s+estornado_em[^\n]*NOT NULL/);
  });
});

describe("o índice de competência vira parcial sem trocar de nome", () => {
  it("é recriado como UNIQUE parcial em estornado_em IS NULL", () => {
    const bloco = recorte(sql, "DROP INDEX IF EXISTS", "estornado_em IS NULL;");
    expect(bloco).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_pagamentos_competencia_uidx/);
    expect(bloco).toMatch(/\(tenant_id, competencia\)/);
    // Sem o WHERE, estornar agosto deixaria agosto travado para sempre — o
    // conserto (estornar e lançar de novo) não fecharia.
    expect(bloco).toMatch(/WHERE estornado_em IS NULL;/);
  });

  it("mantém o nome que a conferência ao vivo da 20260909 cobra", () => {
    // Aquela migração checa o índice POR NOME. Renomear aqui a faria falhar
    // se ela fosse reexecutada — e ela é idempotente de propósito.
    expect(semComentarios(ler(RENOVACAO))).toContain(INDICE);
    expect(sql).toContain(INDICE);
  });
});

describe("a RPC do estorno", () => {
  it("é SECURITY DEFINER com search_path fixo", () => {
    expect(corpo).toMatch(/SECURITY DEFINER/);
    expect(corpo).toMatch(/SET search_path = public, auth, extensions/);
  });

  it("a guarda de plataforma é a primeira instrução do corpo", () => {
    const guarda = corpo.indexOf("public.is_super_admin() IS NOT TRUE");
    expect(guarda).toBeGreaterThan(0);
    expect(corpo).toMatch(/USING ERRCODE = 'insufficient_privilege'/);

    // Nada pode acontecer antes de saber quem chamou.
    const begin = corpo.indexOf("BEGIN");
    expect(corpo.slice(begin, guarda)).not.toMatch(/UPDATE|INSERT|DELETE|FOR UPDATE/);
    for (const escrita of [
      "UPDATE public.assinaturas_pagamentos",
      "UPDATE public.assinaturas\n",
      "FOR UPDATE",
    ]) {
      expect(corpo.indexOf(escrita)).toBeGreaterThan(guarda);
    }
  });

  it("não recebe o estabelecimento do cliente — ele sai da linha de pagamento", () => {
    expect(migracao).not.toMatch(/p_tenant_id/);
    expect(corpo).toMatch(/SELECT tenant_id INTO v_tenant/);
    expect(corpo).toMatch(/WHERE id = p_pagamento_id/);
  });

  it("marca a linha em vez de apagá-la", () => {
    expect(corpo).toMatch(/SET estornado_em\s+= now\(\)/);
    expect(corpo).toMatch(/estornado_por\s+= p_estornado_por/);
    expect(corpo).toMatch(/estorno_motivo = btrim\(p_motivo\)/);
    // O que este teste existe para impedir.
    expect(migracao).not.toMatch(/DELETE\s+FROM\s+public\.assinaturas_pagamentos/i);
    expect(migracao).not.toMatch(/TRUNCATE/i);
  });

  it("exige o motivo no banco, não só na tela", () => {
    expect(corpo).toMatch(/p_motivo IS NULL OR length\(btrim\(p_motivo\)\) < 3/);
    expect(corpo).toMatch(/USING ERRCODE = 'check_violation'/);
  });

  it("devolve exatamente um ciclo e deriva o status da data nova", () => {
    const update = recorte(corpo, "UPDATE public.assinaturas\n", "RETURNING * INTO v_result;");
    expect(update).toMatch(/data_vencimento\s+= data_vencimento - ciclo_dias/);
    // Status fixo foi o defeito nº3 da renovação original (20260802) — não
    // pode voltar pelo inverso.
    expect(update).toMatch(/public\.calcular_status_assinatura\(\s*\n?\s*data_vencimento - ciclo_dias, carencia_dias\)/);
    expect(update).not.toMatch(/status\s+= 'ativo'/);
    // 'cancelado' é manual (mesma regra de sincronizar_status_assinatura).
    expect(update).toMatch(/WHEN status = 'cancelado' THEN status/);
  });

  it("recalcula ultima_renovacao só com o que sobrou de válido", () => {
    // Até o WHERE da UPDATE de fora — o WHERE de dentro leva o prefixo `p.`.
    const update = recorte(corpo, "ultima_renovacao = (", "WHERE tenant_id = v_tenant");
    expect(update).toMatch(/max\(p\.confirmado_em\)::date/);
    expect(update).toMatch(/p\.estornado_em IS NULL/);
  });

  it("recusa estornar duas vezes, sob lock", () => {
    // Dois estornos simultâneos descontariam DOIS ciclos de um pagamento só.
    const lockAssinatura = corpo.indexOf("PERFORM 1 FROM public.assinaturas");
    const lockPagamento = corpo.indexOf("SELECT estornado_em INTO v_estornado");
    expect(lockAssinatura).toBeGreaterThan(0);
    // Ordem de lock igual à da renovação: assinaturas antes de pagamentos.
    expect(lockPagamento).toBeGreaterThan(lockAssinatura);
    expect(corpo).toMatch(/FOR UPDATE;\n\n  IF v_estornado IS NOT NULL THEN/);
    expect(corpo).toMatch(/Este pagamento já foi cancelado em %\./);
  });

  it("REVOKE vem antes do GRANT", () => {
    const revoke = sql.indexOf("REVOKE ALL ON FUNCTION public.estornar_pagamento_assinatura");
    const grant = sql.indexOf("GRANT EXECUTE ON FUNCTION public.estornar_pagamento_assinatura");
    expect(revoke).toBeGreaterThan(0);
    expect(grant).toBeGreaterThan(revoke);
    expect(sql).toMatch(/FROM PUBLIC, anon;/);
    expect(sql).toMatch(/TO authenticated;/);
  });
});

describe("a migração não abre porta lateral", () => {
  it("não cria política de escrita em assinatura nenhuma", () => {
    // A escrita continua sendo só por função SECURITY DEFINER (decisão 027).
    expect(sql).not.toMatch(/CREATE POLICY/i);
    // GRANT de escrita direto na tabela contornaria a RPC pelo mesmo efeito.
    expect(migracao).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE/i);
  });

  it("não cria RPC de leitura — o histórico é lido direto pela policy da 20260726", () => {
    const funcoes = sql.match(/CREATE (OR REPLACE )?FUNCTION public\.\w+/g) ?? [];
    expect(funcoes).toHaveLength(1);
    expect(funcoes[0]).toContain("estornar_pagamento_assinatura");
  });

  it("a conferência ao vivo não escreve em tabela nenhuma", () => {
    const conf = recorte(sql, "DO $conf$", "$conf$;");
    // A conferência CITA esses comandos dentro de LIKE para saber se a função
    // instalada os contém; o que não pode é EXECUTAR um — daí olhar só o começo
    // de cada linha, que é onde uma instrução de verdade apareceria.
    const executadas = conf
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(INSERT INTO|UPDATE\s|DELETE FROM|ALTER TABLE|DROP\s|TRUNCATE)/i.test(l));
    expect(executadas).toEqual([]);
    expect(conf).toMatch(/RAISE NOTICE 'OK:/);
    // Sem tirar comentário, a checagem textual daria a guarda como presente
    // por causa do comentário que a explica.
    expect(conf).toMatch(/regexp_replace\(pg_get_functiondef\(v_reg\), '--\.\*', '', 'gn'\)/);
  });
});

describe("o cliente JS não desmente o banco", () => {
  // Sem tirar o CR, âncora com "\n" nunca casa em arquivo salvo no Windows.
  const cliente = readFileSync(join(__dirname, "../console/assinatura.js"), "utf8").replace(/\r/g, "");

  it("chama a RPC com os três parâmetros e sem estabelecimento", () => {
    expect(cliente).toMatch(/supabase\.rpc\("estornar_pagamento_assinatura"/);
    expect(cliente).toMatch(/p_pagamento_id:/);
    expect(cliente).toMatch(/p_motivo:/);
    expect(cliente).toMatch(/p_estornado_por:/);
    expect(cliente).not.toMatch(/p_tenant_id: [^\n]*estorn/i);
  });

  it("a frase de motivo obrigatório é a MESMA do banco, byte a byte", () => {
    // Aprendizado de 2026-08-01: frase parecida na tela e no banco vira duas
    // mensagens diferentes para a mesma recusa, dependendo de quem barrou.
    const frase = "Escreva o motivo do cancelamento — ele fica gravado no histórico.";
    expect(sql).toContain(frase);
    expect(cliente).toContain(frase);
  });

  it("não faz select * na tabela de billing", () => {
    const leitura = recorte(cliente, "export async function listarPagamentosAssinatura", "}\n");
    expect(leitura).not.toMatch(/select\(\s*["'`]\*/);
    expect(leitura).toMatch(/\.eq\("tenant_id", tenantId\)/);
    for (const campo of ["id", "competencia", "valor", "metodo", "confirmado_por", "estornado_em"]) {
      expect(leitura).toContain(campo);
    }
  });
});
