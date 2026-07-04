-- ══════════════════════════════════════════════════════════════════
-- JARVAS (fase 1) — eventos + insights
--
-- Spec: docs/03_REGRAS_DE_NEGOCIO/JARVAS.md (decisão 010)
-- Pré-requisito: Fase 4 concluída (20240107_rls_por_role.sql)
--
-- jarvas_eventos  → event bus persistido: módulos emitem eventos
--                   (fire-and-forget, nunca bloqueia a operação)
-- jarvas_insights → saídas do Jarvas: insight | alerta | sugestao,
--                   sempre acionáveis e rastreáveis aos eventos-fonte
--
-- Convenções do app:
--   - leitura para authenticated, escrita para gerente/admin
--   - severidade segue o Design System: info | warning | danger
--   - visibilidade 'estrategico' (financeiro/estratégia) só gerente/admin
-- ══════════════════════════════════════════════════════════════════

-- ── jarvas_eventos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jarvas_eventos (
  id          bigserial   PRIMARY KEY,
  tipo        text        NOT NULL,              -- ex.: 'venda.finalizada', 'caixa.fechado', 'estoque.baixa'
  modulo      text        NOT NULL,              -- ex.: 'pdv', 'caixa', 'estoque', 'pedidos', 'financeiro'
  payload     jsonb       NOT NULL DEFAULT '{}',
  operator_id text,                              -- quem originou (username), se aplicável
  processado  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvas_eventos_tipo_idx       ON public.jarvas_eventos (tipo);
CREATE INDEX IF NOT EXISTS jarvas_eventos_processado_idx ON public.jarvas_eventos (processado, created_at);
CREATE INDEX IF NOT EXISTS jarvas_eventos_created_at_idx ON public.jarvas_eventos (created_at DESC);

ALTER TABLE public.jarvas_eventos ENABLE ROW LEVEL SECURITY;

-- Qualquer logado emite eventos (fire-and-forget dos módulos)
CREATE POLICY "jarvas_eventos_insert_auth"
  ON public.jarvas_eventos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Só gerente/admin leem e marcam como processado (motor de análise)
CREATE POLICY "jarvas_eventos_select_gerencia"
  ON public.jarvas_eventos FOR SELECT
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

CREATE POLICY "jarvas_eventos_update_gerencia"
  ON public.jarvas_eventos FOR UPDATE
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── jarvas_insights ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jarvas_insights (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text        NOT NULL CHECK (tipo IN ('insight', 'alerta', 'sugestao')),
  severidade   text        NOT NULL DEFAULT 'info' CHECK (severidade IN ('info', 'warning', 'danger')),
  visibilidade text        NOT NULL DEFAULT 'operacional' CHECK (visibilidade IN ('operacional', 'estrategico')),
  modulo       text        NOT NULL,              -- módulo de origem da análise
  titulo       text        NOT NULL,
  descricao    text        NOT NULL,
  acao         jsonb,                             -- ação sugerida: { label, tipo, params } — sugestão sem ação clara não é exibida
  origem       jsonb       NOT NULL DEFAULT '{}', -- rastreabilidade: { evento_ids: [], dados: {} }
  status       text        NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'lido', 'descartado', 'executado')),
  status_por   text,                              -- quem mudou o status (username)
  status_em    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvas_insights_status_idx     ON public.jarvas_insights (status, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvas_insights_tipo_idx       ON public.jarvas_insights (tipo);
CREATE INDEX IF NOT EXISTS jarvas_insights_created_at_idx ON public.jarvas_insights (created_at DESC);

ALTER TABLE public.jarvas_insights ENABLE ROW LEVEL SECURITY;

-- Operacionais: qualquer logado lê; estratégicos: só gerente/admin
CREATE POLICY "jarvas_insights_select_operacional"
  ON public.jarvas_insights FOR SELECT
  USING (
    visibilidade = 'operacional' AND auth.role() = 'authenticated'
  );

CREATE POLICY "jarvas_insights_select_estrategico"
  ON public.jarvas_insights FOR SELECT
  USING (
    visibilidade = 'estrategico' AND (auth.jwt() ->> 'role') IN ('gerente', 'admin')
  );

-- Só gerente/admin criam insights (motor de análise) e mudam status
CREATE POLICY "jarvas_insights_insert_gerencia"
  ON public.jarvas_insights FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

CREATE POLICY "jarvas_insights_update_gerencia"
  ON public.jarvas_insights FOR UPDATE
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));
