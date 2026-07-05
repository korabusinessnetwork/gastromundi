# Regras de Negócio — Financeiro

## Objetivo
Registrar e organizar o dinheiro do negócio: receitas (vendas), despesas, contas a pagar e a receber e fluxo de caixa — dando ao dono a visão real de margem e saúde financeira.

## Contexto
O Financeiro é alimentado automaticamente pela venda (decisão 009): cada pagamento aprovado vira lançamento de receita. Diferente do **Caixa** (numerário físico do turno), o Financeiro é a **visão contábil/gerencial** do negócio ao longo do tempo.

## Regras Gerais
- **Lançamentos** têm tipo (receita/despesa), categoria, valor, data de competência, data de vencimento e status (`previsto`, `pago`/`recebido`, `vencido`).
- Receitas de venda são geradas a partir de `pagamento.aprovado`; vendas **fiado** criam **conta a receber**.
- Despesas e contas a pagar são lançadas manualmente (e, futuramente, a partir de compras de estoque).
- **Fluxo de caixa** = entradas − saídas por período (previsto vs. realizado).
- Margem aproximada usa o custo do estoque (quando disponível) — ver `ESTOQUE.md`.

## Validações
- Valor do lançamento > 0; data de competência obrigatória.
- Conta a receber/pagar exige vencimento; baixa exige data de pagamento/recebimento.
- Estorno de venda gera lançamento de reversão correspondente.

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Ver financeiro | ✓ | ✓ | — | — | — |
| Lançar despesa/conta | ✓ | ✓ | — | — | — |
| Baixar conta (pagar/receber) | ✓ | ✓ | — | — | — |
| Ver margem/relatórios financeiros | ✓ | (parcial) | — | — | — |

## Exceções
- Vendas fiado pendentes aparecem como contas a receber até a quitação.
- Lançamentos retroativos exigem papel gerente e ficam marcados.

## Auditoria
- Registrar autor, data, categoria e origem (venda, manual, estoque) de cada lançamento; trilha de baixas e estornos.

## Eventos Disparados
- `financeiro.lancamento.criado` · `financeiro.conta.baixada`
- `financeiro.conta.vencida`

## Consome
- `pagamento.aprovado` → receita realizada.
- `venda.finalizada` com forma **fiado** → cria **conta a receber** (não há `pagamento.aprovado` no fiado).
- `venda.estornada` → lançamento de reversão.

## Configurações Futuras
- Conciliação bancária, DRE gerencial, centros de custo, integração com adquirentes/bancos, regime de competência x caixa.

## Casos de Uso
- Acompanhar receitas do dia geradas pelas vendas.
- Lançar uma despesa fixa (aluguel) e marcar como paga.
- Controlar uma venda fiado até o cliente quitar.

## Critérios de Aceite
- [x] `pagamento.aprovado` gera lançamento de receita
- [x] Venda fiado cria conta a receber
- [ ] Estorno gera reversão (fase futura)
- [x] Fluxo de caixa (previsto vs. realizado) calculado por período

## Estado da Implementação

| Fase | Descrição | Status |
|------|-----------|--------|
| 1 | Infraestrutura: tabela `lancamentos` (`supabase/migrations/20260710_financeiro.sql`) e serviço `src/lib/financeiro.js` (`criarLancamento`, `baixarConta`, `listarLancamentos`, `calcularFluxoCaixa`, `marcarVencidos`, `processarVencidos`). RLS: gerente/admin têm acesso total; caixa só insere receita automática (`origem='venda'`). Receita automática por pagamento em `useFinalizarPagamento` — pagamento normal vira receita `recebido`; pagamento `fiado` vira conta a receber `previsto` (30 dias). Tela `/app/financeiro` (gerente/admin): cards de fluxo de caixa do período, lista com filtros (tipo/status/período), baixa de conta, modal de novo lançamento (despesa/conta manual). Contas vencidas são recalculadas ao carregar a tela (`processarVencidos`) e viram alerta agregado no Jarvas (`regraContasVencidas` → ação "Ver financeiro"). | ✅ 2026-07-05 |
| 2 | Estorno/reversão de venda (`venda.estornada` → lançamento de reversão) | Pendente |
| 3 | Margem por custo de estoque (integração com `ESTOQUE.md`) | Pendente |
| 4 | Conciliação bancária, DRE gerencial, centros de custo, despesa automática por compra de estoque | Roadmap |
