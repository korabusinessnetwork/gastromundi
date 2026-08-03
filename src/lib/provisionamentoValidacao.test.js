import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// console.js importa ./supabase (que exige VITE_* no import). Aqui ele entra
// só para COMPARAR a normalização de username das duas pontas — mesmo padrão
// de console.test.js.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// A validação da borda mora fora do index.ts justamente para poder ser
// importada aqui (o index.ts chama Deno.serve no escopo do módulo). O vitest
// transforma o .ts pelo esbuild; o arquivo não tem global de Deno nem import
// por URL, então atravessa a fronteira src/ ↔ supabase/ sem cerimônia.
import {
  MAX_ADMIN_NOME,
  MAX_NOME,
  MAX_SENHA,
  MAX_SLUG,
  MAX_USERNAME,
  MIN_SENHA,
  MIN_USERNAME,
  coordenada,
  normalizarSlug,
  normalizarUsername as normalizarUsernameBorda,
  validarEntradaProvisionamento,
} from "../../supabase/functions/_shared/validacaoProvisionamento.ts";

import {
  normalizarUsername as normalizarUsernameConsole,
  normalizarSlug as normalizarSlugConsole,
  MAX_SLUG as MAX_SLUG_CONSOLE,
  validarNovoEstabelecimento,
} from "./console";
import { sanitizeInput } from "@/utils/crypto";

const RAIZ = join(__dirname, "..", "..");
const BORDA = join(RAIZ, "supabase", "functions", "provisionar-estabelecimento", "index.ts");
const MODAL = join(RAIZ, "src", "components", "console", "NovoEstabelecimentoModal.jsx");

/** Corpo mínimo que PASSA — cada teste estraga um campo por vez. */
function corpoValido(extra = {}) {
  return {
    nome: "Casa Coffee",
    plano_codigo: "avancado",
    admin: { name: "Ana Souza", username: "ana", password: "segredo123" },
    ...extra,
  };
}

/** Corpo com o admin alterado, preservando o resto. */
function corpoComAdmin(admin) {
  return corpoValido({ admin: { ...corpoValido().admin, ...admin } });
}

// ════════════════════════════════════════════════════════════════════
// A) O buraco: username que a tela de login NÃO consegue reproduzir
// ════════════════════════════════════════════════════════════════════

describe("username aceito pela borda é sempre redigitável no login", () => {
  // A tela de login (AppContext.login) faz `sanitizeInput(username)` e monta
  // `${username}@${slug}.local`. sanitizeInput remove < > " ' ` e corta em 60.
  // Se a borda gravar um username que sanitizeInput mudaria, o e-mail que o
  // login monta NUNCA é o que está no Auth: o admin não entra, e a criação
  // respondeu sucesso.
  const HOSTIS = [
    'ana"lu',
    "ana'lu",
    "ana<lu",
    "ana>lu",
    "ana`lu",
    '<script>alert(1)</script>',
    "ana lu",
    "ANA.LU",
    "joão",
    "a".repeat(70),
    "  ana  ",
    "ana+lu",
    "ana@lu",
    "ana/lu",
    "ana\\lu",
    "ana%lu",
  ];

  it.each(HOSTIS)("%j: ou é recusado, ou sobrevive ao sanitizeInput do login", (bruto) => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ username: bruto }));
    if (r.erro) {
      expect(r.dados).toBeNull();
      return;
    }
    const gravado = r.dados.username;
    // A invariante. sanitizeInput não mexe em [a-z0-9._-] e corta em 60 > 30.
    expect(sanitizeInput(gravado)).toBe(gravado);
    expect(gravado).toMatch(/^[a-z0-9._-]+$/);
    expect(gravado.length).toBeLessThanOrEqual(MAX_USERNAME);
  });

  it("aspas e sinais de maior/menor não chegam ao banco", () => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ username: 'an"a<b>' }));
    expect(r.erro).toBeNull();
    expect(r.dados.username).toBe("anab");
  });

  it("username com 70 caracteres é RECUSADO, não cortado em silêncio", () => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ username: "a".repeat(70) }));
    expect(r.dados).toBeNull();
    expect(r.erro).toContain(String(MAX_USERNAME));
    expect(r.erro).toMatch(/máximo/i);
  });

  it("username que sobra vazio depois de normalizar é recusado com frase em português", () => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ username: "!!!" }));
    expect(r.dados).toBeNull();
    expect(r.erro).toMatch(/usuário de acesso/i);
    expect(r.erro).not.toMatch(/username|password|invalid/i);
  });

  it("username com menos de 3 caracteres é recusado (mesma regra do Console)", () => {
    expect(validarEntradaProvisionamento(corpoComAdmin({ username: "ab" })).erro)
      .toContain(String(MIN_USERNAME));
    expect(validarEntradaProvisionamento(corpoComAdmin({ username: "abc" })).erro).toBeNull();
  });

  it("username ausente ou não-string é recusado, nunca coagido", () => {
    // String(false) é "false" e String(0) é "0" — sem a guarda de tipo, um
    // corpo com `"username": false` criava um admin de username "false".
    for (const v of [undefined, null, 0, false, true, {}, [], 12345]) {
      const r = validarEntradaProvisionamento(corpoComAdmin({ username: v }));
      expect(r.dados).toBeNull();
      expect(typeof r.erro).toBe("string");
    }
  });

  it("nome e nome do admin também não aceitam não-texto coagido", () => {
    for (const v of [false, 0, true, 42, {}, []]) {
      expect(validarEntradaProvisionamento(corpoValido({ nome: v })).dados).toBeNull();
      expect(validarEntradaProvisionamento(corpoComAdmin({ name: v })).dados).toBeNull();
    }
  });

  it("plano não-texto cai no padrão em vez de virar '42'", () => {
    expect(validarEntradaProvisionamento(corpoValido({ plano_codigo: 42 })).dados.planoCodigo)
      .toBe("avancado");
  });

  it("slug não-texto é ignorado e o slug sai do nome", () => {
    expect(validarEntradaProvisionamento(corpoValido({ slug: 42 })).dados.slug).toBe("casacoffee");
    expect(validarEntradaProvisionamento(corpoValido({ slug: false })).dados.slug).toBe("casacoffee");
  });
});

