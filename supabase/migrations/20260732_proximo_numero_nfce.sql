-- ══════════════════════════════════════════════════════════════════
-- NFC-e (modelo 65) — incremento ATÔMICO do número da nota (Leva 4)
-- docs/08_DECISOES/adr-008.md · decisão 002/028 · tenant_fiscal_config (20260731)
--
-- ┌─ O PROBLEMA ─────────────────────────────────────────────────────┐
-- │ O nNF (número sequencial da NFC-e) NÃO pode repetir dentro de uma │
-- │ série — nota com nNF repetido é REJEITADA pela SEFAZ (duplicidade)│
-- │ A Edge Function `emitir-nfce` lia `proximo_numero` e usava direto  │
-- │ (comentário "NOTA (Leva 4)" marcava o ponto). Sob emissões        │
-- │ concorrentes (dois caixas fechando ao mesmo tempo) essa leitura +  │
-- │ escrita separada tem corrida: os dois leem N, os dois emitem N.    │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ A SOLUÇÃO ──────────────────────────────────────────────────────┐
-- │ Uma RPC que faz `UPDATE ... RETURNING` numa transação: reserva o   │
-- │ número e incrementa de forma ATÔMICA. O UPDATE trava a linha do    │
-- │ tenant; um segundo chamador espera e pega o próximo — nunca o       │
-- │ mesmo. Devolve o número RESERVADO (o que a nota vai usar) e deixa   │
-- │ `proximo_numero` já apontando para o seguinte.                     │
-- └───────────────────────────────────────────────────────────────────┘
--
-- SEGURANÇA (mesmo padrão de provisionar_tenant/alterar_plano_tenant):
-- • SECURITY DEFINER (escreve em tenant_fiscal_config, cuja policy de
--   escrita exige gastro_role='admin'; a emissão roda como caixa). A
--   guarda é interna: o chamador só avança o contador do PRÓPRIO tenant
--   — `p_tenant_id = tenant_atual_id()` — OU é super-admin. Nunca deixa
--   um tenant mexer no número de outro (isolamento, decisão 028).
--   `IS NOT TRUE` trata NULL e false igual (lição do 20260730).
-- • REVOKE de PUBLIC/anon; EXECUTE só para authenticated. A Edge Function
--   chama com o JWT do caixa (client user-scoped), então tenant_atual_id()
--   resolve o tenant certo.
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT reexecutáveis.
-- PRÉ-REQUISITOS: tenant_fiscal_config (20260731), tenant_atual_id() e
-- is_super_admin() (20260723/20260730).
-- ⚠️ RLS: nenhuma tabela nova; a RPC roda SECURITY DEFINER e não altera as
--    policies de tenant_fiscal_config. Nada a conferir no painel.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.proximo_numero_nfce(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero integer;
BEGIN
  -- ── Autorização: só o próprio tenant (ou a plataforma) avança o seu contador ──
  IF NOT (p_tenant_id = public.tenant_atual_id() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para numerar NFC-e deste estabelecimento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Reserva atômica: trava a linha, devolve o número atual e incrementa ──
  UPDATE public.tenant_fiscal_config
     SET proximo_numero = proximo_numero + 1,
         updated_at     = now()
   WHERE tenant_id = p_tenant_id
  RETURNING proximo_numero - 1 INTO v_numero;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento sem configuração fiscal: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_numero;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.proximo_numero_nfce(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.proximo_numero_nfce(uuid) TO authenticated;
