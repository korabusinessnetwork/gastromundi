import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard do texto da migration `20260916_caixa_movimentos.sql` (F005).
 *
 * `caixa_movimentos` é a trilha de auditoria do dinheiro que sai da gaveta no
 * meio do turno. Não há Postgres no CI, então o que este arquivo garante é o
 * texto da migration — mesmo instrumento dos outros `*SqlGuard.test.js`:
 *
 *   (a) a tabela nasce idempotente e com `tenant_id` amarrado ao tenant do JWT;
 *   (b) `tipo` só aceita o conjunto conhecido e `valor` é sempre > 0 — zero não
 *       é movimento e negativo INVERTERIA a conta do esperado no fechamento;
 *   (c) `motivo` e `autor` são NOT NULL (o CAIXA.md exige autor e motivo em
 *       cada movimento) e `autorizado_por` é anulável;
 *   (d) RLS habilitada, SELECT para logado, INSERT restrito aos cargos que
 *       operam a gaveta, lidos do claim `app_metadata.gastro_role`;
 *   (e) NENHUMA policy de UPDATE ou DELETE — com RLS ligada e sem policy o
 *       banco nega, e é essa ausência que faz a trilha ser trilha. Este é o
 *       teste mais importante do arquivo: uma policy de UPDATE adicionada por
 *       descuido permitiria reescrever uma sangria depois da conferência;
 *   (f) a policy RESTRICTIVE de isolamento por tenant (decisão 002);
 *   (g) índice que sustenta a leitura real (tenant + janela da sessão);
 *   (h) o cabeçalho avisa que a execução é manual e que RLS precisa ser
 *       conferida no painel;
 *   (i) o cliente JS não desmente o banco — os tipos, o nome da tabela e as
 *       colunas usadas em `src/lib/caixa/caixaMovimentos.js` e no `AppContext` são
 *       exatamente os que a migration cria, e a leitura especifica colunas em
 *       vez de `select *` (tabela de caixa é tabela sensível).
 */
const RAIZ = join(__dirname, "../../..");
const MIGRATIONS_DIR = join(RAIZ, "supabase/migrations");
const MIGRATION = "20260916_caixa_movimentos.sql";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/** Só o SQL que roda — comentário `--` explicando a regra é permitido. */
function semComentarios(conteudo) {
  return conteudo
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
}

/** O trecho da migration a partir de um marcador — para checar vizinhança. */
function recorte(sql, marcador, tamanho = 400) {
  const posicao = sql.indexOf(marcador);
  expect(posicao, `marcador ausente na migration: ${marcador}`).toBeGreaterThan(-1);
  return sql.slice(posicao, posicao + tamanho);
}

const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));
const SQL = semComentarios(ler(MIGRATION));

describe("caixa_movimentos — a tabela (F005)", () => {
  it("a migration existe e é idempotente", () => {
    expect(arquivos).toContain(MIGRATION);
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.caixa_movimentos/);
    // Rodar duas vezes no SQL Editor não pode quebrar: é assim que a migration
    // chega à produção (execução manual).
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(SQL.match(/DROP POLICY IF EXISTS/g)?.length).toBe(3);
  });

  it("tenant_id sai do JWT, é obrigatório e referencia tenants", () => {
    const bloco = recorte(SQL, "tenant_id");
    expect(bloco).toMatch(/uuid\s+NOT NULL DEFAULT public\.tenant_atual_id\(\)/);
    expect(bloco).toMatch(/REFERENCES public\.tenants\(id\)/);
  });

  it("tipo só aceita sangria e suprimento", () => {
    expect(SQL).toMatch(/ADD CONSTRAINT caixa_movimentos_tipo_check\s+CHECK \(tipo IN \('sangria', 'suprimento'\)\)/);
    // Dentro de um guard de existência — senão a segunda execução estoura.
    expect(SQL).toMatch(/conname = 'caixa_movimentos_tipo_check'/);
  });

  it("valor é numeric e sempre maior que zero", () => {
    expect(SQL).toMatch(/valor\s+numeric\s+NOT NULL/);
    expect(SQL).toMatch(/ADD CONSTRAINT caixa_movimentos_valor_check\s+CHECK \(valor > 0\)/);
    // O sinal mora no `tipo`. Um valor negativo com tipo 'sangria' somaria
    // onde deveria subtrair no `ajusteEsperadoDinheiro`.
    expect(SQL).not.toMatch(/CHECK \(valor >= 0\)/);
  });

  it("motivo e autor são obrigatórios; autorizado_por é anulável", () => {
    expect(SQL).toMatch(/motivo\s+text\s+NOT NULL/);
    expect(SQL).toMatch(/autor\s+text\s+NOT NULL/);
    // Sem autorização não há autorizador — anulável de propósito.
    expect(SQL).toMatch(/autorizado_por\s+text,/);
    expect(SQL).not.toMatch(/autorizado_por\s+text\s+NOT NULL/);
  });

  it("o índice casa o filtro que o fechamento faz de verdade", () => {
    expect(SQL).toMatch(
      /CREATE INDEX IF NOT EXISTS caixa_movimentos_sessao_idx\s+ON public\.caixa_movimentos \(tenant_id, created_at DESC\);/
    );
  });
});

