# Runbook — Pendências manuais no Supabase (2026-07-06)

Aplicar no **SQL Editor** do projeto Supabase de produção. Todas as migrations são
idempotentes (`IF NOT EXISTS` / `ON CONFLICT` / `CREATE OR REPLACE`), então é seguro
rodar mesmo que já tenham sido aplicadas parcialmente. Rode **na ordem abaixo** por
causa das dependências entre elas.

## 1. SQL Editor — rodar nesta ordem

| Ordem | Arquivo | O que faz | Depende de |
|------|---------|-----------|------------|
| 1 | `20260706_drop_logs.sql` | Remove tabela legada `public.logs` (sem policy, inacessível). Independente. | — |
| 2 | `20260707_vendas_normalizadas.sql` | Cria `vendas`, `venda_itens`, `venda_pagamentos` (TD009 etapa 1). O app já faz gravação dupla. | — |
| 3 | `20260708_backfill_vendas.sql` | Backfill do histórico `sales` → tabelas novas. Idempotente. | 707 |
| 4 | `20260709_jarvas_resumo_vendas.sql` | RPC `jarvas_resumo_vendas` — agrega vendas no Postgres p/ a Edge Function. | 707, 708 |
| 5 | `20260710_financeiro.sql` | Tabela `lancamentos` + receita automática. `venda_id` referencia `vendas(id)`. | 707 |

> Cole o conteúdo de cada arquivo (em `supabase/migrations/`) no SQL Editor, um por vez,
> e confirme "Success" antes de passar para o próximo. Se 707/710 já estiverem aplicadas
> (o app já grava vendas normalizadas e lançamentos), o `IF NOT EXISTS` só ignora — sem erro.

## 2. Habilitar Realtime (Database → Replication)

Sem isso o painel do Jarvas e o mapa de mesas não atualizam sozinhos (TD010).

- [ ] Ativar Realtime na tabela **`jarvas_insights`**
- [ ] Ativar Realtime na tabela **`mesas`**

Caminho: **Database → Replication →** publicação `supabase_realtime` → adicionar as duas tabelas.

## 3. Verificação pós-aplicação

Rodar no SQL Editor para confirmar:

```sql
-- Tabelas relacionais existem e têm dados
select count(*) as vendas from public.vendas;
select count(*) as itens  from public.venda_itens;
select count(*) as lanc   from public.lancamentos;

-- RPC do Jarvas responde
select public.jarvas_resumo_vendas(now() - interval '30 days');

-- Tabela legada sumiu (deve dar erro "does not exist")
select 1 from public.logs limit 1;

-- Realtime: as duas tabelas devem aparecer
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

## 4. Não esquecer (ambiente)

- Edge Function `jarvas-assistente` precisa de `ANTHROPIC_API_KEY` (e opcional `JARVAS_MODEL`)
  configuradas em **Edge Functions → Secrets**. Sem ela o assistente retorna 500.
- Toda nova tabela precisa de **RLS configurada** — 707/710 já trazem as policies no SQL;
  confirme que RLS está *enabled* nas tabelas novas após aplicar.