describe("a normalização da borda não divergiu da do Console", () => {
  // Não há como importar src/lib/console.js dentro da Edge Function (o deploy
  // só empacota a pasta da função e _shared/), então a regra existe duas
  // vezes. Este teste é o que impede as duas de andarem em direções opostas.
  const ENTRADAS = [
    "  João Silva ",
    "Ação",
    "münchen",
    "bar.do_zé-01!@#",
    "ANA.LU",
    'an"a<b>',
    "ana lu",
    "a".repeat(70),
    "!!!",
    "",
    null,
    undefined,
    "ç",
    "user_1-2.3",
  ];

  it.each(ENTRADAS)("%j normaliza igual nas duas pontas", (entrada) => {
    expect(normalizarUsernameBorda(entrada)).toBe(normalizarUsernameConsole(entrada));
  });

  // Mesma armadilha, agora com o SLUG (CONSOLE-UX 19): desde que o Console
  // passou a mostrar o endereço antes de criar, a prévia na tela e o que o
  // servidor grava têm de ser a mesma string — senão a tela promete
  // "bardoze" e o banco guarda outra coisa.
  it.each(ENTRADAS)("%j vira o mesmo slug nas duas pontas", (entrada) => {
    expect(normalizarSlug(entrada)).toBe(normalizarSlugConsole(entrada));
  });
});

// ════════════════════════════════════════════════════════════════════
// B) Senha: a borda não tinha mínimo nenhum
// ════════════════════════════════════════════════════════════════════

describe("senha do admin", () => {
  it("senha de 1 caractere é recusada pela borda", () => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ password: "x" }));
    expect(r.dados).toBeNull();
    expect(r.erro).toContain(String(MIN_SENHA));
  });

  it(`${MIN_SENHA} caracteres passam; ${MIN_SENHA - 1} não`, () => {
    expect(validarEntradaProvisionamento(corpoComAdmin({ password: "a".repeat(MIN_SENHA) })).erro).toBeNull();
    expect(validarEntradaProvisionamento(corpoComAdmin({ password: "a".repeat(MIN_SENHA - 1) })).erro)
      .toMatch(/ao menos/i);
  });

  it("senha vazia ou não-string é recusada", () => {
    for (const v of ["", undefined, null, 123456, {}]) {
      const r = validarEntradaProvisionamento(corpoComAdmin({ password: v }));
      expect(r.dados).toBeNull();
      expect(r.erro).toMatch(/senha/i);
    }
  });

  it(`senha maior que ${MAX_SENHA} é recusada`, () => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ password: "a".repeat(MAX_SENHA + 1) }));
    expect(r.dados).toBeNull();
    expect(r.erro).toContain(String(MAX_SENHA));
  });

  it("a senha não é alterada quando passa (nada de trim que quebraria o login)", () => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ password: "  com espaço  " }));
    expect(r.erro).toBeNull();
    expect(r.dados.password).toBe("  com espaço  ");
  });
});

