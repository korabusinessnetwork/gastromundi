import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// leads.js importa ./supabase (que exige VITE_* no import). Aqui só lemos
// uma constante, então mockamos o módulo — mesmo padrão de leads.test.js.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { COLUNAS_LEAD, ORIGEM_PADRAO } from "./leads";

/**
 * Guard da captura de leads da landing (20260920_leads.sql).
 *
 * `public.leads` é a única tabela do sistema em que **a chave pública
 * escreve**: qualquer visitante anônimo de kora.codes chama
 * `registrar_lead()`. E o que ela guarda é dado pessoal de terceiro —
 * nome, WhatsApp e e-mail de gente que ainda nem é cliente. As duas
 * coisas juntas fazem desta a superfície mais exposta do banco.
 *
 * O caminho de degradação é conhecido e barato. Alguém precisa que o
 * formulário "só grave direto" e cria uma policy de INSERT para anon;
 * ou precisa "conferir se está gravando" e abre um SELECT; ou limpa
 * teste e deixa um DELETE aberto. Qualquer um dos três transforma a
 * landing em API de leitura/escrita da lista de contatos — sem nada
 * quebrar visivelmente, porque a tela continua igual.
 *
 * O que este arquivo cobra:
 *
 *   (a) a migração existe e define as duas RPCs com os nomes de
 *       parâmetro que o front chama (contrato do supabase-js);
 *   (b) as duas são SECURITY DEFINER com search_path fixo — é o DEFINER
 *       que deixa o anônimo gravar numa tabela em que ele não tem
 *       permissão nenhuma;
 *   (c) o aceite (LGPD) barra ANTES de qualquer escrita, e a mesma
 *       regra está no CHECK da tabela: sem aceite, nem a função nem o
 *       banco aceitam;
 *   (d) `marcar_lead_atendido` é `is_super_admin()` ANTES do UPDATE;
 *   (e) RLS habilitada e as ÚNICAS policies são as duas de plataforma —
 *       nada de INSERT (o anônimo entra pela função) e nada de DELETE;
 *   (f) anon recebe EXECUTE só de `registrar_lead`, e o REVOKE da
 *       tabela vem ANTES dos GRANTs;
 *   (g) as colunas que o Console lê existem mesmo na tabela — nome
 *       errado aqui derruba a aba inteira com o banco saudável.
 *
 * Não há Postgres no CI: isto é conferência textual (patterns.md), e os
 * comentários `--` saem antes de conferir porque o cabeçalho da
 * migração CITA justamente as formas proibidas para explicar por que
 * elas não estão lá.
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
const MIGRACAO = "20260920_leads.sql";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/** Só o SQL que roda: sem comentário e sem `\r` (os arquivos são CRLF). */
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

