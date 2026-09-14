-- ══════════════════════════════════════════════════════════════════
-- Cancelamento de venda vira coluna em `vendas` (TD009 etapa 3)
--
-- ┌─ POR QUE ────────────────────────────────────────────────────────┐
-- │ Até aqui cancelar uma venda fechada fazia duas coisas: marcava   │
-- │ `data.cancelada` no blob de `sales` e APAGAVA as linhas de       │
-- │ `vendas`, `venda_itens` e `venda_pagamentos`. Funcionava porque  │
-- │ o blob guardava a trilha de auditoria e o caminho de leitura é   │
-- │ relacional-first: apagar as linhas tirava a venda dos relatórios │
-- │ sem precisar de migration.                                       │
-- │                                                                  │
-- │ A etapa 3 do TD009 encerra a escrita em `sales`. Sem o blob,     │
-- │ apagar as linhas apagaria a venda cancelada do banco inteiro:    │
-- │ some do relatório e some da auditoria junto. Cancelamento não é  │
-- │ remoção de dado, é mudança de estado — e estado quer coluna.     │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ O QUE MUDA ─────────────────────────────────────────────────────┐
-- │ Quatro colunas opcionais em `vendas`. O `DEFAULT false` classi-  │
-- │ fica todo o histórico como não cancelado, que é o que ele é: as  │
-- │ vendas canceladas do passado já tinham suas linhas apagadas.     │
-- │                                                                  │
-- │ `venda_itens` e `venda_pagamentos` param de ser apagados no      │
-- │ cancelamento (mudança no app, não aqui). As telas já filtram     │
-- │ `cancelada` no cliente, então a venda marcada continua fora dos  │
-- │ relatórios, agora com os itens preservados para auditoria.       │
-- │                                                                  │
-- │ RLS: nenhuma política nova. `vendas_all_caixa_up` (20260707) já  │
-- │ cobre o UPDATE, e o isolamento por `tenant_id` veio na           │
-- │ 20260724. Coluna nova em tabela existente herda as duas.         │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ORDEM DE DEPLOY: esta migration ANTES do deploy do frontend. O app
-- novo cancela marcando estas colunas; sem elas o cancelamento falha
-- com mensagem explícita (e de propósito, para não fingir sucesso).
-- O app antigo continua funcionando com as colunas presentes.
--
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS cancelada           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS cancelada_por       text,
  ADD COLUMN IF NOT EXISTS cancelada_em        timestamptz;

COMMENT ON COLUMN public.vendas.cancelada IS
  'TD009 etapa 3: venda cancelada depois de fechada. As linhas filhas ficam preservadas (trilha de auditoria); as telas filtram esta coluna para manter a venda fora dos relatórios.';

-- A leitura do bootstrap traz 90 dias de vendas e as telas descartam as
-- canceladas no cliente. O índice parcial serve os relatórios que
-- filtram no banco, e custa quase nada porque cancelamento é raro.
CREATE INDEX IF NOT EXISTS vendas_cancelada_idx
  ON public.vendas (at DESC)
  WHERE cancelada;
