-- ══════════════════════════════════════════════════════════════════
-- TD004 — Estoque em tabela própria (antes: JSONB único em config)
--
-- Contexto: o saldo de estoque vivia inteiro em config.key='estoque'
-- como um objeto { [produtoId]: quantidade }, atualizado via
-- read-modify-write do objeto completo — sujeito a race condition
-- entre dispositivos (dois caixas descontando ao mesmo tempo perdem
-- update um do outro). Também não havia mínimo por produto: a UI e o
-- Jarvas usavam um limite "baixo" global hardcoded (10 unidades).
--
-- Esta migração cria public.estoque (uma linha por produto, com
-- mínimo próprio), uma RPC de decremento atômico para a baixa por
-- venda, e migra os dados existentes de config para a nova tabela.
--
-- NOTA: supabase/schema.sql declara products.id como uuid, mas a
-- produção real usa bigint (mesmo tipo já usado em
-- estoque_entradas.product_id e notas_fiscais_itens.product_id) —
-- TD006 já registra essa divergência entre schema.sql e o banco
-- real. produto_id aqui referencia bigint para bater com a produção.
--
-- Convenção: leitura para authenticated; insert/update para
-- caixa/gerente/admin (o caixa desconta estoque ao finalizar venda);
-- delete restrito a gerente/admin.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.estoque (
  produto_id  bigint      PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  quantidade  numeric     NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  minimo      numeric     NOT NULL DEFAULT 10 CHECK (minimo >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;

-- Qualquer logado lê
CREATE POLICY "estoque_select_auth"
  ON public.estoque FOR SELECT
  USING (auth.role() = 'authenticated');

-- Caixa desconta estoque ao finalizar venda; gerente/admin também ajustam
CREATE POLICY "estoque_insert_caixa_gerencia"
  ON public.estoque FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'));

CREATE POLICY "estoque_update_caixa_gerencia"
  ON public.estoque FOR UPDATE
  USING ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'));

CREATE POLICY "estoque_delete_gerencia"
  ON public.estoque FOR DELETE
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── RPC baixar_estoque ───────────────────────────────────────────────
-- Decremento atômico usado na baixa por venda (mesmo padrão de
-- limpar_reserva_mesa, 20260702): UPDATE direto no banco evita o
-- read-modify-write do cliente que causava a race condition.
CREATE OR REPLACE FUNCTION public.baixar_estoque(p_produto_id bigint, p_qtd numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.estoque
     SET quantidade = GREATEST(0, quantidade - p_qtd),
         updated_at = now()
   WHERE produto_id = p_produto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric) TO authenticated;

-- ── Backfill a partir do JSONB antigo (config.key = 'estoque') ──────
-- Só migra chaves numéricas que correspondem a um produto existente.
INSERT INTO public.estoque (produto_id, quantidade)
SELECT (kv.key)::bigint, (kv.value)::numeric
FROM public.config c
CROSS JOIN LATERAL jsonb_each_text(c.value) AS kv(key, value)
WHERE c.key = 'estoque'
  AND kv.key ~ '^\d+$'
  AND (kv.key)::bigint IN (SELECT id FROM public.products)
ON CONFLICT (produto_id) DO NOTHING;

DELETE FROM public.config WHERE key = 'estoque';
