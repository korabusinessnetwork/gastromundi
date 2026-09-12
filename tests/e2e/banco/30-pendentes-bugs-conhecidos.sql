-- PENDENTE, FALHA DE PROPÓSITO ENQUANTO O BUG EXISTIR.
--
-- Este arquivo afirma o comportamento CERTO, não o atual. Ele é a prova que
-- acompanha o bug B02 do relatório de varredura: venda cancelada continua
-- entrando no faturamento das funções agregadoras do banco, enquanto o front
-- (RelatorioView.jsx:313) tira a venda cancelada de todos os relatórios.
--
-- Quando o bug for corrigido, este arquivo passa e deve ser movido para a
-- bateria normal (renomear para 21-relatorio.sql).
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\set ADMIN_A '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"gastro_role":"admin","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}}'

-- cenário: duas vendas válidas de 100 e 50, e uma cancelada de 70
-- a janela do teste tem de conter só as vendas dele, senão o número medido
-- mistura com o que outra suíte deixou no banco
DELETE FROM public.venda_pagamentos WHERE venda_id IN (SELECT id FROM public.vendas WHERE at >= '2026-09-10 00:00:00-03' AND at < '2026-09-12 00:00:00-03');
DELETE FROM public.venda_itens      WHERE venda_id IN (SELECT id FROM public.vendas WHERE at >= '2026-09-10 00:00:00-03' AND at < '2026-09-12 00:00:00-03');
DELETE FROM public.vendas           WHERE at >= '2026-09-10 00:00:00-03' AND at < '2026-09-12 00:00:00-03';
INSERT INTO public.vendas (id, mesa, subtotal, taxa_servico, valor_taxa, valor_ajuste, total, cashier, at, tenant_id, cancelada) VALUES
 ('qa-cxl-01','1',100,false,0,0,100,'qa-caixa-a','2026-09-10 23:30:00-03','aaaaaaaa-0000-4000-8000-000000000001',false),
 ('qa-cxl-02','1', 50,false,0,0, 50,'qa-caixa-a','2026-09-11 02:00:00-03','aaaaaaaa-0000-4000-8000-000000000001',false),
 ('qa-cxl-03','1', 70,false,0,0, 70,'qa-caixa-a','2026-09-11 12:00:00-03','aaaaaaaa-0000-4000-8000-000000000001',true);
INSERT INTO public.venda_pagamentos (venda_id, metodo, valor, tenant_id) VALUES
 ('qa-cxl-01','dinheiro',100,'aaaaaaaa-0000-4000-8000-000000000001'),
 ('qa-cxl-02','pix',50,'aaaaaaaa-0000-4000-8000-000000000001'),
 ('qa-cxl-03','pix',70,'aaaaaaaa-0000-4000-8000-000000000001');

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', :'ADMIN_A', false);

DO $$
DECLARE r jsonb; fat numeric; n int; esperado numeric := 150; dia jsonb;
BEGIN
  r := public.relatorio_vendas('2026-09-10 00:00:00-03','2026-09-11 23:59:59-03', 5, 'America/Sao_Paulo');
  fat := (r->>'faturamento')::numeric; n := (r->>'numero_vendas')::int;
  IF fat <> esperado THEN
    RAISE EXCEPTION 'PENDENTE B02: relatorio_vendas devolveu faturamento % e o certo, sem a venda cancelada, e %', fat, esperado;
  END IF;
  IF n <> 2 THEN
    RAISE EXCEPTION 'PENDENTE B02: relatorio_vendas contou % vendas e o certo e 2', n;
  END IF;
  RAISE NOTICE 'PASSOU  B02 relatorio_vendas ignora venda cancelada';

  r := public.jarvas_resumo_vendas('2026-09-10 00:00:00-03', 5);
  IF (r->>'total')::numeric <> esperado THEN
    RAISE EXCEPTION 'PENDENTE B02: jarvas_resumo_vendas devolveu total % e o certo e %', r->>'total', esperado;
  END IF;
  RAISE NOTICE 'PASSOU  B02 jarvas_resumo_vendas ignora venda cancelada';

  -- B03: a venda das 23h30 do dia 10 pertence ao dia 10 no fuso do estabelecimento
  dia := (r->'por_dia');
  IF NOT (dia ? '2026-09-10') THEN
    RAISE EXCEPTION 'PENDENTE B03: jarvas_resumo_vendas agrupou por dia em UTC, a venda das 23h30 do dia 10 caiu em %', dia::text;
  END IF;
  RAISE NOTICE 'PASSOU  B03 jarvas_resumo_vendas agrupa pelo dia do estabelecimento';
END $$;
