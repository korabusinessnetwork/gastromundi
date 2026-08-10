import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard de regressão do DL22 — pedido de delivery cancelado tem que
 * cancelar também a comanda espelho em `public.pending`.
 *
 * `criar_pedido_delivery` espelha todo pedido em `pending` e guarda o
 * vínculo em delivery_pedidos.pending_id. Antes de
 * 20260904_delivery_cancelado_limpa_espelho.sql esse vínculo não era lido
 * por ninguém: cancelar o pedido deixava a comanda aberta, a Cozinha
 * seguia preparando e o PDV seguia com uma comanda fantasma para cobrar.
 *
 * Não há Postgres no CI, então o que este arquivo garante é o texto da
 * migração corretiva (mesmo instrumento de rlsJwtClaimGuard.test.js e
 * deliveryHorarioSqlGuard.test.js):
 *   (a) ela existe e roda DEPOIS de todas as versões da RPC que escrevem
 *       pending_id (ordem lexicográfica do nome = ordem de aplicação);
 *   (b) o trigger nasce em public.delivery_pedidos, AFTER UPDATE OF status,
 *       com a guarda de idempotência no WHEN, e a função é SECURITY
 *       DEFINER com search_path fixo;
 *   (c) o DELETE alcança só a comanda espelho daquele pedido e daquele
 *       estabelecimento (id = NEW.pending_id AND tenant_id = NEW.tenant_id);
 *   (d) nenhuma linha ativa apaga espelho em 'entregue' — no modo add-on é
 *       essa comanda que o PDV fecha para registrar a venda;
 *   (e) a RPC mais recente continua escrevendo o vínculo que o trigger lê.
 *       Sem isso o trigger viraria um no-op silencioso.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $$ ... $$ no fim
 * da migração, que consulta pg_trigger/pg_proc ao vivo e aborta se o
 * trigger não existir do jeito certo — isso este teste não substitui.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const CORRETIVA = "20260904_delivery_cancelado_limpa_espelho.sql";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/** Linhas de SQL ativo — comentário `--` explicando o bug é permitido. */
function linhasAtivas(conteudo) {
  return conteudo
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"));
}

function semComentarios(conteudo) {
  return linhasAtivas(conteudo).join("\n");
}

const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

describe("Delivery — guard do espelho em pending no cancelamento (DL22)", () => {
  it("a migração corretiva existe e roda depois de toda versão da RPC que escreve o vínculo", () => {
    expect(arquivos).toContain(CORRETIVA);

    const comVinculo = arquivos.filter((n) => {
      if (n === CORRETIVA) return false;
      return /\bpending_id\b/.test(semComentarios(ler(n)));
    });

    // Sanity check: o vínculo nasceu na fundação e foi reescrito várias vezes,
    // tudo antes do trigger. Migration é histórico imutável, então o teto não
    // é "depois de todas para sempre" — uma correção futura pode refazer a RPC
    // legitimamente. Que ela continue escrevendo o vínculo é o que o teste
    // "a RPC mais recente continua escrevendo o vínculo" cobra, olhando sempre
    // para a última versão.
    const anteriores = comVinculo.filter((arquivo) => arquivo < CORRETIVA);
    expect(anteriores.length).toBeGreaterThanOrEqual(6);
    expect(anteriores).toContain("20260804_delivery_fundacao.sql");
  });

  it("o trigger nasce em delivery_pedidos, AFTER UPDATE OF status, e só no cancelamento", () => {
    const sql = semComentarios(ler(CORRETIVA));

    expect(sql).toMatch(
      /DROP TRIGGER IF EXISTS delivery_pedidos_cancelado_limpa_espelho ON public\.delivery_pedidos;/
    );
    expect(sql).toMatch(
      /CREATE TRIGGER delivery_pedidos_cancelado_limpa_espelho\s+AFTER UPDATE OF status ON public\.delivery_pedidos/
    );
    // BEFORE deixaria o DELETE acontecer antes de o status ser aceito pela
    // guarda de transição (20260815) — o espelho sumiria num UPDATE recusado.
    expect(sql).not.toMatch(/BEFORE UPDATE[^;]*delivery_cancelado_limpa_espelho/);

    // AFTER UPDATE OF <col> dispara quando a coluna é MENCIONADA no UPDATE,
    // mesmo com o valor igual. Sem o WHEN, um UPDATE que reescreve
    // status = 'cancelado' rodaria o DELETE de novo — e o segundo já não é
    // idempotente do ponto de vista da operação: apagaria uma comanda nova.
    expect(sql).toMatch(
      /WHEN \(NEW\.status = 'cancelado' AND OLD\.status IS DISTINCT FROM 'cancelado'\)/
    );
    expect(sql).toMatch(
      /EXECUTE FUNCTION public\.delivery_cancelado_limpa_espelho\(\);/
    );
  });

  it("a função é SECURITY DEFINER com search_path fixo", () => {
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.delivery_cancelado_limpa_espelho\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/
    );
  });

  it("o corpo só age em 'cancelado' e ignora pedido sem vínculo", () => {
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).toMatch(
      /IF NEW\.status IS DISTINCT FROM 'cancelado' THEN\s+RETURN NEW;/
    );
    expect(sql).toMatch(/IF NEW\.pending_id IS NULL THEN\s+RETURN NEW;/);
  });

  it("o DELETE alcança só a comanda daquele pedido e daquele estabelecimento", () => {
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).toMatch(
      /DELETE FROM public\.pending\s+WHERE id = NEW\.pending_id\s+AND tenant_id = NEW\.tenant_id;/
    );

    // Um DELETE em pending sem os dois filtros apagaria comanda alheia —
    // SECURITY DEFINER roda sem RLS.
    const deletes = linhasAtivas(ler(CORRETIVA)).filter((l) =>
      /DELETE\s+FROM/i.test(l)
    );
    expect(deletes).toHaveLength(1);
  });

  it("nenhuma linha ativa apaga o espelho em 'entregue'", () => {
    // No modo add-on é essa comanda que o caixa fecha para registrar a
    // venda. Apagar em 'entregue' faria a venda desaparecer do caixa.
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).not.toMatch(/entregue/);
  });

  it("a RPC mais recente continua escrevendo o vínculo que o trigger lê", () => {
    const versoesRpc = arquivos
      .filter((n) =>
        /CREATE OR REPLACE FUNCTION public\.criar_pedido_delivery/.test(
          semComentarios(ler(n))
        )
      )
      .sort();
    expect(versoesRpc.length).toBeGreaterThanOrEqual(6);

    const ultima = versoesRpc[versoesRpc.length - 1];
    const sql = semComentarios(ler(ultima));

    // O pedido grava o vínculo…
    expect(sql).toMatch(/status, pending_id/);
    // …e a comanda espelho nasce com esse mesmo id em public.pending.
    expect(sql).toMatch(/INSERT INTO public\.pending \(/);
    expect(sql).toMatch(/v_pending_id/);
  });
});
