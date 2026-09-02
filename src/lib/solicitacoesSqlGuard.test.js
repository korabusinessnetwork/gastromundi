import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard da migração 20260926 — cadastro de conta feito no site.
 *
 * A tela `/criar-conta` roda com a chave ANON: qualquer pessoa na
 * internet pode chamar o que estiver liberado ali. O desenho combinado
 * (o mesmo de `leads` e do delivery público) é: tabela fechada, uma RPC
 * SECURITY DEFINER como única porta, freio de abuso dentro dela, e a
 * decisão (aprovar/recusar) guardada por `is_super_admin()`.
 *
 * Não há Postgres no CI, então o que se garante aqui é o TEXTO da
 * migração — mesmo instrumento dos outros guards do projeto:
 *   (a) ela existe e roda depois do que precisa estar de pé;
 *   (b) a tabela nasce com RLS ligada e SEM policy de escrita;
 *   (c) o anon não recebe GRANT nenhum sobre a tabela;
 *   (d) a RPC pública é SECURITY DEFINER com search_path fixo;
 *   (e) a RPC pública tem os dois freios de abuso;
 *   (f) a RPC pública recusa endereço reservado / já em uso;
 *   (g) a RPC de decisão exige plataforma ANTES de qualquer escrita;
 *   (h) o anon NÃO alcança a RPC de decisão;
 *   (i) nenhuma senha é recebida nem guardada.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o SELECT de conferência
 * no fim da migração, que consulta os privilégios ao vivo — isso este
 * teste não substitui.
 */
const RAIZ = join(__dirname, "../..");
const MIGRATIONS_DIR = join(RAIZ, "supabase/migrations");
const MIGRACAO = "20260926_solicitacoes_conta.sql";
const SLUG_RESERVADO = "20260803_reservar_slug_console.sql";
const SLUGIFY = "20260741_provisionar_tenant_slug.sql";

const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

/** Linhas de SQL ativo — comentário `--` explicando o porquê é permitido. */
const ativo = sql
  .split("\n")
  .filter((linha) => !linha.trim().startsWith("--"))
  .join("\n");

/** O corpo de uma função dentro da migração, do cabeçalho até a próxima. */
function corpoDaFuncao(nome) {
  const marcas = [...ativo.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\b/g)];
  const i = marcas.findIndex((m) => m[1] === nome);
  expect(i, `função ${nome} não existe na migração`).toBeGreaterThanOrEqual(0);
  const fim = i + 1 < marcas.length ? marcas[i + 1].index : ativo.length;
  return ativo.slice(marcas[i].index, fim);
}

