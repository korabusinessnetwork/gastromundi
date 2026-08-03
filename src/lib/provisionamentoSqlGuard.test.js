import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard do texto de `provisionar_tenant` — a função que dá à luz um
 * estabelecimento novo.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * A função já foi recriada por sete migrations diferentes, e cada `CREATE OR
 * REPLACE` reescreve o corpo INTEIRO. Duas vezes um pedaço se perdeu no
 * caminho, e as duas passaram despercebidas por semanas:
 *
 *   - a `20260813` isolou as unidades de medida por tenant, semeou uma vez só
 *     sobre quem já existia e não tocou na função — todo estabelecimento
 *     criado depois nasceu sem unidade nenhuma, e a tela de Produtos não tem
 *     lista de reserva: os campos de unidade abrem vazios e o cliente não
 *     cadastra produto no primeiro dia;
 *   - a `20260908`, ao recriar a função para passar a criar a assinatura,
 *     copiou o corpo da `20260829` sem o seed dos grupos de categoria.
 *
 * Nenhum dos dois defeitos aparece no estabelecimento que já está rodando —
 * só no cliente novo, que é justamente o da venda. E nenhuma suíte pega:
 * o `vitest` não fala com o Postgres e o bloco de conferência da migration
 * só roda no SQL Editor.
 *
 * O QUE ELE GARANTE
 * Que a ÚLTIMA migration a definir `provisionar_tenant` — seja ela qual for,
 * hoje ou daqui a dez rodadas — ainda semeia tudo que um estabelecimento
 * precisa para funcionar no primeiro dia. Uma reescrita futura que esqueça
 * qualquer peça quebra este teste antes de chegar em produção.
 *
 * Mesmo instrumento dos outros `*SqlGuard.test.js`: compara texto, não
 * comportamento. Ele não sabe o que o banco tem — só o que o repositório diz.
 */
const RAIZ = join(__dirname, "../..");
const MIGRATIONS_DIR = join(RAIZ, "supabase/migrations");

/** Só o SQL que roda — comentário `--` explicando a regra é permitido. */
function semComentarios(conteudo) {
  return conteudo
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
}

const arquivos = readdirSync(MIGRATIONS_DIR)
  .filter((n) => n.endsWith(".sql"))
  .sort();

/**
 * A última migration (por ordem de nome, que é a de execução) que define
 * `provisionar_tenant`. É ela que vale no banco — as anteriores foram
 * sobrescritas.
 */
const DEFINIDORAS = arquivos.filter((nome) =>
  readFileSync(join(MIGRATIONS_DIR, nome), "utf8").includes(
    "FUNCTION public.provisionar_tenant"
  )
);
const ULTIMA = DEFINIDORAS[DEFINIDORAS.length - 1];

/** O corpo da função na última definidora, sem os comentários. */
function corpoDaFuncao() {
  const sql = semComentarios(
    readFileSync(join(MIGRATIONS_DIR, ULTIMA), "utf8")
  );
  const inicio = sql.indexOf("CREATE OR REPLACE FUNCTION public.provisionar_tenant");
  expect(inicio, `${ULTIMA} não tem CREATE OR REPLACE de provisionar_tenant`).toBeGreaterThan(-1);
  const fim = sql.indexOf("$$;", inicio);
  expect(fim, `${ULTIMA}: corpo de provisionar_tenant não fecha com $$;`).toBeGreaterThan(inicio);
  return sql.slice(inicio, fim);
}

const CORPO = corpoDaFuncao();

describe("provisionar_tenant — quem define", () => {
  it("existe pelo menos uma migration que define a função", () => {
    expect(DEFINIDORAS.length).toBeGreaterThan(0);
  });

  it("a definição que vale é a da migration de nome mais alto", () => {
    // Se este teste falhar, alguém criou uma migration nova que recria a
    // função — o que é legítimo. O que NÃO é legítimo é ela recriar sem os
    // seeds, e é isso que os blocos abaixo cobram do arquivo novo.
    expect(ULTIMA).toBe("20260917_provisionar_semeia_defaults.sql");
  });

  it("mantém a assinatura de 4 argumentos que o Console chama", () => {
    // Acrescentar parâmetro cria SOBRECARGA em vez de substituir, e a chamada
    // do Console vira ambígua (erro 42725).
    expect(CORPO).toMatch(/p_nome\s+text/);
    expect(CORPO).toMatch(/p_slug\s+text\s+DEFAULT NULL/);
    expect(CORPO).toMatch(/p_plano_codigo\s+text\s+DEFAULT/);
    expect(CORPO).toMatch(/p_tema\s+jsonb\s+DEFAULT/);
  });
});

