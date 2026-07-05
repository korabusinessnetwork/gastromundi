-- ══════════════════════════════════════════════════════════════════
-- Módulo Financeiro — fase 1 (docs/03_REGRAS_DE_NEGOCIO/FINANCEIRO.md)
--
-- Contexto: lançamentos (receita/despesa), receita automática por
-- venda (pagamento aprovado), fiado como conta a receber, baixa de
-- contas e fluxo de caixa previsto vs realizado. NÃO inclui nesta
-- fase: estorno/reversão, margem por custo de estoque, conciliação
-- bancária, DRE, centros de custo, despesa automática por compra de
-- estoque (fases futuras).
--
-- venda_id referencia public.vendas(id) (TD009) — a receita
-- automática nasce da venda já normalizada, não do blob de sales.
--
-- Convenção: leitura/escrita de lançamentos restrita a gerente/admin
-- (mesmo padrão de estoque/mesas) — EXCETO o insert de receita
-- automática, que nasce da finalização da venda feita pelo caixa.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lancamentos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria   text        NOT NULL,              -- 'vendas' | 'aluguel' | 'insumos' | 'salarios' | 'outros' ...
  descricao   text,
  valor       numeric     NOT NULL CHECK (valor > 0),
  competencia date        NOT NULL,
  vencimento  date,                               -- obrigatório p/ contas (validado no app)
  status      text        NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto', 'pago', 'recebido', 'vencido')),
  origem      text        NOT NULL DEFAULT 'manual' CHECK (origem IN ('venda', 'manual', 'estoque')),
  venda_id    text        REFERENCES public.vendas(id) ON DELETE SET NULL,
  retroativo  boolean     NOT NULL DEFAULT false,
  criado_por  text,
  baixado_por text,
  baixado_em  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lancamentos_competencia_idx ON public.lancamentos (competencia);
CREATE INDEX IF NOT EXISTS lancamentos_status_idx      ON public.lancamentos (status);
CREATE INDEX IF NOT EXISTS lancamentos_tipo_idx         ON public.lancamentos (tipo);
CREATE INDEX IF NOT EXISTS lancamentos_venda_id_idx     ON public.lancamentos (venda_id);

ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

-- Gerente/admin têm acesso total (ver, lançar despesa/conta, baixar — FINANCEIRO.md)
CREATE POLICY "lancamentos_all_gerencia"
  ON public.lancamentos FOR ALL
  USING  ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- Caixa só pode inserir a receita automática nascida da própria venda finalizada
CREATE POLICY "lancamentos_insert_venda_caixa"
  ON public.lancamentos FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'caixa' AND origem = 'venda');
