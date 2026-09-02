-- ══════════════════════════════════════════════════════════════════
-- TD013 — gravação atômica dos itens da comanda
-- docs/09_BACKLOG/tech-debt.md (TD013) · src/lib/comandaItens.js
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ `pending.items` é um jsonb gravado INTEIRO a cada lançamento.   │
-- │ Para não perder o item que outro aparelho lançou no meio do     │
-- │ caminho, o app hoje faz três passos separados:                  │
-- │                                                                  │
-- │   1. lê os itens que estão no banco                             │
-- │   2. mescla com a lista que ele quer gravar                     │
-- │   3. grava a lista mesclada                                     │
-- │                                                                  │
-- │ Entre o passo 1 e o passo 3 existe uma janela de rede — dezenas │
-- │ a centenas de milissegundos. Se o Palm do garçom gravar dentro  │
-- │ dessa janela, o PDV grava por cima com uma lista que já nasceu  │
-- │ velha, e a cerveja lançada some da conta. Não é hipótese de     │
-- │ laboratório: é exatamente o horário de pico, com duas pessoas   │
-- │ lançando na mesma mesa.                                         │
-- │                                                                  │
-- │ A correção é fazer os três passos DENTRO do banco, na mesma     │
-- │ transação, com a linha travada. Aí não existe mais "meio do     │
-- │ caminho": quem chegar em segundo espera e mescla em cima do     │
-- │ resultado de quem chegou em primeiro.                           │
-- └───────────────────────────────────────────────────────────────────┘
--
-- A REGRA DE MESCLA É A MESMA DO APP (src/lib/comandaItens.js), portada
-- para SQL sem mudança de comportamento:
--   • cada item carrega um `uid` estável, criado na primeira gravação;
--   • `conhecidos` = uids do snapshot de onde o chamador partiu (p_base_uids)
--     + uids da lista que ele quer gravar (p_items);
--   • item que está no banco com uid FORA de `conhecidos` foi lançado por
--     outro aparelho → é preservado no fim da lista;
--   • item sem uid (legado, gravado antes desta regra) não tem identidade
--     para ser reconhecido e segue a cargo do snapshot do chamador.
--
-- SECURITY INVOKER, DE PROPÓSITO — é a exceção ao padrão das outras RPCs
-- deste projeto, que são SECURITY DEFINER. Aqui a função não precisa de
-- privilégio nenhum além do que o próprio usuário já tem: ela mexe em
-- `pending`, cuja RLS (pending_all_auth + pending_tenant_isolation) já
-- isola por estabelecimento e por papel. Rodando como o chamador, esse
-- isolamento continua valendo palavra por palavra — se a comanda for de
-- outro estabelecimento, o SELECT abaixo simplesmente não a enxerga e a
-- função devolve NULL. Fosse SECURITY DEFINER, a RLS seria contornada e
-- eu teria de reescrever o isolamento aqui dentro, à mão, para ganhar
-- nada.
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase.
-- ⚠️ RLS: esta migration NÃO cria tabela nem coluna. Ela cria UMA função
--    e, como toda função nova no Supabase, ela nasce executável por
--    PUBLIC (o que inclui a role `anon`, de visitante sem login). Os
--    REVOKE/GRANT do fim do arquivo corrigem isso — confira no painel
--    (Database → Functions) que só `authenticated` tem EXECUTE.
--
-- COMPATIBILIDADE: o app funciona com e sem esta migration. Enquanto ela
-- não roda, a chamada volta com "função não existe" (PGRST202/42883), o
-- app registra isso uma vez e passa a usar o caminho antigo (ler-mesclar-
-- gravar) pelo resto da sessão. Ou seja: dá para publicar o front-end
-- antes de rodar isto aqui, sem quebrar o PDV — só sem o ganho.
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT re-aplicáveis.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gravar_itens_comanda(
  p_id        text,
  p_items     jsonb,
  p_base_uids text[]  DEFAULT NULL,
  p_total     numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_banco      jsonb;
  v_conhecidos text[];
  v_remotos    jsonb := '[]'::jsonb;
  v_items      jsonb;
  v_total      numeric;
BEGIN
  -- Validação de entrada: id vazio faria a trava não pegar linha nenhuma
  -- e a gravação virar um no-op silencioso.
  IF p_id IS NULL OR btrim(p_id) = '' THEN
    RAISE EXCEPTION 'gravar_itens_comanda: id da comanda é obrigatório.'
      USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'gravar_itens_comanda: items precisa ser uma lista JSON.'
      USING ERRCODE = '22023';
  END IF;

  -- ── O coração da correção ────────────────────────────────────────
  -- FOR UPDATE trava ESTA linha até o fim da transação (que aqui é a
  -- própria chamada da função). Outra gravação na mesma comanda para
  -- nesta linha e espera; quando prosseguir, vai ler o resultado já
  -- gravado — não a versão velha. É isto que fecha a janela.
  SELECT p.items INTO v_banco
    FROM public.pending p
   WHERE p.id = p_id
     FOR UPDATE;

  -- Comanda que não existe (ou é de outro estabelecimento, pela RLS):
  -- devolve NULL e não grava nada. Mesmo desfecho do UPDATE de hoje,
  -- que simplesmente não acha linha para atualizar.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_base_uids IS NULL THEN
    -- Sem snapshot não há como distinguir "item de outro aparelho" de
    -- "item que este aparelho removeu de propósito". O chamador manda a
    -- lista fechada e ela vale — igual ao app quando não recebe baseItems.
    v_items := p_items;
  ELSE
    -- array_remove tira NULL: um NULL dentro do array faria `= ANY(...)`
    -- devolver NULL em vez de false e o item remoto seria descartado em
    -- silêncio — o oposto do que esta função existe para fazer.
    SELECT array_remove(p_base_uids, NULL)
           || COALESCE(array_agg(e->>'uid') FILTER (WHERE e->>'uid' IS NOT NULL), '{}'::text[])
      INTO v_conhecidos
      FROM jsonb_array_elements(p_items) AS e;

    SELECT COALESCE(jsonb_agg(t.e ORDER BY t.ord), '[]'::jsonb)
      INTO v_remotos
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_banco) = 'array' THEN v_banco ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS t(e, ord)
     WHERE t.e->>'uid' IS NOT NULL
       AND NOT (t.e->>'uid' = ANY (v_conhecidos));

    v_items := CASE
                 WHEN jsonb_array_length(v_remotos) > 0 THEN p_items || v_remotos
                 ELSE p_items
               END;
  END IF;

  -- Total: quem chama já mandou o dele calculado. Ele só é refeito aqui
  -- quando a mescla trouxe item de volta — senão a conta fecharia sem o
  -- item que acabou de ser recuperado. Mesma regra de totalItensAtivos:
  -- soma preço × quantidade dos itens NÃO cancelados, com duas casas.
  IF p_total IS NULL THEN
    v_total := NULL;
  ELSIF jsonb_array_length(v_remotos) > 0 THEN
    SELECT round(COALESCE(sum(
             COALESCE(NULLIF(e->>'price', '')::numeric, 0)
             * COALESCE(NULLIF(e->>'qty', '')::numeric, 1)
           ), 0), 2)
      INTO v_total
      FROM jsonb_array_elements(v_items) AS e
     WHERE COALESCE((e->>'cancelado')::boolean, false) = false;
  ELSE
    v_total := p_total;
  END IF;

  UPDATE public.pending p
     SET items      = v_items,
         -- p_total ausente = "não mexa no total" (o chamador só mudou itens).
         total      = CASE WHEN p_total IS NULL THEN p.total ELSE v_total END,
         updated_at = now()
   WHERE p.id = p_id;

  -- Devolve o que ficou gravado para a tela do chamador refletir a mescla
  -- na hora, sem depender de o Realtime chegar.
  RETURN jsonb_build_object(
    'items',        v_items,
    'total',        CASE WHEN p_total IS NULL THEN NULL ELSE v_total END,
    'houve_mescla', jsonb_array_length(v_remotos) > 0
  );