// ════════════════════════════════════════════════════════════════════
// C) Nomes e slug: texto sem limite chegava ao banco (coluna text)
// ════════════════════════════════════════════════════════════════════

describe("nome do estabelecimento e do admin", () => {
  it("nome vazio ou só espaços é recusado", () => {
    for (const v of ["", "   ", undefined, null]) {
      const r = validarEntradaProvisionamento(corpoValido({ nome: v }));
      expect(r.dados).toBeNull();
      expect(r.erro).toMatch(/nome do estabelecimento/i);
    }
  });

  it(`nome com ${MAX_NOME + 1} caracteres é recusado (a coluna é text, aceitaria 10 mil)`, () => {
    const r = validarEntradaProvisionamento(corpoValido({ nome: "a".repeat(MAX_NOME + 1) }));
    expect(r.dados).toBeNull();
    expect(r.erro).toContain(String(MAX_NOME));
  });

  it(`nome com exatamente ${MAX_NOME} caracteres passa`, () => {
    expect(validarEntradaProvisionamento(corpoValido({ nome: "a".repeat(MAX_NOME) })).erro).toBeNull();
  });

  it("nome é aparado nas pontas", () => {
    expect(validarEntradaProvisionamento(corpoValido({ nome: "  Casa Coffee  " })).dados.nome)
      .toBe("Casa Coffee");
  });

  it(`nome do admin com ${MAX_ADMIN_NOME + 1} caracteres é recusado`, () => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ name: "a".repeat(MAX_ADMIN_NOME + 1) }));
    expect(r.dados).toBeNull();
    expect(r.erro).toContain(String(MAX_ADMIN_NOME));
  });

  it("nome do admin vazio é recusado", () => {
    const r = validarEntradaProvisionamento(corpoComAdmin({ name: "   " }));
    expect(r.dados).toBeNull();
    expect(r.erro).toMatch(/nome do admin/i);
  });
});

