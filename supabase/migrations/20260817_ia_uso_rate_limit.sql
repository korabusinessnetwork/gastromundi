-- ══════════════════════════════════════════════════════════════════
-- M1 (auditoria cfb7583) — rate-limit GRÁTIS por tenant da leitura por IA
--
-- ┌─ O FURO ──────────────────────────────────────────────────────────┐
-- │ A Edge Function `ler-cardapio-ia` exige JWT válido (bom — barra    │
-- │ anônimo), mas QUALQUER usuário autenticado de QUALQUER tenant pode │
-- │ chamá-la em loop. Todos dividem a MESMA GEMINI_API_KEY do free-    │
-- │ tier → um tenant sozinho estoura a cota grátis (limite por         │
-- │ minuto/dia) e a leitura por IA cai para TODOS (noisy neighbor).    │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ A DEFESA (grátis, sem custo novo — regra free-first do CLAUDE.md)─┐
-- │ Contador diário por tenant + teto. A função conta 1 uso por        │
-- │ chamada e barra em 429 quando o tenant passa do teto do dia.       │
-- │ O tenant vem SEMPRE do JWT (tenant_atual_id()), nunca de um        │
-- │ parâmetro do cliente — sem cross-tenant. RPC SECURITY DEFINER      │
-- │ atômica (trava a linha do dia com FOR UPDATE), fail-closed se o    │
-- │ claim do tenant for NULL, e REVOKE de PUBLIC/anon (padrão Leva 16).│
-- └───────────────────────────────────────────────────────────────────┘
--
-- ATENÇÃO (dono): aplicar esta migration MANUALMENTE no Supabase e
-- REIMPLANTAR a Edge Function `ler-cardapio-ia` (que passa a chamar a
-- RPC). Enquanto a migration não estiver aplicada, a função continua
-- funcionando (fail-open no erro da RPC) — só sem o teto.
--
-- RLS: a tabela nasce com RLS ligada e policy por tenant (defesa em
-- profundidade). A RPC é SECURITY DEFINER e não depende da policy; a
-- policy só garante que ninguém lê/escreve a tabela direto de outro
-- tenant caso um dia seja exposta ao cliente.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE + DROP
-- POLICY IF EXISTS. Re-aplicável sem efeito colateral.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Tabela de uso diário por tenant ────────────────────────────
CREATE TABLE IF NOT EXISTS public.ia_uso (
  tenant_id  uuid        NOT NULL DEFAULT public.tenant_atual_id(),
  dia        date        NOT NULL DEFAULT current_date,
  chamadas   integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, dia)
);

ALTER TABLE public.ia_uso ENABLE ROW LEVEL SECURITY;

-- Policy por tenant (só o próprio tenant enxerga suas linhas). A RPC
-- SECURITY DEFINER abaixo não passa por aqui — isto é defesa extra.
DROP POLICY IF EXISTS ia_uso_tenant ON public.ia_uso;
CREATE POLICY ia_uso_tenant ON public.ia_uso
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

-- Ninguém escreve/lê direto pelo cliente; o acesso é via RPC.
REVOKE ALL ON public.ia_uso FROM PUBLIC, anon;

-- ── 2. RPC atômica: conta 1 uso e diz se estourou o teto ──────────
-- Retorna a contagem do dia APÓS o registro e se o tenant excedeu.
-- Quando já estourou, NÃO incrementa (não acumula à toa) e devolve
-- excedeu=true para a função responder 429.
CREATE OR REPLACE FUNCTION public.registrar_uso_ia(p_limite integer DEFAULT 50)
RETURNS TABLE (chamadas integer, excedeu boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.tenant_atual_id();
  v_atual  integer;
BEGIN
  -- Fail-closed: sem claim de tenant (anon/token adulterado) → erro.
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sem tenant no token para registrar uso da IA.';
  END IF;

  -- Garante a linha do dia (não zera se já existir).
  INSERT INTO public.ia_uso (tenant_id, dia, chamadas)
  VALUES (v_tenant, current_date, 0)
  ON CONFLICT (tenant_id, dia) DO NOTHING;

  -- Trava a linha do dia para o incremento ser atômico entre chamadas
  -- concorrentes (dois pedidos ao mesmo tempo não furam o teto).
  SELECT iu.chamadas INTO v_atual
    FROM public.ia_uso iu
   WHERE iu.tenant_id = v_tenant AND iu.dia = current_date
   FOR UPDATE;

  IF v_atual >= p_limite THEN
    RETURN QUERY SELECT v_atual, true;
    RETURN;
  END IF;

  UPDATE public.ia_uso iu
     SET chamadas = iu.chamadas + 1, updated_at = now()
   WHERE iu.tenant_id = v_tenant AND iu.dia = current_date
  RETURNING iu.chamadas INTO v_atual;

  RETURN QUERY SELECT v_atual, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_uso_ia(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_uso_ia(integer) TO authenticated;
