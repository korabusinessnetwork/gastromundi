-- ══════════════════════════════════════════════════════════════════
-- NFC-e (modelo 65) — ESTADO de contingência por tenant (Leva 14)
-- multi-tenant (decisão 002/028) · white-label (decisão 017)
-- tenant_fiscal_config (20260731)
--
-- Quando a SEFAZ-RS cai, a lei manda emitir em CONTINGÊNCIA OFFLINE
-- (tpEmis=9): o cupom sai na hora pro cliente e a nota é transmitida
-- depois, quando a SEFAZ volta. Para o sistema saber que está nesse modo
-- (e já sair direto em contingência, sem tentar o online lento a cada
-- venda), guardamos um ESTADO DE OPERAÇÃO por tenant.
--
-- ┌─ FRONTEIRA DE SEGREDO ────────────────────────────────────────────┐
-- │ contingencia_ativa/contingencia_desde são ESTADO NÃO-SECRETO (um   │
-- │ booleano de operação + um carimbo de hora). Nada de certificado/   │
-- │ CSC. É estado GERIDO PELO SISTEMA: o Edge (emitir-nfce) LIGA quando │
-- │ a SEFAZ cai (falha de transmissão / serviço paralisado) e DESLIGA  │
-- │ quando uma emissão online é autorizada (prova que voltou). Não é    │
-- │ editado à mão pela tela — o PainelFiscal só EXIBE o estado.        │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ⚠️ DECISÃO DE ESCRITA DO ESTADO (registrada no relatório):
-- A policy fiscal_config_write_admin (20260731) exige gastro_role='admin'
-- para QUALQUER escrita em tenant_fiscal_config. Mas o Edge roda
-- USER-SCOPED com o token do CAIXA que emite — e o caixa NÃO é
-- necessariamente admin (a insert policy de nfce_emitidas, 20260733, só
-- exige ser membro do tenant, não admin). Um UPDATE cru do estado por um
-- caixa não-admin seria BLOQUEADO pela RLS e o modo de contingência nunca
-- persistiria.
-- Opção escolhida (a mais simples que NÃO afrouxa a fronteira de segredo):
-- uma RPC SECURITY DEFINER `set_contingencia_fiscal(p_ativa)` que atualiza
-- SOMENTE essas duas colunas de operação, e SOMENTE na linha do tenant do
-- chamador (tenant_atual_id()). Não expõe nem toca em nenhum campo
-- sensível (que aliás nem existe nesta tabela) e não dá ao caixa poder de
-- editar os demais campos fiscais — só alternar o flag de contingência do
-- próprio estabelecimento. Preferida a uma policy adicional porque RLS é
-- row-level (não column-level): restringir QUAIS colunas um não-admin pode
-- mexer exigiria GRANT UPDATE(col)/trigger — mais complexo e frágil.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- ⚠️ Aplicar no SQL Editor do Supabase (como as anteriores).
-- ══════════════════════════════════════════════════════════════════

-- Estado de operação (NÃO-secreto), gerido pelo sistema.
ALTER TABLE public.tenant_fiscal_config
  ADD COLUMN IF NOT EXISTS contingencia_ativa boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenant_fiscal_config
  ADD COLUMN IF NOT EXISTS contingencia_desde timestamptz;

-- RPC restrita para o Edge alternar o estado sob o token do caixa (que pode
-- não ser admin). SECURITY DEFINER: roda com o dono da função (bypassa a RLS
-- de escrita), mas por construção só mexe em contingencia_ativa/desde e só na
-- linha do tenant do chamador — a fronteira de segredo permanece intacta.
CREATE OR REPLACE FUNCTION public.set_contingencia_fiscal(p_ativa boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.tenant_fiscal_config
     SET contingencia_ativa = p_ativa,
         contingencia_desde = CASE WHEN p_ativa THEN now() ELSE NULL END,
         updated_at         = now()
   WHERE tenant_id = public.tenant_atual_id();
$$;

-- Só usuários autenticados (o Edge roda com o JWT do caixa). O corpo já
-- restringe ao tenant do chamador — nunca a linha de outro estabelecimento.
REVOKE ALL ON FUNCTION public.set_contingencia_fiscal(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_contingencia_fiscal(boolean) TO authenticated;
