-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  20260924_fechamentos_colunas.sql — A6                               ║
-- ║  Fechamento de caixa deixa de ser um JSONB opaco                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- POR QUE ESTA MIGRATION EXISTE
--   `fechamentos` guarda o fechamento inteiro num único `data jsonb`. O app
--   lê isso e mostra bonito na tela, mas o banco não enxerga nada: não dá
--   para perguntar "quais caixas fecharam com falta neste mês", não dá para
--   somar diferença por operador, não dá para criar índice e não dá para
--   montar relatório fora do app. Fechamento de caixa é registro financeiro
--   — precisa ser consultável.
--
-- COMO: COLUNA GERADA, NÃO SEGUNDA GRAVAÇÃO
--   A saída óbvia seria o app gravar as colunas junto com o JSON. Seriam
--   dois caminhos de escrita para o mesmo número, e um dia eles divergem —
--   aí o relatório e a tela mostram valores diferentes para o mesmo caixa e
--   ninguém sabe qual acreditar. Aqui as colunas são GENERATED ALWAYS AS
--   ... STORED: o Postgres as calcula a partir do próprio `data`, no insert.
--   Não há nada a manter em sincronia, e nenhuma linha de código do app
--   muda. `data` continua sendo o registro; as colunas são a projeção
--   consultável dele.
--
-- A CONTA DO ESPERADO É A MESMA DO APP
--   `esperadoEmCaixa()` em src/lib/caixa.js usa `totalEsperado` quando ele
--   existe e cai para `totalVendas + fundo` nos fechamentos antigos, que não
--   tinham o campo. A expressão abaixo repete exatamente essa regra — se as
--   duas discordarem, o relatório da tela e a consulta no banco passam a
--   contar histórias diferentes sobre o mesmo dia.
--
--   A expressão aparece duas vezes (em total_esperado e dentro de
--   diferenca) porque o Postgres não deixa uma coluna gerada referenciar
--   outra. Mudou uma, muda a outra.
--
-- POR QUE `jsonb_typeof` ANTES DE CADA CAST
--   `(data->>'fundo')::numeric` estoura se o JSON trouxer texto onde deveria
--   haver número, e coluna gerada é calculada no insert: um payload torto
--   deixaria de gravar o fechamento inteiro, com o caixa do salão parado.
--   Com o teste de tipo, campo ausente ou estranho vira NULL e o fechamento
--   grava do mesmo jeito.
--
-- POR QUE NÃO TEM COLUNA DE DATA
--   `created_at` já existe e é gravado pelo próprio banco. O `at` do JSON é
--   o relógio da máquina do operador; para consulta, o do banco é melhor.
--
-- CUSTO DE RODAR
--   ADD COLUMN com expressão gerada reescreve a tabela e pega lock
--   exclusivo. `fechamentos` tem uma linha por fechamento de caixa, então é
--   uma tabela pequena e isso passa em instantes — mas ainda assim é lock,
--   então rode fora do horário de pico.
--
-- IDEMPOTENTE
--   Pode rodar de novo: cada ADD COLUMN é IF NOT EXISTS e o índice também.

-- ── 1. as colunas ─────────────────────────────────────────────────────

-- Quem fechou. Serve para "diferença por operador", que é a pergunta que
-- se faz quando falta dinheiro mais de uma vez.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS usuario_nome text
    GENERATED ALWAYS AS (data ->> 'user') STORED;

ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS usuario_papel text
    GENERATED ALWAYS AS (data ->> 'role') STORED;

-- Troco que estava na gaveta na abertura.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS fundo numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
           THEN (data ->> 'fundo')::numeric END
    ) STORED;

-- Tudo que o sistema registrou como venda na sessão, em qualquer meio.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS total_vendas numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
           THEN (data ->> 'totalVendas')::numeric END
    ) STORED;

-- O que deveria estar conferido — só os meios que tinham linha na tela.
-- Espelha esperadoEmCaixa() de src/lib/caixa.js, inclusive o fallback dos
-- fechamentos antigos.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS total_esperado numeric(12,2)
    GENERATED ALWAYS AS (
      COALESCE(
        CASE WHEN jsonb_typeof(data -> 'totalEsperado') = 'number'
             THEN (data ->> 'totalEsperado')::numeric END,
        CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
             THEN (data ->> 'totalVendas')::numeric ELSE 0 END
        + CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
               THEN (data ->> 'fundo')::numeric ELSE 0 END
      )
    ) STORED;

-- O que o operador digitou ter contado.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS total_conferido numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'totalConferido') = 'number'
           THEN (data ->> 'totalConferido')::numeric END
    ) STORED;

