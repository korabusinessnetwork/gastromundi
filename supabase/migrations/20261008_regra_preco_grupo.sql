-- ══════════════════════════════════════════════════════════════════
-- Como o grupo de escolha vira dinheiro: somar, cobrar a mais cara,
-- ou média.
--
-- ┌─ O buraco ────────────────────────────────────────────────────────┐
-- │ O preço de um item com escolhas era SEMPRE a soma das opções      │
-- │ (src/lib/combos.js, somaAcrescimos). Isso está certo para extras  │
-- │ ("bacon +4, ovo +3") e está errado para tudo o que é FRAÇÃO de um │
-- │ produto só.                                                        │
-- │                                                                    │
-- │ O caso que quebra é a pizzaria. "Escolha 4 sabores" com quatro    │
-- │ sabores de R$ 40 cobrava R$ 160 — quatro pizzas. O jeito de       │
-- │ contornar era zerar o preço dos sabores, e aí o sabor caro saía   │
-- │ pelo preço do barato: o dono escolhia entre cobrar demais ou de   │
-- │ menos, e o sistema não tinha como estar certo.                     │
-- │                                                                    │
-- │ Não é falta de campo no cadastro — é falta de REGRA. Mercado usa  │
-- │ três, e todas as três aparecem no mesmo estabelecimento: soma nos │
-- │ adicionais, maior valor nos sabores, média em quem prefere assim. │
-- └────────────────────────────────────────────────────────────────────┘
--
-- Por que no grupo e não no produto: "Pizza Grande" tem o grupo de
-- SABORES (cobra o mais caro) e o grupo de BORDA (soma) ao mesmo tempo.
-- A regra é de cada grupo; grupos diferentes sempre se somam entre si.
--
-- Default 'soma' de propósito: é exatamente o que o sistema fazia até
-- aqui, então nenhum cadastro existente muda de preço ao aplicar esta
-- migração. Quem quiser a regra nova liga grupo a grupo.
--
-- A quantidade não multiplica em 'maior': 2/4 de calabresa continua
-- sendo parte de UMA pizza, não duas. Em 'media' ela pondera — é o que
-- faz "3/4 calabresa + 1/4 portuguesa" custar mais perto da calabresa.
--
-- RLS: nada muda. Nenhuma tabela nova, nenhuma policy nova —
-- grupos_escolha já tem RLS por tenant.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. A coluna ────────────────────────────────────────────────────
ALTER TABLE public.grupos_escolha
  ADD COLUMN IF NOT EXISTS regra_preco text NOT NULL DEFAULT 'soma';

DO $ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grupos_escolha_regra_preco_check'
  ) THEN
    ALTER TABLE public.grupos_escolha
      ADD CONSTRAINT grupos_escolha_regra_preco_check
      CHECK (regra_preco IN ('soma', 'maior', 'media'));
  END IF;
END;
$ck$;

COMMENT ON COLUMN public.grupos_escolha.regra_preco IS
  'O que o grupo faz com o preço das opções escolhidas. soma: cada uma soma o próprio valor (extras). maior: cobra só a mais cara (sabores de pizza — meio a meio vale o meio mais caro). media: cobra a média ponderada das frações escolhidas.';

-- ══════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — executa a regra recém-criada contra os três casos e
-- aborta se algum divergir. Cria um estabelecimento descartável e
-- apaga tudo o que criou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_tenant uuid;
  v_combo  uuid;
  v_grupo  uuid;
  v_regra  text;
BEGIN
  INSERT INTO public.tenants (nome, slug)
       VALUES ('__conf_regra_preco__', '__conf_regra_preco__') RETURNING id INTO v_tenant;
  INSERT INTO public.combos (nome, preco_total, tenant_id)
       VALUES ('__conf_combo__', 10, v_tenant) RETURNING id INTO v_combo;

  -- Caso 1 — cadastro que já existia continua somando. Um grupo criado
  -- sem dizer a regra tem de sair de 'soma', ou aplicar esta migração
  -- mudaria calado o preço de quem já vende.
  INSERT INTO public.grupos_escolha (nome, minimo, maximo, origem, combo_id, tenant_id)
       VALUES ('__conf__', 1, 1, 'lista', v_combo, v_tenant) RETURNING id INTO v_grupo;

  SELECT regra_preco INTO v_regra FROM public.grupos_escolha WHERE id = v_grupo;
  IF v_regra <> 'soma' THEN
    RAISE EXCEPTION 'Regra de preço: grupo novo nasceu como "%" em vez de somar — cadastro antigo mudaria de preço sozinho.', v_regra;
  END IF;

  -- Caso 2 — as três regras conhecidas entram.
  FOREACH v_regra IN ARRAY ARRAY['soma', 'maior', 'media'] LOOP
    UPDATE public.grupos_escolha SET regra_preco = v_regra WHERE id = v_grupo;
  END LOOP;

  -- Caso 3 — qualquer outra é recusada pelo banco. Sem o CHECK, um
  -- valor digitado errado viraria "soma" calado no front e o dono
  -- nunca saberia por que a pizza cobrou demais.
  BEGIN
    UPDATE public.grupos_escolha SET regra_preco = 'metade' WHERE id = v_grupo;
    RAISE EXCEPTION 'Regra de preço: o banco aceitou uma regra desconhecida.';
  EXCEPTION WHEN check_violation THEN
    NULL; -- recusou, que é o esperado
  END;

  DELETE FROM public.grupos_escolha WHERE tenant_id = v_tenant;
  DELETE FROM public.combos         WHERE tenant_id = v_tenant;
  DELETE FROM public.tenants        WHERE id = v_tenant;

  RAISE NOTICE 'Regra de preço do grupo conferida: nasce somando, aceita as três conhecidas e recusa o resto.';
END;
$conf$;
