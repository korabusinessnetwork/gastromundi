-- ══════════════════════════════════════════════════════════════════
-- Dinheiro com precisão declarada — numeric(12,2) nas colunas de valor
-- A8 da revisão de 2026-08-23
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ `numeric` sem precisão no Postgres aceita QUALQUER número de    │
-- │ casas decimais. Uma conta que devolva 10.004999999 é gravada    │
-- │ inteira, e o banco passa a guardar um valor que não existe em   │
-- │ dinheiro. Ninguém vê: a tela mostra R$ 10,00 (o `toFixed(2)`    │
-- │ arredonda na hora de exibir) e o relatório soma o número        │
-- │ comprido. Aí o fechamento do dia fecha com um centavo de        │
-- │ diferença que não bate com nenhum lançamento — e a conferência  │
-- │ vira caça ao fantasma.                                          │
-- │                                                                  │
-- │ Hoje o front-end já arredonda antes de gravar (round2, em       │
-- │ src/lib/vendas.js). Isso resolve o caminho que passa pelo app.  │
-- │ Não resolve: importação de XML, RPC que soma dentro do banco,   │
-- │ correção feita à mão no painel, integração futura. A precisão   │
-- │ na coluna é a única garantia que vale para todos eles ao mesmo  │
-- │ tempo — o banco arredonda na gravação e acabou a conversa.      │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ O QUE **NÃO** MUDA, E POR QUÊ ─────────────────────────────────┐
-- │ Nem todo `numeric` é dinheiro. Forçar 2 casas nestes destruiria │
-- │ dado de verdade, então ficam como estão:                        │
-- │                                                                  │
-- │  • QUANTIDADES — estoque.quantidade, estoque.minimo,            │
-- │    estoque_subprodutos.*, estoque_baixas_aplicadas.qtd,         │
-- │    venda_itens.qtd, notas_fiscais_itens.quantidade e            │
-- │    quantidade_estoque, estoque_entradas.quantidade,             │
-- │    products.fator_consumo_estoque, notas_fiscais_itens          │
-- │    .fator_conversao. Meio quilo de queijo é 0.5; um fator de    │
-- │    conversão de grama para quilo é 0.001. Duas casas zeraria.   │
-- │                                                                  │
-- │  • ALÍQUOTAS de itens_fiscal (aliquota_icms, ipi, pis, cofins,  │
-- │    ibs, cbs, is, e reducao_base_icms) — são percentuais, e a    │
-- │    legislação usa quatro casas (ex.: 1.6500%).                  │
-- │                                                                  │
-- │  • COORDENADAS — config_delivery.origem_lat/origem_lng e        │
-- │    delivery_pedidos.entrega_lat/entrega_lng. Latitude com duas  │
-- │    casas erra a posição em mais de um quilômetro: -23.55 e      │
-- │    -23.5558 são bairros diferentes. Isso quebraria o cálculo    │
-- │    de distância da taxa de entrega.                             │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ CUSTO UNITÁRIO É EXCEÇÃO: numeric(18,10) ──────────────────────┐
-- │ notas_fiscais_itens.preco_unitario e estoque_entradas           │
-- │ .preco_unitario NÃO são preço de venda, são custo por unidade   │
-- │ — e custo por unidade tem fração de centavo legítima:           │
-- │                                                                  │
-- │  • o XML da NF-e traz vUnCom com até 10 casas decimais;         │
-- │  • a entrada de estoque divide o preço pelo fator de conversão  │
-- │    (NotasFiscaisTab.jsx), então um saco de 1 kg a R$ 25,00 vira │
-- │    R$ 0,025 por grama. Arredondado para R$ 0,03, o custo do     │
-- │    insumo sobe 20% e o CMV sai errado.                          │
-- │                                                                  │
-- │ Estas duas ganham numeric(18,10): continua havendo um teto      │
-- │ declarado (nada de número com 40 casas vindo de importação      │
-- │ estranha), sem perder a fração que o custo precisa.             │
-- └───────────────────────────────────────────────────────────────────┘
--
-- CUSTO DE RODAR: ALTER TYPE reescreve a tabela e segura um bloqueio
-- exclusivo enquanto reescreve. Nas tabelas grandes (vendas,
-- venda_itens, venda_pagamentos) isso são segundos com o volume de
-- hoje. Rode fora do horário de pico do salão mesmo assim — durante a
-- reescrita, gravar comanda e fechar venda ficam esperando.
--
-- IDEMPOTENTE: cada coluna só é alterada se ainda não estiver no tipo
-- alvo, então rodar de novo não reescreve nada.
--
-- SEM MUDANÇA DE COMPORTAMENTO NO APP: o cliente Supabase entrega
-- numeric como string/number igual antes; quem já gravava valor
-- arredondado continua gravando o mesmo valor.
-- ══════════════════════════════════════════════════════════════════

