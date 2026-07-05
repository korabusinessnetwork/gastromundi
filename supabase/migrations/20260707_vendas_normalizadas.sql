-- ══════════════════════════════════════════════════════════════════
-- TD009 (etapa 1) — Tabelas relacionais de vendas + gravação dupla
--
-- Contexto: sales guarda a venda inteira como blob JSONB
-- (sales.data), o que limita relatórios/consultas SQL (ex.: top
-- produtos, faturamento por método de pagamento) a processamento no
-- cliente. Esta etapa cria as tabelas relacionais (vendas,
-- venda_itens, venda_pagamentos) e o app passa a gravar nos dois
-- formatos ao mesmo tempo (dual-write).
--
-- IMPORTANTE: nesta etapa `sales` continua sendo a fonte de verdade —
-- nenhuma leitura foi migrada ainda. A etapa 2 fará o backfill do
-- histórico e migrará as leituras (relatórios, Jarvas) para as
-- tabelas novas.
--
-- Convenção: mesma RLS de `sales` — leitura e escrita restritas a
-- caixa/gerente/admin (o caixa finaliza vendas no PDV).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vendas (
  id           text        PRIMARY KEY,   -- mesmo id de sales, para reconciliação
  comanda      text,
  mesa         text,
  subtotal     numeric,
  taxa_servico boolean     NOT NULL DEFAULT false,
  valor_taxa   numeric     NOT NULL DEFAULT 0,
  valor_ajuste numeric     NOT NULL DEFAULT 0,
  total        numeric     NOT NULL,
  cashier      text,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venda_itens (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id             text        NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  product_id           bigint      REFERENCES public.products(id) ON DELETE SET NULL,
  nome                 text        NOT NULL, -- snapshot do nome na hora da venda
  preco                numeric     NOT NULL,
  qtd                  numeric     NOT NULL DEFAULT 1,
  cancelado            boolean     NOT NULL DEFAULT false,
  motivo_cancelamento  text,
  cancelado_por        text
);

CREATE TABLE IF NOT EXISTS public.venda_pagamentos (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id  text    NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  metodo    text    NOT NULL,
  valor     numeric NOT NULL
);

CREATE INDEX IF NOT EXISTS vendas_at_idx              ON public.vendas (at DESC);
CREATE INDEX IF NOT EXISTS venda_itens_venda_id_idx    ON public.venda_itens (venda_id);
CREATE INDEX IF NOT EXISTS venda_itens_product_id_idx  ON public.venda_itens (product_id);
CREATE INDEX IF NOT EXISTS venda_pagamentos_venda_id_idx ON public.venda_pagamentos (venda_id);
CREATE INDEX IF NOT EXISTS venda_pagamentos_metodo_idx   ON public.venda_pagamentos (metodo);

ALTER TABLE public.vendas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_itens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendas_all_caixa_up"
  ON public.vendas FOR ALL
  USING  ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'));

CREATE POLICY "venda_itens_all_caixa_up"
  ON public.venda_itens FOR ALL
  USING  ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'));

CREATE POLICY "venda_pagamentos_all_caixa_up"
  ON public.venda_pagamentos FOR ALL
  USING  ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'));
