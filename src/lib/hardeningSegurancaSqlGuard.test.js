import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard da leva de correções de segurança 20260920..20260924, feita
 * depois da simulação de ataque ao código.
 *
 * Migrations são histórico imutável: os arquivos que criaram as brechas
 * continuam no disco como estavam (não reescrevemos migração já
 * aplicada). O que este guard garante é que as corretivas existem, vêm
 * DEPOIS na ordem lexicográfica (= ordem de aplicação) e que ninguém
 * reintroduza o mesmo padrão em migration futura.
 *
 * Não substitui a verificação real: cada migration termina com SELECT
 * em pg_policies/pg_proc, que só roda contra o Postgres do Supabase.
 * Aqui é texto — mas é o que roda em CI, onde não há banco.
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");

const ARQUIVOS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const RLS_LIGADA = "20260920_rls_habilitada_tabelas_base.sql";
const RATE_LIMIT = "20260921_delivery_rate_limit_sem_telefone.sql";
const FISCAL_PAPEL = "20260922_fiscal_config_leitura_por_papel.sql";
const COMBO_TENANT = "20260923_combo_produtos_isolamento_tenant.sql";
const SEARCH_PATH = "20260924_search_path_security_definer.sql";

const ler = (arquivo) => readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
/** SQL de verdade: sem as linhas de comentário, que aqui são longas. */
const semComentarios = (conteudo) =>
  conteudo
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");

const SQL = new Map(ARQUIVOS.map((f) => [f, semComentarios(ler(f))]));

const CRIA_POLICY =
  /CREATE POLICY\s+(?:IF NOT EXISTS\s+)?"?([\w ]+?)"?\s+ON\s+(?:(\w+)\.)?"?(\w+)"?/gi;
const LIGA_RLS =
  /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:(\w+)\.)?"?(\w+)"?\s+ENABLE ROW LEVEL SECURITY/gi;

function tabelasDePublicComPolicy() {
  const tabelas = new Set();
  for (const sql of SQL.values()) {
    for (const m of sql.matchAll(CRIA_POLICY)) {
      if ((m[2] || "public") === "public") tabelas.add(m[3]);
    }
  }
  return tabelas;
}

function tabelasDePublicComRlsLigada() {
  const tabelas = new Set();
  for (const sql of SQL.values()) {
    for (const m of sql.matchAll(LIGA_RLS)) {
      if ((m[1] || "public") === "public") tabelas.add(m[2]);
    }
  }
  return tabelas;
}

describe("RLS ligada — policy sem ENABLE não protege nada (20260920)", () => {
  it("a corretiva existe e roda depois de todas as outras migrations dela", () => {
    expect(ARQUIVOS).toContain(RLS_LIGADA);
    for (const tabela of ["config", "fechamentos", "pending", "products", "sales", "users"]) {
      const criadoras = ARQUIVOS.filter((f) =>
        [...SQL.get(f).matchAll(CRIA_POLICY)].some(
          (m) => (m[2] || "public") === "public" && m[3] === tabela,
        ),
      );
      expect(criadoras.length).toBeGreaterThan(0);
      for (const f of criadoras) expect(RLS_LIGADA > f || f === RLS_LIGADA).toBe(true);
    }
  });

  it("toda tabela de public com CREATE POLICY tem ENABLE ROW LEVEL SECURITY em alguma migration", () => {
    const semRls = [...tabelasDePublicComPolicy()]
      .filter((t) => !tabelasDePublicComRlsLigada().has(t))
      .sort();
    // Se este teste falhar, a tabela listada tem policy escrita e RLS
    // desligada: o Postgres ignora a policy e a tabela está aberta.
    expect(semRls).toEqual([]);
  });

  it("as seis tabelas do achado ganham ENABLE ROW LEVEL SECURITY nesta migration", () => {
    const sql = SQL.get(RLS_LIGADA);
    for (const tabela of ["config", "fechamentos", "pending", "products", "sales", "users"]) {
      expect(sql).toMatch(
        new RegExp(`ALTER TABLE\\s+public\\.${tabela}\\s+ENABLE ROW LEVEL SECURITY`, "i"),
      );
    }
  });

  it("mantém ponte_endereco na lista de chaves que o caixa escreve em config", () => {
    // Sem esta chave, ligar RLS em `config` congela o endereço da Ponte
    // descoberto pelo PDV (usePonteLocal) e o Palm de todo garçom para
    // de achar a Ponte quando o IP da casa muda.
    const sql = SQL.get(RLS_LIGADA);
    expect(sql).toContain("ponte_endereco");
    const chaves = sql.match(/key IN \([^)]*\)/g) || [];
    expect(chaves.length).toBeGreaterThan(0);
    for (const lista of chaves) expect(lista).toContain("ponte_endereco");
  });
});

