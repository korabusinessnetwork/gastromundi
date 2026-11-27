-- ══════════════════════════════════════════════════════════════════
-- Índices de tenant_id que faltavam — leitura rápida com muitos
-- estabelecimentos no mesmo banco
-- decisão 002 (multi-tenant por RLS) · decisão 017 (SaaS multi-estabelecimento)
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Com RLS ligada, TODA consulta destas tabelas ganha um           │
-- │ `tenant_id = tenant_atual_id()` invisível, colado pelo Postgres │
-- │ antes de rodar. Sem índice em tenant_id, esse filtro só pode    │
-- │ ser resolvido lendo a tabela inteira e jogando fora as linhas   │
-- │ dos outros estabelecimentos.                                    │
-- │                                                                  │
-- │ Hoje isso não dói: são poucos estabelecimentos e tabelas        │
-- │ pequenas. A conta muda de forma quando o produto vende em       │
-- │ escala — a mesma tela que abre em 30ms com 3 estabelecimentos   │
-- │ passa a ler as linhas de 300 para mostrar as de 1. O custo de   │
-- │ criar o índice agora é zero; depois é um incidente.             │
-- │                                                                  │
-- │ A leva 20260724, que ligou o multi-tenant, já criou índice de   │
-- │ tenant_id nas tabelas do caminho quente (vendas, venda_itens,   │
-- │ products, clientes, delivery...). Estas nove ficaram de fora.   │
-- └───────────────────────────────────────────────────────────────────┘
--
-- COMO A LISTA FOI ESCOLHIDA: cada índice abaixo corresponde a uma
-- consulta que existe no código hoje, com a ordenação que ela usa.
-- Índice que ninguém usa não é neutro — ele custa em todo INSERT e
-- UPDATE da tabela e ainda ocupa disco. Por isso ficaram DE FORA:
--
--   • subprodutos, combo_subprodutos, locais_impressao — nenhuma
--     consulta no front-end (a tela de Subprodutos saiu do produto);
--   • estoque_subprodutos, estoque_baixas_aplicadas — lidas só de
--     dentro de RPC, sempre pela chave primária (subproduto_id, op_id);
--   • assinaturas, config_delivery, tenant_fiscal_config — tenant_id
--     JÁ é a chave primária, que é um índice.
--
-- CUSTO DE RODAR: são tabelas pequenas (estoque, combos, notas fiscais
-- e unidades de medida têm dezenas a centenas de linhas por
-- estabelecimento). Cada CREATE INDEX leva milissegundos. A maior é
-- `vendas`; se um dia ela crescer a ponto de o bloqueio de escrita
-- incomodar, o mesmo comando aceita CREATE INDEX CONCURRENTLY, que não
-- trava — mas aí precisa rodar fora de transação, um comando por vez.
--
-- Idempotente: CREATE INDEX IF NOT EXISTS / DROP INDEX IF EXISTS.
-- Pode rodar duas vezes sem efeito colateral.
--
-- NÃO cria tabela nem função nova: nenhuma política de RLS precisa ser
-- mexida no painel do Supabase por causa desta migration.
-- ══════════════════════════════════════════════════════════════════

-- ── Estoque ────────────────────────────────────────────────────────
-- AppContext carrega o estoque inteiro do estabelecimento na abertura
-- do PDV (`select produto_id, quantidade, minimo`). É a consulta que
-- mais se repete no dia.
CREATE INDEX IF NOT EXISTS estoque_tenant_id_idx
  ON public.estoque (tenant_id);

-- Histórico de entradas por nota fiscal: cresce sem parar e só é lido
-- por estabelecimento.
CREATE INDEX IF NOT EXISTS estoque_entradas_tenant_id_idx
  ON public.estoque_entradas (tenant_id);

-- ── Fechamentos de caixa ───────────────────────────────────────────
-- Sempre "os fechamentos deste estabelecimento, do mais novo para o
-- mais velho". Composto porque a ordenação entra no índice: o Postgres
-- lê as primeiras linhas já na ordem certa, sem ordenar nada.
CREATE INDEX IF NOT EXISTS fechamentos_tenant_created_idx
  ON public.fechamentos (tenant_id, created_at DESC);