DO $ajuste$
DECLARE
  v_alvo    record;
  v_prec    integer;
  v_esc     integer;
  v_ruins   bigint;
  v_teto    numeric;
  v_piso    numeric;
  v_mudadas integer := 0;
BEGIN
  -- A lista mora numa temporária porque é lida três vezes aqui dentro
  -- (conferência antes, alteração, contagem). Some ao fim do bloco.
  CREATE TEMP TABLE _alvo_dinheiro (
    tabela    text,
    coluna    text,
    precisao  integer,
    escala    integer
  );

  INSERT INTO _alvo_dinheiro (tabela, coluna, precisao, escala) VALUES
    -- billing da plataforma
    ('assinaturas',            'valor_mensal',       12, 2),
    ('assinaturas_pagamentos', 'valor',              12, 2),
    -- catálogo e comanda
    ('products',               'price',              12, 2),
    ('pending',                'total',              12, 2),
    -- venda normalizada (TD009)
    ('vendas',                 'subtotal',           12, 2),
    ('vendas',                 'valor_taxa',         12, 2),
    ('vendas',                 'valor_ajuste',       12, 2),
    ('vendas',                 'total',              12, 2),
    ('venda_itens',            'preco',              12, 2),
    ('venda_pagamentos',       'valor',              12, 2),
    -- financeiro e caixa
    ('lancamentos',            'valor',              12, 2),
    ('caixa_movimentos',       'valor',              12, 2),
    -- notas fiscais de entrada
    ('notas_fiscais',          'valor_total',        12, 2),
    ('notas_fiscais_itens',    'preco_total',        12, 2),
    -- combos e subprodutos
    ('subprodutos',            'preco',              12, 2),
    ('combos',                 'preco_total',        12, 2),
    ('combo_subprodutos',      'preco_customizado',  12, 2),
    -- delivery
    ('config_delivery',        'pedido_minimo',      12, 2),
    ('delivery_entregadores',  'valor_por_entrega',  12, 2),
    ('delivery_pedidos',       'subtotal',           12, 2),
    ('delivery_pedidos',       'taxa_entrega',       12, 2),
    ('delivery_pedidos',       'total',              12, 2),
    ('delivery_pedidos',       'troco_para',         12, 2),
    ('delivery_pedidos',       'valor_entregador',   12, 2),
    ('delivery_pedido_itens',  'preco_unit',         12, 2),
    ('complementos',           'preco',              12, 2),
    -- custo por unidade: fração de centavo é legítima (ver cabeçalho)
    ('notas_fiscais_itens',    'preco_unitario',     18, 10),
    ('estoque_entradas',       'preco_unitario',     18, 10);

  -- ── 1. Conferência ANTES de alterar ────────────────────────────
  -- ALTER TYPE arredonda em silêncio. Em 99,9% dos casos é o que se
  -- quer (10.004999 vira 10.00). Dois casos NÃO são, e é melhor parar
  -- aqui com uma mensagem legível do que descobrir depois:
  --   • valor grande demais para a precisão → o Postgres aborta com
  --     "numeric field overflow", sem dizer qual coluna;
  --   • valor pequeno e não-zero que arredonda para zero → some, e em
  --     lancamentos.valor e caixa_movimentos.valor ainda esbarra no
  --     CHECK (valor > 0), abortando com erro de constraint.
  FOR v_alvo IN SELECT * FROM _alvo_dinheiro LOOP
    IF to_regclass('public.' || quote_ident(v_alvo.tabela)) IS NULL THEN
      RAISE EXCEPTION 'FALHA: a tabela public.% não existe neste banco. Rode as migrations anteriores antes desta.', v_alvo.tabela;
    END IF;

    SELECT c.numeric_precision, c.numeric_scale INTO v_prec, v_esc
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = v_alvo.tabela
       AND c.column_name  = v_alvo.coluna;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FALHA: a coluna public.%.% não existe neste banco. Rode as migrations anteriores antes desta.', v_alvo.tabela, v_alvo.coluna;
    END IF;

    v_teto := power(10::numeric, v_alvo.precisao - v_alvo.escala);
    v_piso := power(10::numeric, -v_alvo.escala) / 2;

    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND abs(%I) >= %L',
      v_alvo.tabela, v_alvo.coluna, v_alvo.coluna, v_teto
    ) INTO v_ruins;
    IF v_ruins > 0 THEN
      RAISE EXCEPTION 'FALHA: % linha(s) em public.%.% têm valor >= % e não cabem em numeric(%,%). Confira esses registros antes de rodar.',
        v_ruins, v_alvo.tabela, v_alvo.coluna, v_teto, v_alvo.precisao, v_alvo.escala;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND %I <> 0 AND abs(%I) < %L',
      v_alvo.tabela, v_alvo.coluna, v_alvo.coluna, v_alvo.coluna, v_piso
    ) INTO v_ruins;
    IF v_ruins > 0 THEN
      RAISE EXCEPTION 'FALHA: % linha(s) em public.%.% têm valor diferente de zero mas menor que % — virariam zero ao arredondar. Confira esses registros antes de rodar.',
        v_ruins, v_alvo.tabela, v_alvo.coluna, v_piso;
    END IF;
  END LOOP;

  -- ── 2. Alteração ───────────────────────────────────────────────
  FOR v_alvo IN SELECT * FROM _alvo_dinheiro LOOP
    SELECT c.numeric_precision, c.numeric_scale INTO v_prec, v_esc
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = v_alvo.tabela
       AND c.column_name  = v_alvo.coluna;

    IF v_prec IS DISTINCT FROM v_alvo.precisao OR v_esc IS DISTINCT FROM v_alvo.escala THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(%s,%s)',
        v_alvo.tabela, v_alvo.coluna, v_alvo.precisao, v_alvo.escala
      );
      v_mudadas := v_mudadas + 1;
      RAISE NOTICE 'public.%.% agora é numeric(%,%)', v_alvo.tabela, v_alvo.coluna, v_alvo.precisao, v_alvo.escala;
    END IF;
  END LOOP;

  RAISE NOTICE '% de % coluna(s) alterada(s); o resto já estava no tipo certo.',
    v_mudadas, (SELECT count(*) FROM _alvo_dinheiro);

  DROP TABLE _alvo_dinheiro;