describe("Cadastro de conta pelo site — guard da 20260926", () => {
  it("(a) a migração existe e roda depois do que ela usa", () => {
    expect(arquivos).toContain(MIGRACAO);
    // `slugify_tenant` e `slug_reservado` são chamadas pela RPC: sem elas
    // aplicadas antes, a migração não sobe.
    expect(arquivos.filter((n) => n < MIGRACAO)).toEqual(
      expect.arrayContaining([SLUG_RESERVADO, SLUGIFY])
    );
  });

  it("(b) a tabela nasce com RLS ligada e sem policy de escrita", () => {
    expect(ativo).toMatch(/ALTER TABLE public\.solicitacoes_conta ENABLE ROW LEVEL SECURITY/);
    expect(ativo).toMatch(/ALTER TABLE public\.solicitacoes_conta FORCE ROW LEVEL SECURITY/);

    // Só a leitura da plataforma. Qualquer FOR INSERT/UPDATE/DELETE aqui
    // seria uma segunda porta, fora da RPC que valida.
    const policies = [...ativo.matchAll(/CREATE POLICY [a-z_]+ ON public\.solicitacoes_conta\s+FOR (\w+)/g)];
    expect(policies.map((p) => p[1])).toEqual(["SELECT"]);
    expect(ativo).toMatch(/USING \(public\.is_super_admin\(\)\)/);
  });

  it("(c) o anon não recebe privilégio nenhum sobre a tabela", () => {
    expect(ativo).toMatch(/REVOKE ALL ON TABLE public\.solicitacoes_conta FROM anon/);
    // O único GRANT de tabela é o SELECT do authenticated (a RLS filtra).
    const grants = [...ativo.matchAll(/GRANT ([A-Z, ]+) ON TABLE public\.solicitacoes_conta TO ([a-z, ]+);/g)];
    expect(grants).toHaveLength(1);
    expect(grants[0][1].trim()).toBe("SELECT");
    expect(grants[0][2]).not.toMatch(/anon/);
  });

  it("(d) a porta pública é SECURITY DEFINER com search_path fixo", () => {
    const corpo = corpoDaFuncao("registrar_solicitacao_conta");
    expect(corpo).toMatch(/SECURITY DEFINER/);
    expect(corpo).toMatch(/SET search_path = public/);
    expect(ativo).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.registrar_solicitacao_conta[\s\S]*?TO anon, authenticated/
    );
  });

  it("(e) a porta pública tem os dois freios de abuso", () => {
    const corpo = corpoDaFuncao("registrar_solicitacao_conta");
    // Freio por contato e balde geral do site — formulário público sem
    // freio vira lixeira em uma noite.
    expect(corpo).toMatch(/email = v_email OR whatsapp = v_tel/);
    const janelas = corpo.match(/interval '10 minutes'/g) ?? [];
    expect(janelas.length).toBeGreaterThanOrEqual(2);
    expect(corpo).toMatch(/muitas_tentativas/);
  });

  it("(f) endereço reservado ou já em uso é recusado antes de gravar", () => {
    const corpo = corpoDaFuncao("registrar_solicitacao_conta");
    expect(corpo).toMatch(/public\.slug_reservado\(v_slug\)/);
    expect(corpo).toMatch(/FROM public\.tenants WHERE slug = v_slug/);
    // Dois pedidos pendentes não podem disputar o mesmo subdomínio.
    expect(corpo).toMatch(/slug_desejado = v_slug AND status = 'pendente'/);
    // A recusa é ANTES do INSERT.
    expect(corpo.indexOf("endereco_em_uso")).toBeLessThan(corpo.indexOf("INSERT INTO"));
    // E o laço de sugestão tem teto — nunca infinito.
    expect(corpo).toMatch(/EXIT WHEN v_n > \d+/);
  });

  it("(g) a decisão exige plataforma ANTES de qualquer escrita", () => {
    const corpo = corpoDaFuncao("decidir_solicitacao_conta");
    expect(corpo).toMatch(/is_super_admin\(\) IS NOT TRUE/);
    expect(corpo.indexOf("is_super_admin")).toBeLessThan(corpo.indexOf("UPDATE public.solicitacoes_conta"));
    // Aprovar sem o estabelecimento criado tiraria o pedido da fila sem que
    // nada tenha nascido para a pessoa.
    expect(corpo).toMatch(/v_status = 'aprovada' AND p_tenant_id IS NULL/);
    // E um pedido já decidido não pode ser decidido de novo.
    expect(corpo).toMatch(/v_linha\.status <> 'pendente'/);
  });

  it("(h) o anon não alcança a RPC de decisão", () => {
    expect(ativo).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.decidir_solicitacao_conta[\s\S]*?FROM anon/
    );
    const grant = ativo.match(
      /GRANT\s+EXECUTE ON FUNCTION public\.decidir_solicitacao_conta\(uuid, text, uuid, text\) TO ([a-z, ]+);/
    );
    expect(grant?.[1]).toBe("authenticated");
  });

  it("(i) nenhuma senha é recebida nem guardada", () => {
    // Senha em tabela de pedido é segredo em texto claro. A credencial
    // nasce no provisionamento, não aqui.
    expect(ativo).not.toMatch(/\bsenha\b|\bpassword\b/i);
  });
});
