import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { MAX_ATTEMPTS, LOCKOUT_MS, JANELA_TENTATIVAS_MS } from "@/utils/session";

/**
 * Guard de regressão da TRAVA DE LOGIN NO SERVIDOR (20260920) — TD008.
 *
 * O defeito original: o bloqueio por tentativas era decidido inteiro no
 * navegador, com o contador em `localStorage`. Quem quer adivinhar a senha do
 * gerente não passa pela tela — chama a API do Auth direto, ou limpa o storage
 * entre as tentativas. Os "5 erros e 2 minutos" só valiam para quem já estava
 * se comportando.
 *
 * Não há Postgres no CI, então o que este arquivo garante é o TEXTO da
 * migração (mesmo instrumento de renomearTenantSqlGuard.test.js):
 *   (a) a migração existe e define a RPC com a assinatura que o front chama;
 *   (b) a senha é conferida com `crypt` contra `auth.users` — é isso que faz o
 *       contador andar por FALHA REAL, e não por o cliente avisar que errou;
 *   (c) senha CERTA passa e zera o contador, mesmo bloqueado. Sem isso a trava
 *       vira arma: username é público, e cinco erros de propósito deixariam o
 *       restaurante sem gerente no meio do almoço;
 *   (d) o retorno não conta nada além de `pode_tentar`/`segundos` — nem se a
 *       senha estava certa, nem se o e-mail existe, nem quantas tentativas
 *       restam;
 *   (e) os números batem com os da tela (5 / 15 min / 2 min);
 *   (f) a tabela de contagem nasce com RLS ligada (ela diz quem errou senha e
 *       quando) e sem policy — só a função definer a toca;
 *   (g) `anon` PODE executar, de propósito: isto roda antes de existir sessão.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim da
 * migração, que consulta pg_proc/pg_policies ao vivo — isto aqui não substitui
 * aquilo.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const CORRETIVA = "20260920_login_rate_limit_servidor.sql";
const ASSINATURA = "public.registrar_tentativa_login(text, text)";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/**
 * Linhas de SQL ativo — comentário `--` explicando o bug é permitido. Os
 * arquivos são CRLF: sem tirar o `\r` toda regex de várias linhas falha.
 */
