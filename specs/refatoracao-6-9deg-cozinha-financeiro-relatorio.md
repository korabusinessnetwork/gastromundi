# Refatoração 6.9d, 6.9e e 6.9g: Cozinha, Financeiro e Relatório em `src/features/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefas T20d, T20e e T20g, numa
> rodada só (decisão abaixo).

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **Cozinha**: `src/features/cozinha/dados/cozinha.js` (fila da cozinha, marcar pronto) e
  `desktop/CozinhaView` (a tela da cozinha do computador). A feature nasce nesta rodada.
- **Financeiro**: `src/features/financeiro/dados/financeiro.js` (lançamentos, baixa, fluxo de
  caixa), ao lado de `lancamentos.js`, e `desktop/` com a tela do Financeiro e a antiga pasta
  `views/financeiro/`.
- **Relatório**: `src/features/relatorios/dados/relatorios.js`, `regras/exportReport.js` (gerar a
  planilha e o PDF) e `desktop/` com a tela do Relatório e a antiga pasta `views/relatorio/`.
- 44 arquivos movidos, 49 com import reescrito. Comentários no código, em
  `docs/03_REGRAS_DE_NEGOCIO/` (Cozinha, Financeiro, Relatórios) e em `memory/learnings.md` apontam
  para os caminhos novos.
- **`src/components/desktop/views/` deixa de existir.** É a primeira metade do "pronto quando" da
  fase 6. A outra metade, `src/lib/` sem regra de negócio, fica para a auditoria da fase F (ver
  abaixo).

**Por que três tarefas numa rodada:** as três são domínios pequenos, só de mudança de lugar e com o
mesmo método. Cada rodada mesclada sobe produção na Vercel, então três rodadas seriam três deploys
para nenhuma mudança visível. A comparação foi a completa, as 209 telas, e não só as do domínio.

**O que ainda mora em `src/lib/`:** utilidades técnicas e regras usadas por vários domínios (Jarvas,
assinatura, tema, ponte, importação de planilha, telefone, documento, busca, entre outras) e os
guardas de SQL. A 6.12 e a fase F decidem o destino de cada um, porque o critério do plano é
"`src/lib/` com regra de negócio", e separar o que é regra do que é técnica pede um olhar por
arquivo.

## Diferenças

Roteiro completo, 209 telas, contra a 6.9c: nenhuma diferença e 1 mudança leve de 0,000% nas
Reservas do PDV, o mesmo ruído de captura das rodadas anteriores.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Cozinha, Financeiro e Relatório em `src/features/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import nem leitura de fonte aponta para o caminho antigo | busca e guardas da suíte |
| 3 | Nenhuma tela muda | `comparar` com as 209 telas |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 272 arquivos e 4456 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 35.
- Qualidade: nenhum crítico ou importante.