describe("provisionar_tenant — a guarda de plataforma", () => {
  it("só a plataforma provisiona, e a checagem vem antes de qualquer escrita", () => {
    const posGuarda = CORPO.indexOf("is_super_admin() IS NOT TRUE");
    const posEscrita = CORPO.indexOf("INSERT INTO public.tenants");
    expect(posGuarda).toBeGreaterThan(-1);
    expect(posEscrita).toBeGreaterThan(-1);
    expect(posGuarda).toBeLessThan(posEscrita);
  });

  it("é SECURITY DEFINER com search_path fixo", () => {
    expect(CORPO).toContain("SECURITY DEFINER");
    expect(CORPO).toMatch(/SET search_path = public/);
  });
});

describe("provisionar_tenant — o estabelecimento nasce cobrável", () => {
  it("cria a assinatura no mesmo ato (regressão da 20260908 ao contrário)", () => {
    // Sem esta linha o estabelecimento nunca vence, nunca aparece no alerta
    // de validade do Console e nunca é cobrado.
    expect(CORPO).toContain("INSERT INTO public.assinaturas");
    expect(CORPO).toContain("ON CONFLICT (tenant_id) DO NOTHING");
  });
});

describe("provisionar_tenant — o estabelecimento nasce com catálogo", () => {
  it("semeia os grupos de categoria (perdidos na 20260908)", () => {
    // Cadastro de categoria exige grupo; sem estes o cliente trava antes de
    // criar a primeira categoria do cardápio.
    expect(CORPO).toContain("INSERT INTO public.grupos_categoria");
    for (const grupo of ["comida", "bebida", "cafe", "sobremesa"]) {
      expect(CORPO, `grupo ausente no seed: ${grupo}`).toContain(`'${grupo}'`);
    }
    expect(CORPO).toContain("ON CONFLICT (tenant_id, nome) DO NOTHING");
  });

  it("semeia as unidades de medida (nunca adicionadas pela 20260813)", () => {
    expect(CORPO).toContain("INSERT INTO public.unidades_medida");
  });

  it("semeia os três tipos de unidade, 8 de cada", () => {
    // A tela de Produtos separa os selects por tipo. Semear só um tipo
    // deixaria dois campos vazios — meio defeito é tão bloqueante quanto o
    // inteiro para quem está cadastrando o primeiro produto.
    const seed = CORPO.slice(CORPO.indexOf("INSERT INTO public.unidades_medida"));
    for (const tipo of ["estoque", "compra", "consumo"]) {
      const quantas = seed.split(`'${tipo}',`).length - 1;
      expect(quantas, `unidades do tipo ${tipo} no seed`).toBe(8);
    }
  });

  it("o seed é idempotente — reprovisionar não duplica unidade", () => {
    // `unidades_medida` não tem chave única, então a guarda é o NOT EXISTS
    // por (tenant_id, tipo, nome, abreviacao) — a mesma da 20260813.
    const seed = CORPO.slice(CORPO.indexOf("INSERT INTO public.unidades_medida"));
    expect(seed).toContain("WHERE NOT EXISTS");
    expect(seed).toMatch(/um\.tenant_id\s*=\s*v_tenant\.id/);
  });

  it("as unidades vão para o tenant recém-criado, não para o do JWT", () => {
    // `unidades_medida.tenant_id` tem DEFAULT tenant_atual_id(). Dentro de uma
    // SECURITY DEFINER chamada pela plataforma, esse default apontaria para o
    // tenant de quem chamou — ou seja, para lugar nenhum. O tenant_id tem de
    // ser explícito.
    const seed = CORPO.slice(CORPO.indexOf("INSERT INTO public.unidades_medida"));
    expect(seed).toContain("v_tenant.id");
    expect(seed).not.toContain("tenant_atual_id()");
  });
});

describe("provisionar_tenant — permissões", () => {
  it("a migration tira o EXECUTE de PUBLIC/anon e devolve só a authenticated", () => {
    const sql = semComentarios(readFileSync(join(MIGRATIONS_DIR, ULTIMA), "utf8"));
    const posRevoke = sql.indexOf("REVOKE EXECUTE ON FUNCTION public.provisionar_tenant");
    const posGrant = sql.indexOf("GRANT  EXECUTE ON FUNCTION public.provisionar_tenant");
    expect(posRevoke).toBeGreaterThan(-1);
    expect(posGrant).toBeGreaterThan(-1);
    // REVOKE antes do GRANT: na ordem inversa o REVOKE de PUBLIC também tira
    // o EXECUTE de `authenticated`, que herda de PUBLIC.
    expect(posRevoke).toBeLessThan(posGrant);
    expect(sql).toMatch(/FROM PUBLIC, anon/);
  });
});