END $ajuste$;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
--
-- Em vez de reconferir a mesma lista de cima (que só provaria que a
-- lista é igual a ela mesma), a busca aqui é pelo defeito: QUALQUER
-- coluna numérica com cara de dinheiro que ainda esteja sem precisão.
-- Isso pega também a coluna que alguém criar amanhã e esquecer.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_soltas text;
  v_prec   integer;
  v_esc    integer;
  v_nome   text;
BEGIN
  SELECT string_agg(format('%s.%s', c.table_name, c.column_name), ', ' ORDER BY c.table_name, c.column_name)
    INTO v_soltas
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public'
     AND c.data_type = 'numeric'
     AND c.numeric_scale IS NULL
     AND c.column_name ~ '^(price|preco|valor|subtotal|total|taxa_entrega|troco_para|pedido_minimo)';

  IF v_soltas IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: coluna(s) de dinheiro ainda sem precisão declarada: %', v_soltas;
  END IF;

  -- Custo por unidade tem de manter as 10 casas — se caiu para 2, o
  -- CMV de insumo vendido a fração de centavo passa a sair errado.
  FOREACH v_nome IN ARRAY ARRAY['notas_fiscais_itens', 'estoque_entradas'] LOOP
    SELECT c.numeric_precision, c.numeric_scale INTO v_prec, v_esc
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = v_nome AND c.column_name = 'preco_unitario';
    IF v_prec <> 18 OR v_esc <> 10 THEN
      RAISE EXCEPTION 'FALHA: public.%.preco_unitario deveria ser numeric(18,10), está numeric(%,%).', v_nome, v_prec, v_esc;
    END IF;
  END LOOP;

  -- E o que era para ficar de fora ficou mesmo de fora.
  -- `data_type = 'numeric'` é obrigatório nestas duas conferências: para
  -- uma coluna integer o information_schema devolve escala 0, não NULL,
  -- e `combo_subprodutos.quantidade` (integer) acusaria falha à toa.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.data_type = 'numeric'
       AND c.numeric_scale IS NOT NULL
       AND ((c.table_name = 'config_delivery'   AND c.column_name IN ('origem_lat', 'origem_lng'))
         OR (c.table_name = 'delivery_pedidos'  AND c.column_name IN ('entrega_lat', 'entrega_lng')))
  ) THEN
    RAISE EXCEPTION 'FALHA: coordenada de entrega ganhou precisão fixa — isso erra a posição em quilômetros e quebra a taxa por distância.';
  END IF;

  -- O que se procura aqui é PRECISÃO DE DINHEIRO (escala 2) numa coluna
  -- que não é dinheiro, e não "qualquer escala declarada": desde a
  -- 20240101 as colunas de nota fiscal são numeric(12,4) de propósito, e
  -- 4 casas é exatamente o que uma quantidade precisa. Reprovar escala 4
  -- reprovava o certo — foi o que aconteceu no primeiro banco em que esta
  -- migration rodou.
  --
  -- O corte é em 4 casas: abaixo disso, quantidade fracionada e alíquota
  -- perdem dígito significativo (0,125 kg vira 0,13; 1,65% vira 1,7%).
  -- Escala ausente (numeric livre) continua válida — é como a maioria
  -- destas colunas nasceu.
  SELECT string_agg(format('%s.%s (numeric(%s,%s))', c.table_name, c.column_name, c.numeric_precision, c.numeric_scale),
                    ', ' ORDER BY c.table_name, c.column_name)
    INTO v_soltas
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public'
     AND c.data_type = 'numeric'
     AND c.numeric_scale IS NOT NULL
     AND c.numeric_scale < 4
     AND (c.column_name LIKE 'aliquota%'
       OR c.column_name = 'reducao_base_icms'
       OR c.column_name IN ('quantidade', 'quantidade_estoque', 'qtd', 'minimo', 'fator_conversao', 'fator_consumo_estoque'));

  IF v_soltas IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: quantidade ou alíquota ficou com precisão de dinheiro: %. Meio quilo perderia casa e alíquota de 1,65%% viraria 1,7%%.', v_soltas;
  END IF;

  -- Prova de que a coluna agora arredonda de verdade, e não só no nome.
  IF (10.004::numeric(12,2)) <> 10.00 OR (10.005::numeric(12,2)) <> 10.01 THEN
    RAISE EXCEPTION 'FALHA: numeric(12,2) não arredondou como esperado neste servidor.';
  END IF;

  RAISE NOTICE 'Colunas de dinheiro conferidas: valor gravado no banco agora tem sempre duas casas.';
END $conf$;