function semComentarios(conteudo) {
  return conteudo
    .split(/\r?\n/)
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

const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

/** Última migração que (re)define a RPC — é ela que vale em produção. */
const definemRpc = arquivos
  .filter((n) =>
    /CREATE OR REPLACE FUNCTION public\.registrar_tentativa_login\(/.test(semComentarios(ler(n)))
  )
  .sort();

const ultima = definemRpc[definemRpc.length - 1];
const sql = ultima ? semComentarios(ler(ultima)) : "";

/** Corpo da função, sem o REVOKE/GRANT nem o autoteste do fim do arquivo. */
const corpo = ultima
  ? recorte(sql, "CREATE OR REPLACE FUNCTION public.registrar_tentativa_login(", "END;\n$$;")
  : "";

describe("Login — guard da trava de tentativas no servidor", () => {
  it("a migração existe e define a RPC com a assinatura que o front chama", () => {
    expect(arquivos).toContain(CORRETIVA);
    expect(definemRpc).toContain(CORRETIVA);

    // Os nomes dos parâmetros são contrato com o supabase-js: a chamada manda
    // { p_email, p_senha } por NOME. Um rename silencioso aqui devolve 42883
    // ("function does not exist") — e como o front falha ABERTO, ninguém
    // perceberia: a trava simplesmente deixaria de existir, em silêncio.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.registrar_tentativa_login(",
      "RETURNS jsonb"
    );
    const parametros = cabecalho
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^p_/.test(l));
    expect(parametros).toHaveLength(2);
    expect(parametros[0]).toMatch(/^p_email text,$/);
    expect(parametros[1]).toMatch(/^p_senha text$/);
  });

  it("roda como dona, com search_path fixo e alcançando auth/extensions", () => {
    // Sem DEFINER a função não lê `auth.users` nem escreve na tabela sob RLS.
    // Sem `auth` no search_path, `auth.users` até resolve pelo nome completo,
    // mas `crypt` (pgcrypto vive em `extensions`) não.
    expect(corpo).toMatch(/LANGUAGE plpgsql/);
    expect(corpo).toMatch(/SECURITY DEFINER/);
    expect(corpo).toMatch(/SET search_path = public, auth, extensions/);
    // Escreve no contador: STABLE aqui daria "read-only transaction".
    expect(corpo).toMatch(/\bVOLATILE\b/);
  });

  it("confere a senha DE VERDADE — é o que dá dente à trava", () => {
    // O caminho fácil (uma RPC "registrar_falha" que o cliente chama depois de
    // errar) é exatamente o furo do TD008: o atacante só não chama.
    expect(corpo).toMatch(/crypt\(p_senha, au\.encrypted_password\)/);
    expect(corpo).toMatch(/FROM auth\.users au/);
    expect(corpo).toMatch(/WHERE lower\(au\.email\) = v_email/);
  });

  it("senha CERTA passa e zera o contador, mesmo se houver bloqueio", () => {
    // Sem isto a trava vira negação de serviço contra o próprio cliente: o
    // username está no cartão de primeiro acesso e na boca da equipe inteira.
    const iCerta = corpo.indexOf("IF v_ok THEN");
    expect(iCerta).toBeGreaterThan(0);
    const ramo = recorte(corpo, "IF v_ok THEN", "END IF;");
    expect(ramo).toMatch(/DELETE FROM public\.login_tentativas WHERE email = v_email;/);
    expect(ramo).toMatch(/'pode_tentar', true/);

    // E vem ANTES de qualquer leitura do bloqueio: se o bloqueio fosse
    // consultado primeiro e barrasse, a senha certa levaria recusa.
    expect(corpo.indexOf("v_ate > now()")).toBeGreaterThan(iCerta);
  });

  it("não vira oráculo de senha: só devolve pode_tentar e segundos", () => {
    // Um "senha correta" no retorno faria desta RPC um segundo login — sem
    // sessão, sem log e fora das proteções do Auth. E devolver tentativas
    // restantes contaria ao atacante quanto orçamento ainda tem.
    const chaves = [...corpo.matchAll(/jsonb_build_object\(([^)]*)\)/g)]
      .flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((c) => c[1]));
    expect(chaves.length).toBeGreaterThanOrEqual(4);
    expect([...new Set(chaves)].sort()).toEqual(["pode_tentar", "segundos"]);

    // A senha não pode vazar por mensagem nenhuma, nem em erro.
    expect(corpo).not.toMatch(/RAISE[^\n]*p_senha/);
    // Nem ser gravada: a tabela guarda contagem, não credencial.
    expect(corpo).not.toMatch(/INSERT INTO public\.login_tentativas[^;]*p_senha/);
  });

  it("os números são os MESMOS que a tela promete", () => {
    // Divergir aqui faria a tela contar bolinhas de um orçamento que o
    // servidor não tem.
    const falhas = corpo.match(/c_max_falhas constant integer\s+:= (\d+);/);
    expect(falhas).not.toBeNull();
    expect(Number(falhas[1])).toBe(MAX_ATTEMPTS);

    const janela = corpo.match(/c_janela\s+constant interval := interval '(\d+) minutes';/);
    expect(janela).not.toBeNull();
    expect(Number(janela[1]) * 60 * 1000).toBe(JANELA_TENTATIVAS_MS);

    const bloqueio = corpo.match(/c_bloqueio\s+constant interval := interval '(\d+) minutes';/);
    expect(bloqueio).not.toBeNull();
    expect(Number(bloqueio[1]) * 60 * 1000).toBe(LOCKOUT_MS);
  });

  it("bloqueio não se estende a cada chute", () => {
    // Reescrever `bloqueado_ate` a cada tentativa deixaria o bloqueio eterno
    // enquanto o atacante insistisse — e quem errou uma vez e foi tomar água
    // nunca sairia.
    const jaBloqueado = recorte(
      corpo,
      "IF FOUND AND v_ate IS NOT NULL AND v_ate > now() THEN",
      "END IF;"
    );
    expect(jaBloqueado).toMatch(/RETURN jsonb_build_object\('pode_tentar', false/);
    expect(jaBloqueado).not.toMatch(/INSERT INTO|UPDATE public\.login_tentativas/);
  });

  it("a tabela de contagem nasce fechada: RLS ligada e sem policy", () => {
    // A linha diz qual e-mail errou senha e quando — é dado de segurança, não
    // de negócio. Nenhum papel do app precisa lê-la: só a função definer.
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.login_tentativas \(/);
    expect(sql).toMatch(/ALTER TABLE public\.login_tentativas ENABLE ROW LEVEL SECURITY;/);
    expect(sql).not.toMatch(/CREATE POLICY[^\n]*login_tentativas/);

    // A chave é o e-mail com namespace do tenant (usuario@slug.local): o
    // "matheus" de um restaurante não pode bloquear o do outro.
    const tabela = recorte(sql, "CREATE TABLE IF NOT EXISTS public.login_tentativas (", ");");
    expect(tabela).toMatch(/email\s+text\s+PRIMARY KEY/);
  });

  it("anon executa DE PROPÓSITO, e o REVOKE vem antes do GRANT", () => {
    // Login acontece antes de existir sessão. Sem `anon`, a RPC devolveria
    // 42501, o front cairia no fail-open e a trava não existiria — em
    // silêncio, que é o pior jeito de uma proteção sumir.
    const iRevoke = sql.indexOf(`REVOKE EXECUTE ON FUNCTION ${ASSINATURA} FROM PUBLIC`);
    const iGrant = sql.indexOf(`GRANT EXECUTE ON FUNCTION ${ASSINATURA} TO anon, authenticated`);
    expect(iRevoke).toBeGreaterThan(0);
    expect(iGrant).toBeGreaterThan(iRevoke);
    // E o REVOKE não pode tirar de anon aqui (a 20260802 tira de `anon` por
    // padrão; esta é exceção declarada, como `branding_por_slug`).
    expect(sql).not.toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.registrar_tentativa_login\(text, text\) FROM PUBLIC, anon/
    );
  });

  it("termina com autoteste vivo — o texto acima não prova produção", () => {
    const auto = sql.slice(sql.indexOf("DO $conf$"));
    expect(auto).toContain("to_regprocedure('public.registrar_tentativa_login(text, text)')");
    expect(auto).toContain("relrowsecurity");
    expect(auto).toContain("pg_policies");
    expect(auto).toContain("has_function_privilege('anon'");
    expect((auto.match(/RAISE EXCEPTION/g) || []).length).toBeGreaterThanOrEqual(8);
    expect(auto).toMatch(/RAISE NOTICE/);
  });
});