describe("slug", () => {
  it("é derivado do nome quando o corpo não manda nenhum", () => {
    expect(validarEntradaProvisionamento(corpoValido({ nome: "Casa Coffee" })).dados.slug)
      .toBe("casacoffee");
  });

  it("usa a mesma regra de slugify_tenant: sem acento, minúsculo, só a-z0-9", () => {
    expect(normalizarSlug("Café Açaí 22!")).toBe("cafeacai22");
    expect(normalizarSlug("  MÜNCHEN  ")).toBe("munchen");
  });

  it(`nunca passa de ${MAX_SLUG} caracteres (rótulo de subdomínio tem teto de 63)`, () => {
    const nomeLongo = "a".repeat(MAX_NOME); // maior nome aceito, todo alfanumérico
    const r = validarEntradaProvisionamento(corpoValido({ nome: nomeLongo }));
    expect(r.erro).toBeNull();
    expect(r.dados.slug.length).toBeLessThanOrEqual(MAX_SLUG);
  });

  it("slug pedido explicitamente também é normalizado e cortado", () => {
    const r = validarEntradaProvisionamento(corpoValido({ slug: "Casa Coffee!!" }));
    expect(r.dados.slug).toBe("casacoffee");
    const r2 = validarEntradaProvisionamento(corpoValido({ slug: "z".repeat(200) }));
    expect(r2.dados.slug.length).toBe(MAX_SLUG);
  });

  it("nome sem nenhum caractere aproveitável devolve slug null (a RPC cai no fallback dela)", () => {
    const r = validarEntradaProvisionamento(corpoValido({ nome: "!!! ###" }));
    expect(r.erro).toBeNull();
    expect(r.dados.slug).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// D) Coordenadas: Number(null) é 0, e 0 passava em qualquer faixa
// ════════════════════════════════════════════════════════════════════

describe("coordenada da origem do delivery", () => {
  it("null, undefined, string vazia e booleano NÃO valem zero", () => {
    for (const v of [null, undefined, "", "   ", false, true, [], {}]) {
      expect(coordenada(v, 90)).toBeNull();
    }
  });

  it("aceita número dentro da faixa, inclusive negativo e zero explícito", () => {
    expect(coordenada(-23.5505, 90)).toBe(-23.5505);
    expect(coordenada(0, 90)).toBe(0);
    expect(coordenada(90, 90)).toBe(90);
    expect(coordenada(-180, 180)).toBe(-180);
  });

  it("recusa fora da faixa, NaN e infinito", () => {
    expect(coordenada(91, 90)).toBeNull();
    expect(coordenada(-90.1, 90)).toBeNull();
    expect(coordenada(NaN, 90)).toBeNull();
    expect(coordenada(Infinity, 90)).toBeNull();
    expect(coordenada(181, 180)).toBeNull();
  });

  it("aceita texto numérico (o corpo vem de JSON de terceiro), recusa texto não numérico", () => {
    expect(coordenada("-23.5505", 90)).toBe(-23.5505);
    expect(coordenada("0", 90)).toBe(0);
    expect(coordenada("-23,5505", 90)).toBeNull(); // vírgula não é decimal em JSON
    expect(coordenada("abc", 90)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// E) Caminho felizes e corpo estranho
// ════════════════════════════════════════════════════════════════════

describe("caminho felizes", () => {
  it("corpo válido devolve tudo normalizado, sem erro", () => {
    const r = validarEntradaProvisionamento({
      nome: "  Casa Coffee  ",
      plano_codigo: " alto ",
      tema: { primary: "#f00" },
      admin: { name: "  Ana Souza ", username: "  Ana.Souza ", password: "segredo123" },
    });
    expect(r.erro).toBeNull();
    expect(r.dados).toEqual({
      nome: "Casa Coffee",
      slug: "casacoffee",
      planoCodigo: "alto",
      tema: { primary: "#f00" },
      username: "ana.souza",
      password: "segredo123",
      adminName: "Ana Souza",
    });
  });

  it("plano ausente ou em branco cai no padrão 'avancado' (comportamento de antes)", () => {
    expect(validarEntradaProvisionamento(corpoValido({ plano_codigo: undefined })).dados.planoCodigo)
      .toBe("avancado");
    expect(validarEntradaProvisionamento(corpoValido({ plano_codigo: "   " })).dados.planoCodigo)
      .toBe("avancado");
  });

  it("tema ausente vira objeto vazio", () => {
    expect(validarEntradaProvisionamento(corpoValido()).dados.tema).toEqual({});
  });

  it("corpo nulo, array ou primitivo é recusado sem lançar", () => {
    for (const v of [null, undefined, [], "texto", 42, true]) {
      const r = validarEntradaProvisionamento(v);
      expect(r.dados).toBeNull();
      expect(typeof r.erro).toBe("string");
    }
  });

  it("admin ausente ou não-objeto é recusado sem lançar", () => {
    for (const v of [undefined, null, "ana", 42, []]) {
      const r = validarEntradaProvisionamento(corpoValido({ admin: v }));
      expect(r.dados).toBeNull();
      expect(typeof r.erro).toBe("string");
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// F) A função de borda realmente usa a validação
// ════════════════════════════════════════════════════════════════════

describe("provisionar-estabelecimento/index.ts está ligado na validação", () => {
  const borda = readFileSync(BORDA, "utf8");

  it("importa a validação de _shared", () => {
    expect(borda).toMatch(
      /import \{[^}]*validarEntradaProvisionamento[^}]*\} from "\.\.\/_shared\/validacaoProvisionamento\.ts"/
    );
    expect(borda).toMatch(/import \{[^}]*coordenada[^}]*\} from "\.\.\/_shared\/validacaoProvisionamento\.ts"/);
  });

  it("chama validarEntradaProvisionamento e devolve 400 quando ela recusa", () => {
    expect(borda).toMatch(/const validacao = validarEntradaProvisionamento\(body\);/);
    expect(borda).toMatch(/if \(validacao\.erro \|\| !validacao\.dados\)/);
    expect(borda).toMatch(/return json\(\{ error: validacao\.erro \?\? "Corpo inválido\." \}, 400\);/);
    expect(borda).toMatch(/= validacao\.dados;/);
  });

  it("não sobrou a validação frouxa antiga", () => {
    // `!username || !password` aceitava senha de 1 caractere e username com
    // qualquer caractere; `(admin.username ?? "").trim().toLowerCase()` era a
    // normalização que a tela de login não consegue reproduzir.
    expect(borda).not.toMatch(/!username \|\| !password/);
    expect(borda).not.toMatch(/admin\.username \?\? ""/);
    expect(borda).not.toMatch(/username e password do admin/);
  });

  it("não sobrou Number() cru nas coordenadas do delivery", () => {
    expect(borda).not.toMatch(/Number\(delivery\?\.origem_lat\)/);
    expect(borda).not.toMatch(/Number\(delivery\?\.origem_lng\)/);
    expect(borda).toMatch(/const lat = coordenada\(delivery\?\.origem_lat, 90\);/);
    expect(borda).toMatch(/const lng = coordenada\(delivery\?\.origem_lng, 180\);/);
    expect(borda).toMatch(/const temCoord = lat !== null && lng !== null;/);
  });

  it("manda para a RPC o slug já normalizado pela validação", () => {
    expect(borda).toMatch(/p_slug: slug,/);
    expect(borda).not.toMatch(/p_slug: slug \|\| null/);
  });
});

describe("os limites da borda estão amarrados a uma fonte independente", () => {
  // Sem esta amarração, mudar MAX_NOME de 80 para 100000 não quebraria nada:
  // os testes acima escrevem `"a".repeat(MAX_NOME + 1)`, então a asserção
  // andaria junto com a constante. O teto de cada campo tem uma fonte de
  // verdade fora deste módulo — o `maxLength` que a tela do Console usa. Se os
  // dois divergirem, a tela deixa digitar o que a borda recusa (ou o
  // contrário) e o operador não entende por quê.
  const modal = readFileSync(MODAL, "utf8");

  const maxLengthDoCampo = (campo) => {
    const depois = modal.split(`value={${campo}}`)[1];
    if (depois === undefined) return null;
    const achado = /maxLength=\{(\d+)\}/.exec(depois.slice(0, 400));
    return achado ? Number(achado[1]) : null;
  };

  it.each([
    ["nome", () => MAX_NOME],
    ["adminNome", () => MAX_ADMIN_NOME],
    ["adminUsername", () => MAX_USERNAME],
    ["adminPassword", () => MAX_SENHA],
  ])("o teto de %s é o mesmo maxLength que a tela do Console impõe", (campo, teto) => {
    const doModal = maxLengthDoCampo(campo);
    expect(doModal).not.toBeNull();
    expect(teto()).toBe(doModal);
  });

  it("os mínimos são os mesmos que o Console já cobrava", () => {
    // `validarNovoEstabelecimento` (src/lib/console.js) é a validação da tela.
    // A borda não pode ser MAIS permissiva que ela: um username ou senha que a
    // tela recusa não deve nascer por outro caminho.
    const base = {
      nome: "Casa Coffee", slug: "casacoffee", planoCodigo: "avancado", adminNome: "Ana",
    };
    const consoleAceita = (usuario, senha) =>
      validarNovoEstabelecimento({ ...base, adminUsername: usuario, adminPassword: senha }).ok;

    expect(consoleAceita("a".repeat(MIN_USERNAME), "a".repeat(MIN_SENHA))).toBe(true);
    expect(consoleAceita("a".repeat(MIN_USERNAME - 1), "a".repeat(MIN_SENHA))).toBe(false);
    expect(consoleAceita("a".repeat(MIN_USERNAME), "a".repeat(MIN_SENHA - 1))).toBe(false);
  });

  it("o slug cabe num rótulo de subdomínio mesmo com sufixo de unicidade", () => {
    // RFC 1035: rótulo de DNS tem no máximo 63 caracteres. A RPC
    // provisionar_tenant acrescenta um sufixo numérico quando o slug colide.
    expect(MAX_SLUG + "999".length).toBeLessThanOrEqual(63);
    // E o corte tem de valer de verdade: nome comprido não gera slug comprido.
    expect(normalizarSlug("a".repeat(500)).length).toBe(MAX_SLUG);
    // O campo da tela corta no mesmo ponto (CONSOLE-UX 19).
    expect(MAX_SLUG_CONSOLE).toBe(MAX_SLUG);
  });
});
