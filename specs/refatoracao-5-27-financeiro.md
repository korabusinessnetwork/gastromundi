# Refatoração 5.27: Financeiro sem estilo inline

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T06.

## A mudança

- `FinanceiroView.jsx` (7), `financeiro/LancamentosList.jsx` (7), `financeiro/NovoLancamentoModal.jsx`
  (4) e `financeiro/ResumoCards.jsx` (4) para 0. A área do Financeiro fica sem estilo inline.
- O espaço do `sz` chega por `--fin-pad`, `--fin-pad-sm` e `--fin-gap` na raiz do Financeiro;
  os cartões de resumo e a lista de lançamentos, que ficam dentro dela, herdam (a lista deixou
  de receber `sz`). O número de colunas dos cartões chega por `--resumo-cols`.
- Cor por classe: o tom de cada cartão de resumo (`--verde`, `--vermelho`, `--azul`) e a cor do
  status de cada lançamento (`lancamentos-list__badge-status--<status>`), que saiu da tabela
  `STATUS_COLOR` do JavaScript. O tipo escolhido na janela de novo lançamento virou
  modificador, e o Salvar usa `:disabled`.

Antes da conversão o Supabase falso ganhou três lançamentos do mês sem cliente (receita
recebida, despesa paga, despesa vencida), e o roteiro ganhou quatro telas: novo lançamento
como despesa e como receita, a lista filtrada pelos vencidos e a falha de carga.

## Diferenças

Contra o código de antes da conversão, 202 telas: 0 com diferença e 0 leve. Nenhum erro de
tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os quatro arquivos sem estilo inline | guard de estilo: saem da linha de base |
| 2 | Telas iguais | `comparar`: 0 diferença |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante.
