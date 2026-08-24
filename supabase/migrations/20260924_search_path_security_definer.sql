-- ══════════════════════════════════════════════════════════════════
-- Hardening — search_path fixo em toda função SECURITY DEFINER
--
-- SECURITY DEFINER faz a função rodar com os privilégios de quem a
-- CRIOU (o dono do banco), não de quem a chama. É o que dá poder às
-- RPCs do projeto: `criar_pedido_delivery` grava pedido para um
-- anônimo, `tenant_atual_id` lê o JWT, `assinatura_ativa` consulta
-- billing por baixo da RLS. Sem `SET search_path`, essa função roda com
-- o search_path DE QUEM CHAMA.
--
-- O que isso abre: quem chama controla em que ordem os schemas são
-- procurados, e todo usuário pode criar objeto em `pg_temp` — que entra
-- no caminho de busca. Um nome não-qualificado dentro do corpo
-- (`tenants`, `now()`, um operador) pode então ser resolvido para um
-- objeto plantado pelo chamador, e esse objeto executa com privilégio
-- de dono do banco. É o vetor clássico de escalada em Postgres, e é o
-- mesmo alerta que o linter do próprio Supabase levanta como
-- `function_search_path_mutable`.
--
-- ┌─ HONESTIDADE SOBRE O RISCO REAL AQUI ────────────────────────────┐
-- │ Nas sete funções abaixo, TODA referência já está qualificada      │
-- │ (`public.assinaturas`, `public.tenant_atual_id()`, `auth.jwt()`), │
-- │ e `pg_catalog` vem sempre antes de `pg_temp` para `now()`. Então  │
-- │ não há hoje um caminho de exploração direto — isto é defesa em    │
-- │ profundidade, não fechamento de furo aberto.                      │
-- │                                                                   │
-- │ Vale mesmo assim por um motivo prático: a próxima pessoa que      │
-- │ editar o corpo de uma dessas funções e escrever `FROM tenants`    │
-- │ em vez de `FROM public.tenants` — coisa que passa em qualquer     │
-- │ review — transforma isso em furo de verdade. Com o search_path    │
-- │ fixo, esse deslize continua sendo só um deslize.                  │
-- └───────────────────────────────────────────────────────────────────┘
--
-- POR QUE ALTER E NÃO CREATE OR REPLACE
-- `ALTER FUNCTION ... SET search_path` muda só a configuração, sem
-- tocar no corpo. Reescrever as sete com CREATE OR REPLACE só para
-- acrescentar uma linha significaria copiar corpo de sete funções —
-- sete chances de errar uma vírgula em código de billing e de estoque.
--
-- E O INVERSO TAMBÉM É ARMADILHA: `CREATE OR REPLACE FUNCTION` APAGA as
-- cláusulas `SET` que não forem repetidas no texto novo. Foi assim que
-- três destas aqui perderam o search_path que já tinham — a
-- 20260802_leva16_hardening_rpcs.sql recriou `limpar_reserva_mesa` e
-- `sincronizar_status_assinatura` sem repetir a linha. Quem for
-- reescrever qualquer função SECURITY DEFINER daqui pra frente precisa
-- levar `SET search_path = public` junto no texto.
--
-- Guard automatizado: src/lib/searchPathSqlGuard.test.js varre as
-- migrations e falha se a ÚLTIMA versão de qualquer função SECURITY
-- DEFINER estiver sem a cláusula.
--
-- Idempotente: rodar de novo não muda nada (o SET já estará lá).
-- RODAR MANUALMENTE no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  assinatura text;
  alvos text[] := ARRAY[
    'public.assinatura_ativa(uuid)',
    'public.assinatura_atual_ativa()',
    'public.tenant_tem_modulo(uuid, text)',
    'public.tenant_atual_tem_modulo(text)',
    'public.tenant_atual_tem_addon(text)',
    'public.limpar_reserva_mesa(text)',
    'public.sincronizar_status_assinatura(uuid)'
  ];
BEGIN
  FOREACH assinatura IN ARRAY alvos LOOP
    IF to_regprocedure(assinatura) IS NULL THEN
      RAISE NOTICE 'Função % não existe neste banco — pulando.', assinatura;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', assinatura);
    RAISE NOTICE 'search_path fixado em %', assinatura;
  END LOOP;
END $$;

-- ── Varredura: sobrou alguma SECURITY DEFINER sem search_path? ─────
-- Avisa em vez de abortar: uma função de extensão instalada no schema
-- public apareceria aqui, e travar a migration por causa dela seria
-- pior que mostrar a lista para o dono decidir.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS assinatura
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
    ORDER BY 1
  LOOP
    n := n + 1;
    RAISE WARNING 'SECURITY DEFINER sem search_path: %', r.assinatura;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'Todas as funções SECURITY DEFINER de public têm search_path fixo.';
  ELSE
    RAISE WARNING '% função(ões) SECURITY DEFINER ainda sem search_path — ver avisos acima.', n;
  END IF;
END $$;

-- ── Verificação ────────────────────────────────────────────────────
SELECT
  p.oid::regprocedure::text AS funcao,
  p.proconfig               AS config
FROM pg_proc p
JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE ns.nspname = 'public'
  AND p.prosecdef
ORDER BY 1;