END
$fn$;

-- REVOKE antes do GRANT: função nova nasce executável por PUBLIC, e PUBLIC
-- inclui `anon` (visitante sem login). Comanda é dado de operação.
REVOKE EXECUTE ON FUNCTION public.gravar_itens_comanda(text, jsonb, text[], numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_itens_comanda(text, jsonb, text[], numeric)
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste — falha alto se a função não ficou como o app espera.
-- Roda a mescla de verdade numa comanda descartável e desfaz tudo.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_id       text := 'autoteste-td013-' || gen_random_uuid()::text;
  v_tenant   uuid;
  v_ret      jsonb;
  v_gravado  jsonb;
  v_total    numeric;
BEGIN
  -- 1. Existe, é INVOKER e não é alcançável por anon.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'gravar_itens_comanda'
  ) THEN
    RAISE EXCEPTION 'FALHA: gravar_itens_comanda não foi criada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'gravar_itens_comanda'
       AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'FALHA: gravar_itens_comanda está SECURITY DEFINER — ela precisa rodar sob a RLS de quem chama.';
  END IF;

  IF has_function_privilege('anon', 'public.gravar_itens_comanda(text, jsonb, text[], numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: gravar_itens_comanda continua executável por anon.';
  END IF;

  -- Tenant da comanda descartável, escolhido À MÃO de propósito: o DEFAULT
  -- de pending.tenant_id é tenant_atual_id(), que lê o tenant do JWT de
  -- quem chama. No app existe usuário logado e ele resolve; aqui, rodando
  -- no SQL Editor, não há sessão nenhuma e ele volta NULL — a coluna é NOT
  -- NULL e o autoteste morria antes de testar coisa alguma.
  SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;

  -- Banco ainda sem nenhum estabelecimento: as conferências de estrutura
  -- acima já passaram, e não há em que tenant pendurar a comanda de teste.
  -- Avisa e sai — melhor pular a parte de comportamento do que inventar um
  -- tenant só para o teste rodar.
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'gravar_itens_comanda criada e conferida na estrutura. A parte de comportamento foi pulada: não há nenhum tenant cadastrado para receber a comanda descartável.';
    RETURN;
  END IF;

  -- 2. Mescla de verdade. A comanda tem A e B; o chamador partiu de A e
  --    quer gravar só A — B foi lançado por outro aparelho e tem de voltar.
  INSERT INTO public.pending (id, tenant_id, comanda, items, total)
  VALUES (
    v_id, v_tenant, 'AUTOTESTE',
    '[{"uid":"a","name":"A","price":10,"qty":1},
      {"uid":"b","name":"B","price":5,"qty":2}]'::jsonb,
    20
  );

  v_ret := public.gravar_itens_comanda(
    v_id,
    '[{"uid":"a","name":"A","price":10,"qty":1}]'::jsonb,
    ARRAY['a'],
    10
  );

  SELECT p.items, p.total INTO v_gravado, v_total
    FROM public.pending p WHERE p.id = v_id;

  IF jsonb_array_length(v_gravado) <> 2 THEN
    RAISE EXCEPTION 'FALHA: o item lançado pelo outro aparelho foi perdido (ficaram % itens).',
      jsonb_array_length(v_gravado);
  END IF;
  IF v_gravado -> 1 ->> 'uid' <> 'b' THEN
    RAISE EXCEPTION 'FALHA: o item recuperado deveria ser o "b", veio %.', v_gravado -> 1 ->> 'uid';
  END IF;
  IF v_total <> 20 THEN
    RAISE EXCEPTION 'FALHA: total deveria ter sido refeito para 20 (10 + 5×2), veio %.', v_total;
  END IF;
  IF (v_ret ->> 'houve_mescla')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHA: a função não avisou o app de que houve mescla.';
  END IF;

  -- 3. Sem nada remoto, grava o que o chamador mandou e mantém o total dele.
  v_ret := public.gravar_itens_comanda(
    v_id,
    '[{"uid":"a","name":"A","price":10,"qty":1},{"uid":"b","name":"B","price":5,"qty":2}]'::jsonb,
    ARRAY['a', 'b'],
    99
  );
  SELECT p.total INTO v_total FROM public.pending p WHERE p.id = v_id;
  IF v_total <> 99 THEN
    RAISE EXCEPTION 'FALHA: sem mescla o total do chamador deveria ter sido respeitado (99), veio %.', v_total;
  END IF;
  IF (v_ret ->> 'houve_mescla')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHA: a função avisou mescla onde não houve.';
  END IF;

  -- 4. Comanda inexistente devolve NULL em vez de erro (mesmo desfecho do
  --    UPDATE de hoje, que não acha linha para atualizar).
  IF public.gravar_itens_comanda('nao-existe-' || v_id, '[]'::jsonb, ARRAY[]::text[], 0) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: comanda inexistente deveria devolver NULL.';
  END IF;

  DELETE FROM public.pending WHERE id = v_id;

  RAISE NOTICE 'gravar_itens_comanda conferida: item lançado por outro aparelho não se perde mais na janela entre ler e gravar.';
END $conf$;
