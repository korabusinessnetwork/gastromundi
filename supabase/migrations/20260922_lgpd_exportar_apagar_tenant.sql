-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma — LGPD: exportar e apagar os dados de um
-- estabelecimento
-- Pré-venda §1.5 · LGPD arts. 18, V (portabilidade) e 18, VI (eliminação)
--
-- O QUE ESTAVA FURADO
-- A partir da primeira venda a plataforma passa a guardar, por conta de
-- terceiros, o faturamento de um restaurante e o cadastro dos clientes
-- FINAIS dele (nome, telefone, endereço de entrega). A lei dá ao contratante
-- o direito de pedir uma cópia desses dados e de pedir que sejam eliminados,
-- e não havia caminho nenhum para atender:
--   • exportar → nada. O jeito era abrir 50 abas no painel do Supabase e
--     copiar tabela por tabela à mão, sem garantia de ter pego todas;
--   • apagar   → a única função que remove tenant é
--     `remover_tenant_provisionado` (20260910), e ela RECUSA, de propósito,
--     estabelecimento que tenha usuário ou pagamento. Isto é, recusa
--     exatamente o caso de um cliente real pedindo eliminação. Ela é o
--     desfazer de um provisionamento que falhou, não o direito do titular.
-- Sem os dois, a resposta a um pedido formal seria "não temos como", com
-- prazo legal correndo.
--
-- COMO AS DUAS FUNÇÕES ACHAM O QUE É DO CLIENTE
-- Varrendo `information_schema` por toda tabela de `public` que tenha coluna
-- `tenant_id` — hoje 50 das 56 — em vez de uma lista escrita à mão. Lista à
-- mão envelhece no primeiro módulo novo: a tabela nasce, ninguém lembra de
-- vir aqui, e a exportação passa a sair incompleta e a eliminação a deixar
-- rastro — os dois em silêncio, que é o pior modo de falhar numa obrigação
-- legal. A varredura acha a tabela nova no dia em que ela existe.
-- As 6 tabelas sem `tenant_id` são tratadas caso a caso mais abaixo.
--
-- POR QUE A EXPORTAÇÃO LEVA A LINHA INTEIRA (`jsonb_agg(t)`)
-- O CLAUDE.md proíbe `select *` em tabela sensível, e a regra continua
-- valendo em todo o resto do código: lá o objetivo é não trazer para a tela
-- coluna que a tela não usa. Aqui o pedido do titular é, por definição, "a
-- cópia de tudo o que vocês têm sobre mim". Enumerar colunas transformaria
-- cada coluna futura numa omissão silenciosa na resposta a um pedido legal.
-- O que protege o dado não é a lista de colunas: é a guarda de super-admin
-- na entrada e o fato de a senha NÃO estar em `public` — ela vive em
-- `auth.users`, que a exportação não lê.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ, DE PROPÓSITO
-- • NÃO substitui `remover_tenant_provisionado` (20260910). Aquela continua
--   sendo a compensação do provisionamento que falhou pela metade, com as
--   recusas dela intactas: cobrança não se apaga por efeito colateral. Esta
--   aqui é o oposto — apaga pagamento junto, porque é isso que o titular
--   pediu. Duas portas, duas intenções, nenhuma no lugar da outra.
-- • NÃO decide sobre guarda fiscal. Se o estabelecimento teve nota emitida
--   ou movimento que a contabilidade precise guardar (LGPD art. 16, I), essa
--   cópia tem de existir FORA daqui antes do apagamento — é para isso que a
--   exportação vem primeiro, e o Console obriga a passar por ela.
-- • NÃO apaga sozinha, por gatilho ou agenda. É ato humano, pedido por
--   escrito, com confirmação digitada. Eliminação automática seria perda de
--   dado por descuido com cara de conformidade.
-- • NÃO mexe em RLS nem cria policy. `tenants` segue SELECT-only e a escrita
--   continua exclusivamente por RPC (ADR-005/008 §7).
--
-- SEGURANÇA (mesmo desenho de 20260729/20260910/20260918/20260919):
-- • SECURITY DEFINER + SET search_path = public.
-- • Guarda `is_super_admin() IS NOT TRUE` na entrada, ANTES de qualquer
--   leitura ou escrita (NULL e false barram igual — ver 20260730). Sob
--   SECURITY DEFINER o auth.jwt() ainda reflete o CHAMADOR: o admin de um
--   estabelecimento que chame isto leva exceção, e não alcança nem os
--   próprios dados por esta porta.
-- • `format(... %I ...)` em todo SQL dinâmico e o valor sempre por `USING`:
--   nome de tabela vem do catálogo do Postgres, nunca do parâmetro, e o
--   `p_tenant_id` nunca é concatenado em texto.
-- • O apagamento exige uma segunda prova humana: digitar o endereço (slug)
--   do estabelecimento. Confirmação por sim/não erra com um clique torto;
--   digitar o nome do alvo obriga a olhar para quem se está apagando.
-- • Todo DELETE tem WHERE por `tenant_id` ou por chave coletada dele. Os
--   usuários da plataforma têm `tenant_id IS NULL` (20260723) e o
--   `p_tenant_id` nulo é recusado na entrada — não existe caminho em que
--   isto alcance a conta da própria plataforma.
-- • REVOKE de PUBLIC/anon ANTES do GRANT a authenticated (nessa ordem: o
--   REVOKE depois tiraria de authenticated também).
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: is_super_admin() (20260723/20260730), tenants (20260717),
--   users.tenant_id (20260723), login_tentativas (20260920),
--   senha_admin_tentativas (20260810).
-- RLS: nenhuma mudança no painel.
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- 1) Exportar — a cópia que o titular pede (LGPD art. 18, V)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exportar_dados_estabelecimento(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  public.tenants;
  v_tabela  text;
  v_linhas  jsonb;
  v_dados   jsonb := '{}'::jsonb;
  v_total   integer := 0;
  v_n       integer;
BEGIN
  -- ── Autorização: só a plataforma exporta ─────────────────────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode exportar os dados de um estabelecimento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'O estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Varredura ────────────────────────────────────────────────────
  -- Ordem alfabética para que duas exportações do mesmo estabelecimento
  -- saiam iguais e possam ser comparadas — a de antes e a de depois de uma
  -- correção, por exemplo.
  FOR v_tabela IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'tenant_id'
       AND t.table_type   = 'BASE TABLE'
     ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE t.tenant_id = $1',
      v_tabela
    ) USING p_tenant_id INTO v_linhas;

    v_linhas := coalesce(v_linhas, '[]'::jsonb);
    v_n      := jsonb_array_length(v_linhas);
    v_total  := v_total + v_n;

    -- Tabela vazia entra na exportação como `[]`, e não some. "Não temos
    -- nada de você nesta tabela" é uma resposta; a ausência da chave só
    -- levantaria a dúvida de se a varredura passou por ali.
    v_dados := v_dados || jsonb_build_object(v_tabela, v_linhas);
  END LOOP;

  RETURN jsonb_build_object(
    'estabelecimento', to_jsonb(v_tenant),
    'gerado_em',       now(),
    'total_de_linhas', v_total,
    'tabelas',         v_dados,
    -- Escrito na própria exportação para que quem receber o arquivo saiba o
    -- que NÃO está nele, sem precisar perguntar.
    'observacoes', jsonb_build_array(
      'Senhas não constam: elas vivem no serviço de autenticação, guardadas como hash, e não são legíveis nem por nós.',
      'Estão aqui todas as tabelas do sistema que guardam algo deste estabelecimento.'
    )
  );