-- ── Notas fiscais de entrada ───────────────────────────────────────
-- Mesma forma: lista da aba Notas Fiscais, mais nova primeiro.
CREATE INDEX IF NOT EXISTS notas_fiscais_tenant_created_idx
  ON public.notas_fiscais (tenant_id, created_at DESC);

-- Os itens são lidos por nota (`eq nota_fiscal_id`) dentro do
-- estabelecimento. O composto atende os dois filtros de uma vez —
-- e é o único índice que essa tabela tem para nota_fiscal_id, já que
-- chave estrangeira no Postgres NÃO cria índice sozinha.
CREATE INDEX IF NOT EXISTS notas_fiscais_itens_tenant_nota_idx
  ON public.notas_fiscais_itens (tenant_id, nota_fiscal_id);

-- ── Combos ─────────────────────────────────────────────────────────
-- Tela de Combos (mais novo primeiro) e carga do PDV.
CREATE INDEX IF NOT EXISTS combos_tenant_created_idx
  ON public.combos (tenant_id, created_at DESC);

-- ── Configuração fiscal por item ───────────────────────────────────
-- A tela de Impostos carrega a configuração de todos os itens do
-- estabelecimento de uma vez.
CREATE INDEX IF NOT EXISTS itens_fiscal_tenant_id_idx
  ON public.itens_fiscal (tenant_id);

-- ── Unidades de medida ─────────────────────────────────────────────
-- Tabela pequena, mas lida em sete lugares (cadastro de produto,
-- configurações, importação): é a consulta de apoio mais frequente.
CREATE INDEX IF NOT EXISTS unidades_medida_tenant_id_idx
  ON public.unidades_medida (tenant_id);

-- ── Vendas: trocar o índice simples pelo composto ──────────────────
-- `vendas` já tinha índice em tenant_id e outro em `at DESC`, mas
-- nenhum dos dois serve a consulta real, que é "as vendas DESTE
-- estabelecimento, da mais recente para a mais antiga". Com os dois
-- separados o banco filtra por um e ordena o resto na memória.
--
-- O composto (tenant_id, at DESC) resolve filtro e ordenação juntos e
-- torna `vendas_tenant_id_idx` redundante — um índice cujo prefixo é
-- outro índice só custa escrita. Por isso ele sai.
--
-- `vendas_at_idx` (só `at DESC`) FICA: o Console da plataforma soma
-- vendas de todos os estabelecimentos por período, e aí o filtro é só
-- a data (analytics_plataforma, 20260912).
CREATE INDEX IF NOT EXISTS vendas_tenant_at_idx
  ON public.vendas (tenant_id, at DESC);

DROP INDEX IF EXISTS public.vendas_tenant_id_idx;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_esperados text[] := ARRAY[
    'estoque_tenant_id_idx',
    'estoque_entradas_tenant_id_idx',
    'fechamentos_tenant_created_idx',
    'notas_fiscais_tenant_created_idx',
    'notas_fiscais_itens_tenant_nota_idx',
    'combos_tenant_created_idx',
    'itens_fiscal_tenant_id_idx',
    'unidades_medida_tenant_id_idx',
    'vendas_tenant_at_idx'
  ];
  v_nome    text;
  v_criados integer := 0;
BEGIN
  FOREACH v_nome IN ARRAY v_esperados LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = v_nome
    ) THEN
      RAISE EXCEPTION 'Índice % não foi criado.', v_nome;
    END IF;
    v_criados := v_criados + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'vendas_tenant_id_idx'
  ) THEN
    RAISE EXCEPTION 'vendas_tenant_id_idx deveria ter sido removido (o composto vendas_tenant_at_idx o substitui).';
  END IF;

  RAISE NOTICE '% índices de tenant_id conferidos. Consulta por estabelecimento não lê mais a tabela inteira.', v_criados;
END $conf$;