/** Última migração que (re)define a captura — é ela que vale em produção. */
const definemRpc = arquivos
  .filter((n) =>
    /CREATE OR REPLACE FUNCTION public\.registrar_lead\(/.test(semComentarios(ler(n)))
  )
  .sort();

const ultima = definemRpc[definemRpc.length - 1];
const sql = ultima ? semComentarios(ler(ultima)) : "";

const CORPO_REGISTRAR = () =>
  recorte(sql, "CREATE OR REPLACE FUNCTION public.registrar_lead(", "$$;");
const CORPO_MARCAR = () =>
  recorte(sql, "CREATE OR REPLACE FUNCTION public.marcar_lead_atendido(", "$$;");

describe("Leads — guard da captura pública (20260920)", () => {
  it("a migração existe e define as RPCs com os parâmetros que o front chama", () => {
    expect(arquivos).toContain(MIGRACAO);
    expect(definemRpc).toContain(MIGRACAO);

    // Os nomes são contrato com o supabase-js: a chamada manda o objeto
    // por nome. Um rename silencioso vira 42883 no formulário — e o lead
    // se perde exatamente como se perdia antes desta migração existir.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.registrar_lead(",
      "RETURNS uuid"
    );
    for (const param of [
      "p_nome",
      "p_whatsapp",
      "p_email",
      "p_consentimento",
      "p_origem",
      "p_plano_total_centavos",
      "p_plano_modulos",
      "p_plano_addons",
    ]) {
      expect(cabecalho).toMatch(new RegExp(`\\b${param}\\b`));
    }

    const marcar = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.marcar_lead_atendido(",
      "RETURNS void"
    );
    for (const param of ["p_lead_id", "p_atendido", "p_por"]) {
      expect(marcar).toMatch(new RegExp(`\\b${param}\\b`));
    }

    // A origem que o front manda por padrão é a mesma que o banco assume.
    expect(cabecalho).toMatch(new RegExp(`DEFAULT '${ORIGEM_PADRAO}'`));
  });

  it("as duas funções são SECURITY DEFINER com search_path fixo", () => {
    // Sem o DEFINER, `registrar_lead` roda como anon — que não tem
    // permissão nenhuma na tabela — e o formulário volta a perder 100%
    // dos contatos, agora com erro de permissão em vez de silêncio.
    for (const corpo of [CORPO_REGISTRAR(), CORPO_MARCAR()]) {
      expect(corpo).toMatch(/LANGUAGE plpgsql/);
      expect(corpo).toMatch(/SECURITY DEFINER/);
      expect(corpo).toMatch(/SET search_path = public/);
    }
  });

  it("sem aceite não grava: a função barra antes de escrever", () => {
    const corpo = CORPO_REGISTRAR();

    // `IF NOT p_consentimento` seria furo: o parâmetro chega NULL quando
    // o front não manda, e `NOT NULL` é NULL, que não entra no IF.
    expect(corpo).toMatch(
      /IF p_consentimento IS NOT TRUE THEN\s+RAISE EXCEPTION/
    );

    // E barra ANTES de qualquer escrita — não adianta validar depois de
    // ter gravado.
    const iAceite = corpo.indexOf("p_consentimento IS NOT TRUE");
    const iUpdate = corpo.indexOf("UPDATE public.leads");
    const iInsert = corpo.indexOf("INSERT INTO public.leads");
    expect(iAceite).toBeGreaterThan(0);
    expect(iUpdate).toBeGreaterThan(iAceite);
    expect(iInsert).toBeGreaterThan(iAceite);
  });

  it("o aceite também é regra do banco, não só da função", () => {
    // A função é a porta de hoje. O CHECK é o que impede que a próxima
    // porta (um import, um script, uma segunda RPC) grave lead sem
    // aceite — a base do consentimento na LGPD é o registro, não a tela.
    expect(sql).toMatch(/CHECK \(consentimento\)/);
    expect(sql).toMatch(/consentimento\s+boolean\s+NOT NULL/);
  });

  it("só a plataforma marca lead como atendido, e a guarda vem antes do UPDATE", () => {
    const corpo = CORPO_MARCAR();

    // `IS NOT TRUE` e nunca `IF NOT`: é a lição da 20260730. Com
    // is_super_admin() devolvendo NULL, `IF NOT NULL` não entra no bloco
    // e a exceção é pulada — a guarda existe no arquivo e não guarda
    // nada. O superAdminGuard cobra isso em TODA migração; aqui fica
    // pinado também no arquivo que a violaria primeiro.
    expect(corpo).toMatch(/IF public\.is_super_admin\(\) IS NOT TRUE THEN\s+RAISE EXCEPTION/);
    expect(corpo).not.toMatch(/IF\s+NOT\s+(public\.)?is_super_admin\(\)/i);

    const iGate = corpo.indexOf("is_super_admin()");
    const iUpdate = corpo.indexOf("UPDATE public.leads");
    expect(iGate).toBeGreaterThan(0);
    expect(iUpdate).toBeGreaterThan(iGate);
  });

  it("RLS habilitada, e as únicas policies são as duas de plataforma", () => {
    expect(sql).toMatch(/ALTER TABLE public\.leads ENABLE ROW LEVEL SECURITY/);

    const policies = [...sql.matchAll(/CREATE POLICY\s+(\w+)\s+ON public\.leads\s+FOR (\w+)/g)]
      .map((m) => `${m[1]}:${m[2]}`)
      .sort();
    expect(policies).toEqual([
      "leads_select_plataforma:SELECT",
      "leads_update_plataforma:UPDATE",
    ]);

    // As duas exigem plataforma, na leitura e na escrita.
    expect(sql).toMatch(
      /CREATE POLICY leads_select_plataforma[\s\S]*?USING \(public\.is_super_admin\(\)\)/
    );
    expect(sql).toMatch(
      /CREATE POLICY leads_update_plataforma[\s\S]*?USING \(public\.is_super_admin\(\)\)\s+WITH CHECK \(public\.is_super_admin\(\)\)/
    );

    // Sem policy de INSERT: com RLS ligada e sem policy, o banco NEGA. É
    // isso que impede que a chave pública da landing insira linha crua —
    // ela entra por `registrar_lead()`, que valida, ou não entra.
    expect(sql).not.toMatch(/FOR INSERT/i);
    // Sem policy de DELETE: apagar lead é ato manual e deliberado (é
    // também como se atende um pedido de exclusão pela LGPD).
    expect(sql).not.toMatch(/FOR DELETE/i);
    expect(sql).not.toMatch(/FOR ALL/i);
  });

  it("anon executa só o registro, e os REVOKEs vêm antes dos GRANTs", () => {
    const iRevoke = sql.indexOf("REVOKE ALL ON public.leads FROM anon");
    const iGrant = sql.indexOf("GRANT EXECUTE");
    expect(iRevoke).toBeGreaterThan(0);
    expect(iGrant).toBeGreaterThan(iRevoke);

    // CREATE FUNCTION dá EXECUTE a PUBLIC por padrão, e anon está em
    // PUBLIC: sem o REVOKE, o GRANT nominal não RESTRINGE nada — só
    // repete o que já estava aberto. Os dois REVOKEs vêm antes de
    // qualquer GRANT, senão a janela existe de verdade entre as linhas.
    for (const fn of ["registrar_lead", "marcar_lead_atendido"]) {
      const i = sql.search(
        new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\b[\\s\\S]*?FROM PUBLIC`)
      );
      expect(i, `${fn} precisa de REVOKE EXECUTE ... FROM PUBLIC`).toBeGreaterThan(0);
      expect(i).toBeLessThan(iGrant);
    }

    // O anônimo grava pela função e não lê nada: nenhum GRANT de tabela.
    expect(sql).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+(TABLE\s+)?public\.leads/i);

    // E o botão do Console não é executável por quem não fez login.
    const grantMarcar = recorte(
      sql,
      "GRANT EXECUTE ON FUNCTION public.marcar_lead_atendido",
      ";"
    );
    expect(grantMarcar).toMatch(/TO authenticated/);
    expect(grantMarcar).not.toMatch(/\banon\b/);
  });

  it("as colunas que o Console lê existem na tabela", () => {
    // Pino contra divergência: `listarLeads` nomeia as colunas (dado
    // pessoal não sai em `select *`), e uma coluna inexistente faz o
    // PostgREST recusar a consulta inteira — a aba mostraria "não foi
    // possível ler os contatos" com o banco perfeitamente saudável.
    const tabela = recorte(sql, "CREATE TABLE IF NOT EXISTS public.leads (", "\n);");
    const declaradas = tabela
      .split("\n")
      .map((l) => l.trim().match(/^([a-z_]+)\s+(uuid|text|integer|boolean|timestamptz)/))
      .filter(Boolean)
      .map((m) => m[1]);

    const lidas = COLUNAS_LEAD.split(",").map((c) => c.trim());
    expect(lidas.length).toBeGreaterThan(0);
    for (const coluna of lidas) expect(declaradas).toContain(coluna);

    // Dado pessoal não sai em `select *` — nem por descuido depois.
    expect(lidas).not.toContain("*");
    expect(COLUNAS_LEAD).not.toMatch(/\*/);
  });

  it("é funil da Kora, não dado de estabelecimento: a tabela não tem tenant_id", () => {
    // Um lead ainda não é cliente de ninguém. Pôr `tenant_id` aqui
    // arrastaria a tabela para o isolamento por tenant (ADR-008) e a
    // captura anônima passaria a precisar de um tenant que não existe.
    const tabela = recorte(sql, "CREATE TABLE IF NOT EXISTS public.leads (", "\n);");
    expect(tabela).not.toMatch(/tenant_id/);
  });
});
