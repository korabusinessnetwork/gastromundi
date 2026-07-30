-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma — RPC definir_mensalidade_tenant
-- Billing (ADR-006 §4 · decisão 024) · 4ª peça de ESCRITA do Console
--
-- O QUE ESTAVA FURADO
-- `assinaturas.valor_mensal` nasce em 0 e NENHUM caminho do sistema o
-- escrevia. A 20260719 dizia "ajustar para o preço real antes de cobrar
-- qualquer cliente de verdade"; a 20260908, que passou a criar assinatura
-- para TODO estabelecimento provisionado, dizia "o preço é combinado
-- depois, na tela do Console". Essa tela não existia: o único jeito de
-- registrar o que a plataforma cobra era um UPDATE cru no SQL Editor.
--
-- O dano é de LEITURA, e é o pior tipo porque parece um fato: o cartão
-- "Receita mensal" do Console soma `valor_mensal` da base que paga
-- (resumirPlataforma, src/lib/console.js), então ele mostrava R$ 0,00 com
-- clientes pagantes na base — e nada na tela dizia por quê. Quem olha não
-- tem como distinguir "não fatura nada" de "nunca perguntamos o preço".
--
-- Esta RPC é a ÚNICA via de escrita de `valor_mensal`: `assinaturas` não
-- tem policy de UPDATE (20260719, reforçado em 20260726) — escrita só por
-- RPC SECURITY DEFINER, como em alterar_plano_tenant/alterar_layout_tenant.
--
-- SEGURANÇA (mesmo desenho de 20260729 e 20260801):
-- • SECURITY DEFINER + SET search_path = public.
-- • Guarda `is_super_admin() IS NOT TRUE` na entrada (NULL e false barram
--   igual — ver 20260730). Preço é decisão da PLATAFORMA: o próprio
--   estabelecimento nunca define quanto paga, nem o admin dele.
-- • Recusa NULL e negativo, tem teto de sanidade e arredonda em centavos.
-- • REVOKE de PUBLIC/anon ANTES do GRANT a authenticated (nessa ordem: o
--   REVOKE depois tiraria de authenticated também).
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: is_super_admin() (20260723/20260730), assinaturas
-- (20260719).
-- RLS: nenhuma mudança no painel — a escrita continua sendo só por RPC.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.definir_mensalidade_tenant(
  p_tenant_id uuid,
  p_valor     numeric
)
RETURNS public.assinaturas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Teto de sanidade. Não pega erro plausível (3000 no lugar de 300), mas
  -- pega o dedo que escorregou no zero e evita que o cartão de receita da
  -- plataforma vire lixo sem ninguém entender de onde saiu o número.
  c_teto  constant numeric := 100000;
  v_valor numeric;
  v_ass   public.assinaturas;
BEGIN
  -- ── Autorização: só a plataforma define preço ────────────────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode definir a mensalidade de um estabelecimento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'O estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_valor IS NULL THEN
    RAISE EXCEPTION 'A mensalidade é obrigatória.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Zero é PERMITIDO de propósito (cortesia, piloto, sócio) — o Console
  -- mostra "sem mensalidade definida" e segue avisando. Negativo não:
  -- viraria receita negativa no cartão da plataforma.
  IF p_valor < 0 THEN
    RAISE EXCEPTION 'A mensalidade não pode ser negativa.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_valor > c_teto THEN
    RAISE EXCEPTION 'A mensalidade parece errada: o máximo aceito é %.', c_teto
      USING ERRCODE = 'check_violation';
  END IF;

  -- Dinheiro tem 2 casas. A coluna é `numeric` SEM escala, então sem este
  -- arredondamento um valor com 3 casas ficaria gravado diferente do que a
  -- tela mostra de volta.
  v_valor := round(p_valor, 2);

  -- ── Escrita ──────────────────────────────────────────────────────
  -- tenant_id é PRIMARY KEY em assinaturas: no máximo uma linha por
  -- estabelecimento, então este UPDATE nunca atinge mais de uma.
  UPDATE public.assinaturas
     SET valor_mensal = v_valor
   WHERE tenant_id = p_tenant_id
  RETURNING * INTO v_ass;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este estabelecimento não tem assinatura: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_ass;
END;
$$;

-- Ordem importa: o REVOKE depois do GRANT tiraria de authenticated também.
REVOKE EXECUTE ON FUNCTION public.definir_mensalidade_tenant(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_mensalidade_tenant(uuid, numeric) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- Também informa quantos estabelecimentos estão sem preço hoje.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_oid     oid;
  v_def     text;
  v_cfg     text[];
  v_zerados integer;
BEGIN
  v_oid := to_regprocedure('public.definir_mensalidade_tenant(uuid, numeric)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'definir_mensalidade_tenant(uuid, numeric) não existe após a migração.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
    RAISE EXCEPTION 'definir_mensalidade_tenant precisa ser SECURITY DEFINER.';
  END IF;

  -- CREATE OR REPLACE descarta proconfig em silêncio; conferir de fato.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'definir_mensalidade_tenant ficou sem SET search_path.';
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF v_def NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'definir_mensalidade_tenant sem a guarda is_super_admin().';
  END IF;

  -- Função recém-criada nasce com EXECUTE para PUBLIC — o REVOKE acima é
  -- que tira. Se ele falhar, qualquer visitante do site poderia chamar.
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não pode executar definir_mensalidade_tenant.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa poder executar definir_mensalidade_tenant.';
  END IF;

  SELECT count(*) INTO v_zerados
  FROM public.assinaturas
  WHERE coalesce(valor_mensal, 0) <= 0
    AND status <> 'cancelado';

  RAISE NOTICE 'definir_mensalidade_tenant instalada. Estabelecimentos sem mensalidade definida hoje: %. Defina o preço de cada um na aba "Planos e assinaturas" do Console.', v_zerados;
END $conf$;