describe("caixa_movimentos — RLS (F005)", () => {
  it("RLS está habilitada", () => {
    expect(SQL).toMatch(/ALTER TABLE public\.caixa_movimentos ENABLE ROW LEVEL SECURITY;/);
  });

  it("qualquer logado LÊ — quem fecha o caixa nem sempre é quem sangrou", () => {
    expect(SQL).toMatch(
      /CREATE POLICY caixa_movimentos_select_auth\s+ON public\.caixa_movimentos FOR SELECT\s+USING \(auth\.role\(\) = 'authenticated'\);/
    );
  });

  it("só admin, gerente e caixa REGISTRAM, pelo claim do JWT", () => {
    expect(SQL).toMatch(
      /CREATE POLICY caixa_movimentos_insert_operacao\s+ON public\.caixa_movimentos FOR INSERT\s+WITH CHECK \(\(auth\.jwt\(\) -> 'app_metadata' ->> 'gastro_role'\) IN \('admin', 'gerente', 'caixa'\)\);/
    );
    // O papel vem do JWT, não de uma consulta a `users` — uma linha de users
    // editada não vira permissão.
    expect(SQL).not.toMatch(/FROM public\.users/);
  });

  it("NÃO existe policy de UPDATE nem de DELETE — a ausência é a regra", () => {
    expect(SQL).not.toMatch(/CREATE POLICY[\s\S]*?caixa_movimentos FOR UPDATE/);
    expect(SQL).not.toMatch(/CREATE POLICY[\s\S]*?caixa_movimentos FOR DELETE/);

    // A única policy `FOR ALL` permitida é a RESTRICTIVE de tenant: uma
    // PERMISSIVE `FOR ALL` daria UPDATE e DELETE de contrabando.
    const permissivasForAll = [...SQL.matchAll(/CREATE POLICY (\w+)[\s\S]{0,120}?FOR ALL/g)]
      .filter((m) => !/AS RESTRICTIVE FOR ALL/.test(m[0]));
    expect(permissivasForAll).toEqual([]);
  });

  it("o isolamento por tenant é RESTRICTIVE nos dois lados", () => {
    expect(SQL).toMatch(
      /CREATE POLICY caixa_movimentos_tenant_isolation\s+ON public\.caixa_movimentos AS RESTRICTIVE FOR ALL\s+USING\s+\(tenant_id = public\.tenant_atual_id\(\)\)\s+WITH CHECK \(tenant_id = public\.tenant_atual_id\(\)\);/
    );
  });

  it("o cabeçalho avisa da execução manual e da conferência de RLS", () => {
    const cabecalho = ler(MIGRATION).slice(0, 2400);
    expect(cabecalho).toMatch(/EXECUÇÃO MANUAL: rode no SQL Editor do Supabase/);
    expect(cabecalho).toMatch(/RLS:/);
  });
});

describe("caixa_movimentos — o cliente JS não desmente o banco (F005)", () => {
  const lerFonte = (caminho) => readFileSync(join(RAIZ, caminho), "utf8").replace(/\r/g, "");

  it("os dois tipos da lib são os dois tipos do CHECK", () => {
    const lib = lerFonte("src/lib/caixa/caixaMovimentos.js");
    expect(lib).toMatch(/ROTULO_TIPO = \{ sangria: "Sangria", suprimento: "Suprimento" \}/);
    // Se um tipo novo aparecer na lib sem CHECK correspondente, o insert
    // estoura no balcão em vez de na revisão.
    const tiposDoCheck = /CHECK \(tipo IN \('sangria', 'suprimento'\)\)/.test(SQL);
    expect(tiposDoCheck).toBe(true);
  });

  it("a leitura especifica colunas — nada de select * em tabela de caixa", () => {
    const ctx = lerFonte("src/context/AppContext.jsx");
    const trechos = [...ctx.matchAll(/from\("caixa_movimentos"\)[\s\S]{0,200}/g)].map((m) => m[0]);
    expect(trechos.length).toBeGreaterThan(0);
    for (const trecho of trechos) {
      expect(trecho).not.toMatch(/select\("\*"\)/);
      expect(trecho).toMatch(/\.select\("[a-z_,]+"\)/);
    }
  });

  it("as colunas que o cliente grava existem na tabela", () => {
    const ctx = lerFonte("src/context/AppContext.jsx");
    const colunas = ["tipo", "valor", "motivo", "autor", "autorizado_por", "sessao_aberta_em"];
    for (const coluna of colunas) {
      expect(ctx, `${coluna} não aparece no insert do AppContext`).toContain(coluna);
      expect(SQL, `${coluna} não existe na migration`).toMatch(new RegExp(`^\\s+${coluna}\\s`, "m"));
    }
  });

  it("o cliente nunca tenta apagar nem editar um movimento", () => {
    const ctx = lerFonte("src/context/AppContext.jsx");
    const trechos = [...ctx.matchAll(/from\("caixa_movimentos"\)[\s\S]{0,200}/g)].map((m) => m[0]);
    for (const trecho of trechos) {
      expect(trecho).not.toMatch(/\.delete\(\)/);
      expect(trecho).not.toMatch(/\.update\(/);
    }
  });
});