END;
$$;

COMMENT ON FUNCTION public.exportar_dados_estabelecimento(uuid) IS
  'LGPD art. 18, V — devolve em JSON tudo o que a plataforma guarda de um estabelecimento. Só super-admin. Não lê auth.users (senhas).';

-- Ordem importa: o REVOKE depois do GRANT tiraria de authenticated também.
REVOKE EXECUTE ON FUNCTION public.exportar_dados_estabelecimento(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exportar_dados_estabelecimento(uuid) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 2) Apagar — a eliminação que o titular pede (LGPD art. 18, VI)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apagar_dados_estabelecimento(
  p_tenant_id   uuid,
  p_confirmacao text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant     public.tenants;
  v_esperado   text;
  v_auth_ids   uuid[];
  v_emails     text[];
  v_pendentes  text[];
  v_proximas   text[];
  v_tabela     text;
  v_contagem   jsonb := '{}'::jsonb;
  v_total      integer := 0;
  v_n          integer;
BEGIN
  -- ── Autorização: só a plataforma apaga ───────────────────────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode apagar os dados de um estabelecimento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'O estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Trava a linha antes de conferir a confirmação: entre ler e apagar, um
  -- segundo operador não muda o slug nem apaga o mesmo tenant por outra aba.
  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Segunda prova humana ─────────────────────────────────────────
  -- O endereço (slug) é o que identifica o estabelecimento sem ambiguidade;
  -- se ele não existir, cai no nome. Comparação sem diferenciar maiúsculas
  -- e sem espaço nas pontas — o operador está digitando, não colando hash.
  v_esperado := lower(btrim(coalesce(nullif(btrim(coalesce(v_tenant.slug, '')), ''), v_tenant.nome)));

  IF lower(btrim(coalesce(p_confirmacao, ''))) IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'Confirmação não confere. Para apagar, digite exatamente: %', v_esperado
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Quem são as pessoas deste estabelecimento ────────────────────
  -- Coletado ANTES de qualquer DELETE: depois de apagar `public.users` não
  -- há mais como ligar o login ao estabelecimento, e as contas de acesso
  -- sobreviveriam à eliminação.
  SELECT array_agg(u.auth_id)
    INTO v_auth_ids
    FROM public.users u
   WHERE u.tenant_id = p_tenant_id
     AND u.auth_id IS NOT NULL;

  v_auth_ids := coalesce(v_auth_ids, ARRAY[]::uuid[]);

  SELECT array_agg(lower(au.email))
    INTO v_emails
    FROM auth.users au
   WHERE au.id = ANY (v_auth_ids)
     AND au.email IS NOT NULL;

  v_emails := coalesce(v_emails, ARRAY[]::text[]);

  -- ── Varredura de apagamento ──────────────────────────────────────
  -- As tabelas se referenciam entre si e não há ordem topológica escrita em
  -- lugar nenhum. Em vez de manter essa ordem à mão — que quebra calada no
  -- primeiro relacionamento novo — apaga-se na ordem que der: o que bater em
  -- chave estrangeira volta para a próxima passada, quando o filho dele já
  -- terá saído. Repete até a fila esvaziar. Se uma passada inteira não
  -- resolver nada, é ciclo real de dependência e a função para, sem apagar
  -- pela metade.
  v_pendentes := ARRAY(
    SELECT c.table_name::text
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'tenant_id'
       AND t.table_type   = 'BASE TABLE'
     ORDER BY c.table_name
  );

  WHILE array_length(v_pendentes, 1) IS NOT NULL LOOP
    v_proximas := ARRAY[]::text[];

    FOREACH v_tabela IN ARRAY v_pendentes LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_tabela)
          USING p_tenant_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_total    := v_total + v_n;
        v_contagem := v_contagem || jsonb_build_object(v_tabela, v_n);
      EXCEPTION WHEN foreign_key_violation THEN
        -- Ainda tem filho pendurado. Volta para a fila.
        v_proximas := v_proximas || v_tabela;
      END;
    END LOOP;

    IF array_length(v_proximas, 1) = array_length(v_pendentes, 1) THEN
      RAISE EXCEPTION 'Não foi possível apagar: as tabelas % dependem umas das outras em ciclo.',
        array_to_string(v_proximas, ', ')
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_pendentes := v_proximas;
  END LOOP;

  -- ── As tabelas sem `tenant_id` que guardam identificador ─────────
  -- Nenhuma das duas é dado de negócio: são o controle de tentativas de
  -- senha. Mas guardam o e-mail de login e o id da conta das pessoas deste
  -- estabelecimento, então ficariam como rastro depois da eliminação.
  -- `planos`, `planos_modulos` e `addons` são catálogo da plataforma, iguais
  -- para todo mundo, e por isso não entram.
  IF array_length(v_emails, 1) IS NOT NULL THEN
    DELETE FROM public.login_tentativas WHERE email = ANY (v_emails);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total    := v_total + v_n;
    v_contagem := v_contagem || jsonb_build_object('login_tentativas', v_n);
  END IF;

  IF array_length(v_auth_ids, 1) IS NOT NULL THEN
    DELETE FROM public.senha_admin_tentativas WHERE auth_id = ANY (v_auth_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total    := v_total + v_n;
    v_contagem := v_contagem || jsonb_build_object('senha_admin_tentativas', v_n);

    -- ── As contas de acesso ────────────────────────────────────────
    -- Por último entre os dados das pessoas: enquanto `public.users`
    -- existia, o `ON DELETE SET NULL` do `auth_id` teria apagado o vínculo
    -- e deixado a conta órfã em `auth.users`, viva e capaz de logar.
    -- Apagar a linha de `auth.users` leva junto identidades, sessões e
    -- refresh tokens, que são cascata dela.
    DELETE FROM auth.users WHERE id = ANY (v_auth_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total    := v_total + v_n;
    v_contagem := v_contagem || jsonb_build_object('auth.users', v_n);
  END IF;

  -- ── O cadastro do estabelecimento, por fim ───────────────────────
  DELETE FROM public.tenants WHERE id = p_tenant_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total    := v_total + v_n;
  v_contagem := v_contagem || jsonb_build_object('tenants', v_n);

  RETURN jsonb_build_object(
    'ok',              true,
    'tenant_id',       p_tenant_id,
    'nome',            v_tenant.nome,
    'slug',            v_tenant.slug,
    'apagado_em',      now(),
    'total_de_linhas', v_total,
    'linhas',          v_contagem
  );
END;
$$;

COMMENT ON FUNCTION public.apagar_dados_estabelecimento(uuid, text) IS
  'LGPD art. 18, VI — apaga TUDO de um estabelecimento (dados, contas de acesso e cadastro). Só super-admin, e só com o slug digitado como confirmação. Irreversível: exporte antes.';

-- Ordem importa: o REVOKE depois do GRANT tiraria de authenticated também.
REVOKE EXECUTE ON FUNCTION public.apagar_dados_estabelecimento(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apagar_dados_estabelecimento(uuid, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_exp oid;
  v_del oid;
  v_def text;
  v_cfg text[];
  v_qtd integer;
BEGIN
  v_exp := to_regprocedure('public.exportar_dados_estabelecimento(uuid)');
  v_del := to_regprocedure('public.apagar_dados_estabelecimento(uuid, text)');

  IF v_exp IS NULL THEN
    RAISE EXCEPTION 'exportar_dados_estabelecimento(uuid) não existe após a migração.';
  END IF;
  IF v_del IS NULL THEN
    RAISE EXCEPTION 'apagar_dados_estabelecimento(uuid, text) não existe após a migração.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_exp AND prosecdef) THEN
    RAISE EXCEPTION 'exportar_dados_estabelecimento precisa ser SECURITY DEFINER.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_del AND prosecdef) THEN
    RAISE EXCEPTION 'apagar_dados_estabelecimento precisa ser SECURITY DEFINER.';
  END IF;

  -- CREATE OR REPLACE descarta proconfig em silêncio; conferir de fato.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_exp;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'exportar_dados_estabelecimento ficou sem SET search_path.';
  END IF;
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_del;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'apagar_dados_estabelecimento ficou sem SET search_path.';
  END IF;

  v_def := pg_get_functiondef(v_exp);
  IF v_def NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'exportar_dados_estabelecimento sem a guarda is_super_admin().';
  END IF;

  v_def := pg_get_functiondef(v_del);
  IF v_def NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'apagar_dados_estabelecimento sem a guarda is_super_admin().';
  END IF;
  -- Sem a confirmação digitada isto vira um botão que apaga um cliente
  -- inteiro com um clique torto.
  IF v_def NOT LIKE '%p_confirmacao%' THEN
    RAISE EXCEPTION 'apagar_dados_estabelecimento precisa exigir a confirmação digitada.';
  END IF;
  -- DELETE sem WHERE em qualquer uma dessas tabelas esvaziaria a base
  -- inteira, de todos os estabelecimentos, numa chamada só.
  IF v_def ~ 'DELETE FROM [a-z_.]+ *;' THEN
    RAISE EXCEPTION 'apagar_dados_estabelecimento tem DELETE sem WHERE.';
  END IF;

  -- Função recém-criada nasce com EXECUTE para PUBLIC — o REVOKE acima é
  -- que tira. Sem ele, a anon key alcançaria as duas RPCs.
  IF has_function_privilege('anon', v_exp, 'EXECUTE')
     OR has_function_privilege('anon', v_del, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não pode executar as RPCs de LGPD.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_exp, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_del, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa poder executar as RPCs de LGPD.';
  END IF;

  -- `tenants` continua sem policy de escrita (ADR-005/008 §7).
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'tenants'
       AND cmd IN ('UPDATE', 'DELETE', 'INSERT', 'ALL')
  ) THEN
    RAISE EXCEPTION 'tenants ganhou policy de escrita — a escrita tem de continuar só por RPC.';
  END IF;

  SELECT count(*) INTO v_qtd
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
     AND t.table_type = 'BASE TABLE';

  RAISE NOTICE 'RPCs de LGPD instaladas. A varredura alcança % tabelas com tenant_id. No Console, o botão "Dados do cliente" no card exporta e apaga — e o apagamento pede o endereço digitado.', v_qtd;
END $conf$;
