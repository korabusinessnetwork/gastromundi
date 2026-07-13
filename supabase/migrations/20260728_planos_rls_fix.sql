-- ══════════════════════════════════════════════════════════════════
-- Correção de segurança — habilita RLS em planos e planos_modulos
-- docs/08_DECISOES/adr-005.md §2 · CLAUDE.md (RLS obrigatória)
--
-- SINTOMA: o linter do Supabase acusa "RLS Disabled in Public / CRITICAL"
-- em public.planos e public.planos_modulos. CAUSA: quando essas tabelas
-- foram (re)criadas fora do fluxo normal de migração (Cowork rodou "sem
-- RLS"), o ENABLE ROW LEVEL SECURITY que a 20260717 e a 20260724_fix
-- definem não chegou a ser aplicado — e o delta de RLS que eu passei
-- depois também não entrou. Numa tabela do schema `public` sem RLS, os
-- grants padrão do Supabase para anon/authenticated deixam a tabela
-- ABERTA (leitura e escrita) — por isso o alerta é CRITICAL, mesmo
-- sendo catálogo "só de lookup".
--
-- DESENHO (idêntico ao pretendido em 20260717 §RLS): catálogo global de
-- planos/módulos é lookup — LEITURA para qualquer logado, ESCRITA só via
-- migration/painel (nenhuma policy de INSERT/UPDATE/DELETE, então o
-- PostgREST recusa escrita de anon/authenticated). Com RLS habilitada e
-- só a policy de SELECT, a tabela deixa de estar aberta.
--
-- Idempotente: ENABLE RLS é no-op se já ligada; DROP POLICY IF EXISTS +
-- CREATE torna as policies reexecutáveis. Não altera dado nem quebra o
-- app (o front lê planos_modulos como authenticated — a policy permite).
-- ══════════════════════════════════════════════════════════════════

-- ── planos ─────────────────────────────────────────────────────────
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planos_select_auth" ON public.planos;
CREATE POLICY "planos_select_auth"
  ON public.planos FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── planos_modulos ─────────────────────────────────────────────────
ALTER TABLE public.planos_modulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planos_modulos_select_auth" ON public.planos_modulos;
CREATE POLICY "planos_modulos_select_auth"
  ON public.planos_modulos FOR SELECT
  USING (auth.role() = 'authenticated');