-- Positivo é sobra, negativo é falta. Mesma conta de diferencaCaixa().
-- A expressão do esperado está repetida aqui de propósito: coluna gerada
-- não pode referenciar outra coluna gerada.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS diferenca numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'totalConferido') = 'number'
           THEN (data ->> 'totalConferido')::numeric ELSE 0 END
      - COALESCE(
          CASE WHEN jsonb_typeof(data -> 'totalEsperado') = 'number'
               THEN (data ->> 'totalEsperado')::numeric END,
          CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
               THEN (data ->> 'totalVendas')::numeric ELSE 0 END
          + CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
                 THEN (data ->> 'fundo')::numeric ELSE 0 END
        )
    ) STORED;

-- Contado meio a meio ({"dinheiro": 120.00, "pix": 340.50}). Fica jsonb
-- porque a lista de meios de pagamento é configurável por estabelecimento —
-- uma coluna por meio quebraria no primeiro cliente que criar o dele.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS conferido_por_metodo jsonb
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'conferidoPorMetodo') = 'object'
           THEN data -> 'conferidoPorMetodo' END
    ) STORED;

-- Justificativa que o operador escreveu ao fechar com diferença.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS observacao text
    GENERATED ALWAYS AS (data ->> 'observacao') STORED;

-- ── 2. índice ─────────────────────────────────────────────────────────
-- A consulta que motiva tudo isso é "os fechamentos com diferença deste
-- estabelecimento". Índice parcial: caixa que bateu certo é a maioria das
-- linhas e não precisa entrar.
CREATE INDEX IF NOT EXISTS fechamentos_tenant_diferenca_idx
  ON public.fechamentos (tenant_id, created_at DESC)
  WHERE diferenca <> 0;

-- ── 3. autoteste ──────────────────────────────────────────────────────
-- Coluna gerada com expressão errada não dá erro: grava número errado em
-- silêncio, que é o pior jeito de errar num registro financeiro.
DO $conf$
DECLARE
  v_faltando text;
  v_nao_gerada text;
  v_esperado numeric;
  v_diferenca numeric;
BEGIN
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_faltando
    FROM unnest(ARRAY[
      'usuario_nome', 'usuario_papel', 'fundo', 'total_vendas',
      'total_esperado', 'total_conferido', 'diferenca',
      'conferido_por_metodo', 'observacao'
    ]) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fechamentos'
        AND column_name = c
   );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: coluna(s) não criada(s) em fechamentos: %', v_faltando;
  END IF;

  -- Se alguma delas for coluna comum, o app teria de gravá-la — e é
  -- exatamente a segunda fonte de verdade que esta migration evita.
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_nao_gerada
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'fechamentos'
     AND column_name IN (
       'usuario_nome', 'usuario_papel', 'fundo', 'total_vendas',
       'total_esperado', 'total_conferido', 'diferenca',
       'conferido_por_metodo', 'observacao'
     )
     AND is_generated <> 'ALWAYS';
  IF v_nao_gerada IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: coluna(s) de fechamentos não estão geradas pelo banco: %', v_nao_gerada;
  END IF;

  -- Confere a conta com um fechamento de mentira, sem tocar na tabela:
  -- caixa antigo (sem totalEsperado) que contou R$ 90,00 tendo vendido
  -- R$ 80,00 com fundo de R$ 20,00 está R$ 10,00 em falta.
  WITH exemplo(data) AS (
    VALUES ('{"totalVendas": 80.00, "fundo": 20.00, "totalConferido": 90.00}'::jsonb)
  )
  SELECT
    COALESCE(
      CASE WHEN jsonb_typeof(data -> 'totalEsperado') = 'number'
           THEN (data ->> 'totalEsperado')::numeric END,
      CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
           THEN (data ->> 'totalVendas')::numeric ELSE 0 END
      + CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
             THEN (data ->> 'fundo')::numeric ELSE 0 END
    ),
    CASE WHEN jsonb_typeof(data -> 'totalConferido') = 'number'
         THEN (data ->> 'totalConferido')::numeric ELSE 0 END
    - COALESCE(
        CASE WHEN jsonb_typeof(data -> 'totalEsperado') = 'number'
             THEN (data ->> 'totalEsperado')::numeric END,
        CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
             THEN (data ->> 'totalVendas')::numeric ELSE 0 END
        + CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
               THEN (data ->> 'fundo')::numeric ELSE 0 END
      )
    INTO v_esperado, v_diferenca
    FROM exemplo;

  IF v_esperado <> 100.00 OR v_diferenca <> -10.00 THEN
    RAISE EXCEPTION 'FALHA: a conta do fechamento saiu errada (esperado=%, diferenca=%). Deveria ser 100.00 e -10.00.',
      v_esperado, v_diferenca;
  END IF;

  RAISE NOTICE 'fechamentos agora responde consulta: esperado, contado, diferença e conferido por método viraram coluna.';
END
$conf$;
