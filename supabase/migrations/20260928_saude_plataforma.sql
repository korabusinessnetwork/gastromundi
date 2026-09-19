-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma — RPC saude_plataforma
-- F022-SAUDE · ADR-008 §5/§7 (decisão v2 nº 2) · 2ª peça de LEITURA
-- cross-tenant de dado OPERACIONAL do Console.
--
-- O QUE ESTÁ FURADO
-- O Console responde quem PAGA (aba de planos) e quem USA (aba de uso,
-- 20260912). Falta a pergunta do suporte: para quem o sistema está
-- QUEBRADO agora. Duas falhas são silenciosas do lado da plataforma e
-- barulhentas do lado do cliente:
--
--   • nota fiscal que não sobe — nfce_emitidas guarda 'rejeitada' (a
--     SEFAZ recusou) e 'pendente' (emitida offline, na fila de
--     contingência, ainda não transmitida). Nota parada há dias é
--     obrigação fiscal não cumprida, e quem descobre é o contador do
--     cliente, não a plataforma;
--   • comanda que não imprime — trabalhos_impressao guarda 'erro' e
--     'pendente'. A Ponte local falha na casa do cliente e ninguém aqui
--     fica sabendo.
--
-- POR QUE ISTO É UMA RPC E NÃO UMA POLICY
-- Mesma razão da 20260912, e a mesma decisão escrita: ADR-008, Decisão
-- Fechada v2 nº 2 e o cabeçalho da 20260724 — as policies operacionais
-- usam USING (tenant_id = auth.tenant_id()) SEM o OR is_super_admin(). O
-- motivo é o raio de exposição: um token de plataforma vazado com aquele
-- OR na policy entregaria o histórico fiscal inteiro de todos os
-- clientes. Esta migração é o outro braço da decisão, o escopo explícito
-- por RPC, com o mesmo limite a mais:
--
--   ATENÇÃO: ESTA FUNÇÃO NÃO DEVOLVE LINHA DE DOCUMENTO. Devolve
--   CONTAGEM e a DATA DO MAIS ANTIGO.
--
-- O que sai daqui é que o cliente tem 12 notas paradas desde terça, não
-- quais notas, de qual venda, com qual chave, por qual motivo de recusa,
-- nem o que a comanda mandava imprimir. Quem for mexer nesta função
-- depois: acrescentar coluna que identifique um documento NÃO é melhoria
-- incremental, é trocar a decisão v2 nº 2 por outra, e isso passa por
-- ADR, não por CREATE OR REPLACE. O guard em
-- src/lib/saudeSqlGuard.test.js quebra se acontecer.
--
-- PERÍODO x ESTADO DE AGORA (o ponto sutil)
-- Recusa e erro de impressão são EVENTOS: contam dentro do período,
-- porque "quantas recusas nos últimos 30 dias" é a pergunta. Pendência é
-- ESTADO: conta o que está parado AGORA, sem corte de período, mais a
-- data do mais antigo. Aplicar o corte na pendência apagaria exatamente
-- o caso grave — a nota parada há 60 dias sumiria do resultado de 30, e
-- a tela diria que está tudo bem.
--
-- SEGURANÇA (mesmo desenho de 20260729, 20260801, 20260909, 20260911 e
-- 20260912):
-- • SECURITY DEFINER + SET search_path = public. É o DEFINER que faz a
--   agregação atravessar a RLS das duas tabelas; a autorização passa a
--   ser a guarda abaixo, e por isso ela é a primeira linha do corpo.
-- • Guarda is_super_admin() IS NOT TRUE (NULL e false barram igual, ver
--   20260730): a função é chamável pelo PostgREST por QUALQUER token
--   authenticated, inclusive o do garçom de um cliente.
-- • p_dias só aceita 7, 30 ou 90 — validado no BANCO, não na tela.
-- • REVOKE de PUBLIC/anon ANTES do GRANT a authenticated.
--
-- CUSTO DA CONSULTA
-- Dois passes agregados, um por tabela, unidos por tenant com FULL OUTER
-- JOIN: um estabelecimento pode ter pendência fiscal e nenhuma de
-- impressão, ou o contrário, e nenhum dos dois pode sumir do resultado.
-- Enquanto a base couber em dezenas de milhares de linhas isso é
-- irrelevante; quando doer, o caminho é uma tabela de resumo, não
-- afrouxar a função.
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: is_super_admin() (20260723/20260730), nfce_emitidas,
-- trabalhos_impressao.
-- RLS: NENHUMA mudança no painel — nenhuma policy é criada, alterada ou
-- removida por esta migração. É esse o ponto dela.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.saude_plataforma(p_dias integer DEFAULT 30)
RETURNS TABLE (
  tenant_id               uuid,
  fiscais_recusadas       integer,
  fiscais_paradas         integer,
  fiscal_parada_desde     timestamptz,
  impressoes_com_erro     integer,
  impressoes_paradas      integer,
  impressao_parada_desde  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corte timestamptz;
BEGIN
  -- ── Autorização: só a plataforma vê a saúde da base ──────────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode ver a saúde dos estabelecimentos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  -- Lista fechada, não faixa: os três valores são os que a tela usa, e
  -- período livre convidaria a varrer a base inteira por uma URL.
  IF p_dias IS NULL OR p_dias NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'Período inválido: use 7, 30 ou 90 dias.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_corte := now() - make_interval(days => p_dias);

  -- ── Agregação ────────────────────────────────────────────────────
  -- Sete colunas, e nenhuma identifica um documento. O FULL OUTER JOIN
  -- existe porque as duas falhas são independentes: quem só tem
  -- pendência de impressão não pode sumir por não ter nenhuma fiscal.
  RETURN QUERY
  WITH fiscal AS (
    SELECT nf.tenant_id AS t,
           (count(*) FILTER (WHERE nf.status = 'rejeitada'
                               AND nf.created_at >= v_corte))::integer AS recusadas,
           (count(*) FILTER (WHERE nf.status = 'pendente'))::integer   AS paradas,
           min(nf.created_at) FILTER (WHERE nf.status = 'pendente')    AS parada_desde
      FROM public.nfce_emitidas nf
     WHERE nf.tenant_id IS NOT NULL
     GROUP BY nf.tenant_id
  ),
  impressao AS (
    SELECT ti.tenant_id AS t,
           (count(*) FILTER (WHERE ti.status = 'erro'
                               AND ti.criado_em >= v_corte))::integer  AS com_erro,
           (count(*) FILTER (WHERE ti.status = 'pendente'))::integer   AS paradas,
           min(ti.criado_em) FILTER (WHERE ti.status = 'pendente')     AS parada_desde
      FROM public.trabalhos_impressao ti
     WHERE ti.tenant_id IS NOT NULL
     GROUP BY ti.tenant_id
  )
  SELECT coalesce(f.t, i.t),
         coalesce(f.recusadas, 0),
         coalesce(f.paradas, 0),
         f.parada_desde,
         coalesce(i.com_erro, 0),
         coalesce(i.paradas, 0),
         i.parada_desde
    FROM fiscal f
    FULL OUTER JOIN impressao i ON i.t = f.t;
END;
$$;

-- Ordem importa: o REVOKE depois do GRANT tiraria de authenticated também.
REVOKE EXECUTE ON FUNCTION public.saude_plataforma(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saude_plataforma(integer) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_oid       oid;
  v_def       text;
  v_corpo     text;
  v_cfg       text[];
  v_proibida  text;
  v_quebrados integer;
BEGIN
  v_oid := to_regprocedure('public.saude_plataforma(integer)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'saude_plataforma(integer) não existe após a migração.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
    RAISE EXCEPTION 'saude_plataforma precisa ser SECURITY DEFINER.';
  END IF;

  -- CREATE OR REPLACE descarta proconfig em silêncio; conferir de fato.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'saude_plataforma ficou sem SET search_path.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- Comentário fora ANTES de conferir texto: o cabeçalho desta própria
  -- função cita as colunas proibidas para explicar por que não estão lá,
  -- e sem tirar o comentário a conferência acusaria a si mesma
  -- (patterns.md — "Conferência textual de SQL").
  v_corpo := regexp_replace(v_def, '--.*', '', 'gn');

  IF v_corpo NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'saude_plataforma sem a guarda is_super_admin().';
  END IF;

  -- A função é de AGREGADO. Coluna que identifique um documento não pode
  -- aparecer (decisão v2 nº 2).
  SELECT a.nome INTO v_proibida
  FROM unnest(ARRAY['chave', 'numero', 'venda_id', 'protocolo', 'x_motivo', 'documento']) AS a(nome)
  WHERE v_corpo LIKE '%' || a.nome || '%'
  LIMIT 1;
  IF v_proibida IS NOT NULL THEN
    RAISE EXCEPTION 'saude_plataforma devolve dado de documento individual (%). A função é de agregado — ver ADR-008, decisão v2 nº 2.', v_proibida;
  END IF;

  -- Função recém-criada nasce com EXECUTE para PUBLIC — o REVOKE acima é
  -- que tira. Se ele falhar, qualquer visitante do site poderia chamar.
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não pode executar saude_plataforma.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa poder executar saude_plataforma.';
  END IF;

  SELECT count(DISTINCT tenant_id) INTO v_quebrados
  FROM public.nfce_emitidas
  WHERE status = 'pendente';

  RAISE NOTICE 'saude_plataforma instalada. Estabelecimentos com nota fiscal parada agora: %. Veja na aba "Saúde da operação" do Console.', v_quebrados;
END $conf$;