describe("combo_produtos — a última policy allow_all (20260923)", () => {
  it("a corretiva derruba allow_all_combo_produtos e roda depois de quem a criou", () => {
    expect(ARQUIVOS).toContain(COMBO_TENANT);
    expect(SQL.get(COMBO_TENANT)).toMatch(
      /DROP POLICY IF EXISTS\s+"?allow_all_combo_produtos"?\s+ON\s+public\.combo_produtos/i,
    );
    expect(COMBO_TENANT > "20260726_combo_produtos.sql").toBe(true);
  });

  it("nenhuma migration posterior volta a criar policy allow_all_%", () => {
    const reincidentes = ARQUIVOS.filter((f) => f > COMBO_TENANT).filter((f) =>
      /CREATE POLICY\s+"?allow_all_/i.test(SQL.get(f)),
    );
    expect(reincidentes).toEqual([]);
  });

  it("escrita fica com gerência e a leitura segue liberada para autenticado", () => {
    const sql = SQL.get(COMBO_TENANT);
    expect(sql).toMatch(/CREATE POLICY\s+"?combo_produtos_select_auth"?/i);
    expect(sql).toMatch(/auth\.role\(\)\s*=\s*'authenticated'/);
    expect(sql).toMatch(/CREATE POLICY\s+"?combo_produtos_write_gerente_admin"?/i);
    expect(sql).toMatch(/IN \('gerente',\s*'admin'\)/);
    // Isolamento de tenant é RESTRICTIVE: soma em AND com as de cima.
    expect(sql).toMatch(/AS RESTRICTIVE/i);
    expect(sql).toMatch(/tenant_id = public\.tenant_atual_id\(\)/);
  });
});

describe("search_path fixo em SECURITY DEFINER (20260924)", () => {
  const DEFINE_FUNCAO = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;

  /**
   * Só a ÚLTIMA definição de cada função vale: CREATE OR REPLACE apaga
   * as cláusulas SET que não forem repetidas no texto novo. Foi assim
   * que funções que já tinham search_path o perderam.
   */
  function ultimaDefinicaoPorFuncao() {
    const ultima = new Map();
    for (const arquivo of ARQUIVOS) {
      const sql = SQL.get(arquivo);
      const marcas = [...sql.matchAll(DEFINE_FUNCAO)];
      marcas.forEach((m, i) => {
        const fim = i + 1 < marcas.length ? marcas[i + 1].index : sql.length;
        ultima.set(m[1], { arquivo, corpo: sql.slice(m.index, fim) });
      });
    }
    return ultima;
  }

  it("toda função SECURITY DEFINER sem SET search_path está na lista da corretiva", () => {
    const corretiva = SQL.get(SEARCH_PATH);
    const descobertas = [];
    for (const [nome, { corpo }] of ultimaDefinicaoPorFuncao()) {
      const definer = /SECURITY\s+DEFINER/i.test(corpo);
      const temSearchPath = /SET\s+search_path/i.test(corpo);
      if (definer && !temSearchPath) descobertas.push(nome);
    }
    // Cada uma precisa aparecer no ARRAY de ALTER FUNCTION da corretiva.
    const naoCobertas = descobertas.filter(
      (nome) => !new RegExp(`'public\\.${nome}\\(`).test(corretiva),
    );
    expect(naoCobertas.sort()).toEqual([]);
    // E a corretiva tem que estar cobrindo alguém de verdade.
    expect(descobertas.length).toBeGreaterThan(0);
  });

  it("a corretiva roda depois de todos os arquivos que definem as funções que ela conserta", () => {
    const alvos = [...SQL.get(SEARCH_PATH).matchAll(/'public\.(\w+)\(/g)].map((m) => m[1]);
    expect(alvos.length).toBe(7);
    const ultima = ultimaDefinicaoPorFuncao();
    for (const nome of alvos) {
      expect(ultima.has(nome)).toBe(true);
      expect(SEARCH_PATH > ultima.get(nome).arquivo).toBe(true);
    }
  });

  it("usa ALTER FUNCTION, não redeclara corpo", () => {
    const sql = SQL.get(SEARCH_PATH);
    expect(sql).toMatch(/ALTER FUNCTION %s SET search_path = public/);
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
  });
});

describe("delivery — teto para pedido sem telefone (20260921)", () => {
  it("a corretiva roda depois da que criou o rate limit", () => {
    const originais = ARQUIVOS.filter((f) =>
      /CREATE OR REPLACE FUNCTION public\.delivery_rate_limit_check/i.test(SQL.get(f)),
    );
    expect(originais.length).toBeGreaterThan(1);
    expect(originais[originais.length - 1]).toBe(RATE_LIMIT);
  });

  it("o caminho sem telefone deixou de ser saída livre e virou contagem por tenant", () => {
    const sql = SQL.get(RATE_LIMIT);
    // O bug era `IF v_tel IS NULL THEN RETURN NEW` — sem telefone,
    // nenhuma contagem acontecia e o limite não existia.
    expect(sql).not.toMatch(/IS NULL\s+THEN\s+RETURN NEW/i);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
    expect(sql).toMatch(/check_violation/);
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/SET search_path = public/i);
  });
});

describe("config fiscal — leitura por papel (20260922)", () => {
  it("a corretiva roda depois da migration que criou a policy", () => {
    expect(ARQUIVOS).toContain(FISCAL_PAPEL);
    expect(FISCAL_PAPEL > "20260731_tenant_fiscal_config.sql").toBe(true);
  });

  it("garçom perde a leitura; caixa continua lendo porque é ele quem emite", () => {
    const sql = SQL.get(FISCAL_PAPEL);
    expect(sql).toMatch(/DROP POLICY IF EXISTS\s+"?fiscal_config_select"?/i);
    expect(sql).toMatch(/IN \('caixa',\s*'gerente',\s*'admin'\)/);
    expect(sql).not.toMatch(/'garcom'/);
    expect(sql).toMatch(/tenant_id = public\.tenant_atual_id\(\)/);
    expect(sql).toMatch(/public\.is_super_admin\(\)/);
  });
});
