-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma — RPC renomear_tenant
-- Pré-venda §1.8 · decisão 027 (plataforma gere os estabelecimentos)
--
-- O QUE ESTAVA FURADO
-- O Console CRIA um estabelecimento e nunca mais consegue corrigir o que
-- digitou. `tenants` não tem policy de UPDATE (ADR-005/008 §7 — escrita só
-- por RPC), e as três RPCs que existem tocam outra coisa cada uma:
--   • alterar_plano_tenant  (20260729) → plano_codigo
--   • alterar_layout_tenant (20260801) → tema.layout
--   • atualizar_identidade_tenant (20260914) → tema.nome_exibicao/logo_url,
--     e ela é do ADMIN DO PRÓPRIO ESTABELECIMENTO: não recebe tenant, age
--     sobre `tenant_do_usuario_atual()` e exige gastro_role='admin'. A
--     plataforma não alcança tenant nenhum por ela.
-- Ninguém escreve `tenants.nome`. Um erro de digitação no cadastro ("Bar do
-- Zé" virando "Bar do Ze") ficava gravado para sempre, aparecendo na lista
-- do Console, no texto de primeiro acesso copiado para o cliente e em todo
-- relatório da plataforma — com o SQL Editor como único conserto.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ, DE PROPÓSITO
-- • NÃO troca o `slug`. O slug é o subdomínio E o namespace de e-mail do
--   Auth (20260803): trocá-lo quebra na hora o link do cardápio já entregue
--   ao cliente, os QR codes impressos e a porta de entrada da equipe. Fica
--   travado até existir redirecionamento do endereço antigo — decisão do
--   dono, registrada na análise de pré-venda §1.8.
-- • NÃO mexe no endereço da loja. Aquele campo do cadastro não vive em
--   `tenants`: é `config_delivery.endereco_origem` (semeado pela Edge
--   Function no provisionamento) e o admin do próprio estabelecimento o
--   corrige na tela "Entrega e taxas", onde o pino do mapa é reposicionado
--   junto. Duplicar essa escrita aqui gravaria endereço sem coordenada e a
--   taxa por quilômetro daquele cliente sairia errada.
--
-- SEGURANÇA (mesmo desenho de 20260729/20260911/20260918):
-- • SECURITY DEFINER + SET search_path = public.
-- • Guarda `is_super_admin() IS NOT TRUE` na entrada, ANTES de qualquer
--   escrita (NULL e false barram igual — ver 20260730). Sob SECURITY
--   DEFINER o auth.jwt() ainda reflete o CHAMADOR, então o admin de um
--   estabelecimento que chame isto leva exceção.
-- • Valida a entrada antes de escrever (CLAUDE.md): nome vazio, curto
--   demais ou longo demais são recusas em português, não erro cru.
-- • O UPDATE toca UMA coluna (`nome`). Nada de slug, plano ou tema — cada
--   um tem sua RPC, e um UPDATE largo aqui apagaria o trabalho delas.
-- • REVOKE de PUBLIC/anon ANTES do GRANT a authenticated (nessa ordem: o
--   REVOKE depois tiraria de authenticated também).
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: is_super_admin() (20260723/20260730), tenants (20260717).
-- RLS: nenhuma mudança no painel — `tenants` segue com SELECT só, e a
-- escrita continua sendo exclusivamente por RPC.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.renomear_tenant(
  p_tenant_id uuid,
  p_nome      text
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Mesmo teto do campo do formulário do Console (maxLength 80). Nome é
  -- rótulo de tela, não texto livre: acima disso ele quebra o card da lista
  -- e o texto de primeiro acesso mandado ao cliente.
  c_max_nome constant integer := 80;
  c_min_nome constant integer := 2;
  v_nome     text;
  v_tenant   public.tenants;
BEGIN
  -- ── Autorização: só a plataforma renomeia estabelecimento ────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode renomear um estabelecimento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'O estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Espaço em branco não é nome. `btrim` antes de medir para que "   " caia
  -- na recusa de vazio, e não na de tamanho mínimo.
  v_nome := nullif(btrim(coalesce(p_nome, '')), '');

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'O nome do estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF length(v_nome) < c_min_nome THEN
    RAISE EXCEPTION 'O nome precisa ter ao menos % caracteres.', c_min_nome
      USING ERRCODE = 'check_violation';
  END IF;

  IF length(v_nome) > c_max_nome THEN
    RAISE EXCEPTION 'O nome é longo demais: o máximo é % caracteres.', c_max_nome
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Escrita ──────────────────────────────────────────────────────
  -- Uma coluna só, e com WHERE: sem ele o UPDATE renomearia a base inteira.
  -- `id` é PRIMARY KEY, então isto nunca atinge mais de uma linha.
  UPDATE public.tenants
     SET nome = v_nome
   WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_tenant;
END;
$$;

-- Ordem importa: o REVOKE depois do GRANT tiraria de authenticated também.
REVOKE EXECUTE ON FUNCTION public.renomear_tenant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renomear_tenant(uuid, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_oid oid;
  v_def text;
  v_cfg text[];
BEGIN
  v_oid := to_regprocedure('public.renomear_tenant(uuid, text)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'renomear_tenant(uuid, text) não existe após a migração.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
    RAISE EXCEPTION 'renomear_tenant precisa ser SECURITY DEFINER.';
  END IF;

  -- CREATE OR REPLACE descarta proconfig em silêncio; conferir de fato.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'renomear_tenant ficou sem SET search_path.';
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF v_def NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'renomear_tenant sem a guarda is_super_admin().';
  END IF;

  -- O slug não pode entrar na escrita nem por descuido de uma edição futura:
  -- trocá-lo quebraria os links de cardápio já entregues aos clientes.
  IF v_def LIKE '%slug =%' OR v_def LIKE '%slug=%' THEN
    RAISE EXCEPTION 'renomear_tenant não pode escrever o slug do estabelecimento.';
  END IF;

  -- UPDATE sem WHERE renomearia a base inteira com um clique.
  IF v_def NOT LIKE '%WHERE id = p_tenant_id%' THEN
    RAISE EXCEPTION 'renomear_tenant precisa filtrar o UPDATE por id.';
  END IF;

  -- Função recém-criada nasce com EXECUTE para PUBLIC — o REVOKE acima é
  -- que tira. Sem ele, a anon key alcançaria a RPC.
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não pode executar renomear_tenant.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa poder executar renomear_tenant.';
  END IF;

  RAISE NOTICE 'renomear_tenant instalada. O Console já corrige o nome de um estabelecimento pelo botão "Renomear" no card. O endereço (slug) segue travado de propósito.';
END $conf$;
