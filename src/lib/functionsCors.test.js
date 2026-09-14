import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  CABECALHOS_FIXOS,
  lerOrigensPermitidas,
  montarCorsHeaders,
  origemPermitida,
} from "../../supabase/functions/_shared/cors.ts";

/**
 * As 9 Edge Functions respondiam `Access-Control-Allow-Origin: "*"`.
 *
 * Isso nunca foi CSRF, e vale dizer por quê para ninguém "consertar" a coisa
 * errada depois: a autorização destas funções vai no cabeçalho
 * `Authorization`, que o navegador NÃO manda sozinho para outra origem, e
 * quem tem o token na mão chama por curl, onde CORS não existe.
 *
 * O que o curinga custava é o raio de alcance de um token já vazado: com "*",
 * uma página qualquer aberta no navegador do caixa podia usar o token direto
 * dali e LER a resposta. Com a origem declarada, o navegador recusa a leitura.
 *
 * Duas metades, instrumentos diferentes, mesma divisão de
 * `functionsGuardaEntrada.test.js`:
 *
 *   (A) COMPORTAMENTO, `_shared/cors.ts` é puro e roda aqui.
 *   (B) TEXTO, os `index.ts` chamam `Deno.serve` no topo e importam de URL,
 *       então nenhum teste consegue carregá-los. Para a fiação, o instrumento
 *       é o dos outros guards do repositório: ler o arquivo e afirmar sobre o
 *       que está escrito nele.
 */

const DIR_FUNCTIONS = join(__dirname, "..", "..", "supabase", "functions");

const FUNCTIONS = readdirSync(DIR_FUNCTIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared")
  .map((d) => d.name);

const fonte = (nome) => readFileSync(join(DIR_FUNCTIONS, nome, "index.ts"), "utf8");

// ── (A) Comportamento ───────────────────────────────────────────────

describe("lerOrigensPermitidas", () => {
  it("sem configuração devolve null, que é o curinga de hoje", () => {
    expect(lerOrigensPermitidas(undefined)).toBeNull();
    expect(lerOrigensPermitidas(null)).toBeNull();
    expect(lerOrigensPermitidas("")).toBeNull();
    expect(lerOrigensPermitidas("   ")).toBeNull();
    expect(lerOrigensPermitidas(",  , ")).toBeNull();
  });

  it("separa por vírgula, tira espaço em volta e barra no fim", () => {
    expect(lerOrigensPermitidas("https://a.com/, https://b.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });
});

describe("origemPermitida", () => {
  it("sem lista configurada, qualquer origem passa (curinga)", () => {
    expect(origemPermitida("https://qualquer.com", null)).toBe(true);
    expect(origemPermitida(null, null)).toBe(true);
  });

  it("casa origem exata e recusa o resto", () => {
    const lista = ["https://caixa.gastromundi.com.br"];
    expect(origemPermitida("https://caixa.gastromundi.com.br", lista)).toBe(true);
    expect(origemPermitida("https://outro.gastromundi.com.br", lista)).toBe(false);
    expect(origemPermitida("https://evil.com", lista)).toBe(false);
  });

  it("requisição sem Origin não passa quando há lista", () => {
    // Chamada fora do navegador não manda Origin. Ela não é barrada por
    // isso (CORS não é autenticação): só não recebe o cabeçalho de volta.
    expect(origemPermitida(null, ["https://a.com"])).toBe(false);
    expect(origemPermitida("", ["https://a.com"])).toBe(false);
  });

  it("curinga de subdomínio vale para o apex e para qualquer nível", () => {
    const lista = ["https://*.gastromundi.com.br"];
    expect(origemPermitida("https://gastromundi.com.br", lista)).toBe(true);
    expect(origemPermitida("https://loja.gastromundi.com.br", lista)).toBe(true);
    expect(origemPermitida("https://console.gastromundi.com.br", lista)).toBe(true);
    expect(origemPermitida("https://a.b.gastromundi.com.br", lista)).toBe(true);
  });

  it("domínio que só TERMINA parecido não passa (o ponto é obrigatório)", () => {
    // O erro clássico deste tipo de regra: `endsWith("gastromundi.com.br")`
    // deixaria `evilgastromundi.com.br`, que qualquer um registra, entrar.
    const lista = ["https://*.gastromundi.com.br"];
    expect(origemPermitida("https://evilgastromundi.com.br", lista)).toBe(false);
    expect(origemPermitida("https://gastromundi.com.br.evil.com", lista)).toBe(false);
  });

  it("o esquema faz parte da comparação", () => {
    const lista = ["https://*.gastromundi.com.br"];
    expect(origemPermitida("http://loja.gastromundi.com.br", lista)).toBe(false);
  });

  it("compara sem diferenciar maiúscula, como o host de verdade", () => {
    expect(origemPermitida("https://LOJA.Gastromundi.com.br", ["https://*.gastromundi.com.br"])).toBe(true);
  });
});

describe("montarCorsHeaders", () => {
  it("sem configuração devolve o curinga, igual a hoje", () => {
    const h = montarCorsHeaders("https://qualquer.com", null);
    expect(h["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("origem permitida volta ecoada, nunca o curinga", () => {
    const h = montarCorsHeaders("https://loja.gastromundi.com.br", ["https://*.gastromundi.com.br"]);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://loja.gastromundi.com.br");
  });

  it("origem recusada sai SEM o cabeçalho, em vez de com valor errado", () => {
    const h = montarCorsHeaders("https://evil.com", ["https://*.gastromundi.com.br"]);
    expect(h).not.toHaveProperty("Access-Control-Allow-Origin");
  });

  it("sempre manda Vary: Origin, senão um cache anula o controle", () => {
    expect(montarCorsHeaders("https://a.com", null).Vary).toBe("Origin");
    expect(montarCorsHeaders("https://evil.com", ["https://a.com"]).Vary).toBe("Origin");
    expect(CABECALHOS_FIXOS.Vary).toBe("Origin");
  });

  it("mantém o Allow-Headers que o app já usa", () => {
    const h = montarCorsHeaders("https://a.com", null);
    expect(h["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(h["Access-Control-Allow-Headers"]).toContain("content-type");
  });
});

// ── (B) Fiação nas functions ────────────────────────────────────────

describe("as Edge Functions estão fiadas no helper", () => {
  it("existe pelo menos uma function para conferir", () => {
    expect(FUNCTIONS.length).toBeGreaterThan(0);
  });

  it.each(FUNCTIONS)("%s importa o helper de CORS", (nome) => {
    expect(fonte(nome)).toContain('from "../_shared/cors.ts"');
  });

  it.each(FUNCTIONS)("%s calcula o CORS por requisição, com a Origin recebida", (nome) => {
    expect(fonte(nome)).toContain('montarCorsHeaders(req.headers.get("Origin"), ORIGENS_PERMITIDAS)');
  });

  it.each(FUNCTIONS)("%s não tem mais o curinga escrito no código", (nome) => {
    expect(fonte(nome)).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it.each(FUNCTIONS)("%s lê as origens da configuração, não do código", (nome) => {
    expect(fonte(nome)).toContain('lerOrigensPermitidas(Deno.env.get("ORIGENS_PERMITIDAS"))');
  });
});
