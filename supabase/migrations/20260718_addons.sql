-- ══════════════════════════════════════════════════════════════════
-- Camada de Comercialização — Fase 3 (add-ons pagos: NF-e e TEF)
-- docs/08_DECISOES/adr-005.md · decisão 019 · docs/09_BACKLOG/plano_tecnico_comercializacao.md
--
-- Add-ons são um eixo ORTOGONAL ao plano (ADR-005 §3, decisão 019):
-- disponíveis em TODOS os tiers, contratados à parte, com ciclo/
-- cobrança independentes da mensalidade (ADR-006 — inadimplência de
-- add-on nunca bloqueia o sistema, só o próprio add-on). Por isso
-- `tenant_addons` não entra em `planos_modulos` nem em `assinaturas`.
--
-- Nenhuma linha é inserida para o tenant atual: nenhum add-on fica
-- ativo por padrão, então o fluxo de pagamento de hoje continua
-- idêntico até alguém habilitar NF-e/TEF explicitamente.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.addons (
  codigo    text PRIMARY KEY,
  nome      text NOT NULL,
  descricao text
);

INSERT INTO public.addons (codigo, nome, descricao) VALUES
  ('nfe', 'Emissão de Nota Fiscal', 'Emite NF-e/NFC-e automaticamente ao finalizar o pagamento (add-on pago, decisão 019).'),
  ('tef', 'Pagamento por TEF', 'Integra o PDV a uma maquininha/terminal de cartão (add-on pago, decisão 019).')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tenant_addons (
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id),
  addon_codigo text        NOT NULL REFERENCES public.addons(codigo),
  ativo        boolean     NOT NULL DEFAULT true,
  ativado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, addon_codigo)
);

ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "addons_select_auth" ON public.addons;
CREATE POLICY "addons_select_auth"
  ON public.addons FOR SELECT
  USING (auth.role() = 'authenticated');

ALTER TABLE public.tenant_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_addons_select_auth" ON public.tenant_addons;
CREATE POLICY "tenant_addons_select_auth"
  ON public.tenant_addons FOR SELECT
  USING (auth.role() = 'authenticated');
-- Sem política de escrita pelo app: ativar/desativar um add-on é uma
-- ação administrativa da PLATAFORMA (não do estabelecimento cliente)
-- nesta fase — mesma convenção de `planos`/`planos_modulos` (Fase 2).
-- Uma tela de administração para isso fica para quando F017/F019
-- (as features de verdade) entrarem em desenvolvimento.

-- Conveniência para RLS futura (quando NF-e/TEF passarem a gravar
-- dados de verdade — hoje são só stubs, nada é persistido além do
-- evento no Jarvas). Mesma convenção de tenant_atual_tem_modulo
-- (Fase 2): resolve sozinha o único tenant de hoje.
CREATE OR REPLACE FUNCTION public.tenant_atual_tem_addon(p_addon text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_addons ta
    WHERE ta.tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
      AND ta.addon_codigo = p_addon
      AND ta.ativo = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_atual_tem_addon(text) TO authenticated;
