# Refatoração, fase 0: linha de base e ferramentas

> Pedido do dono (2026-11-23), literal: *"segue suas recomendações nas seis decisões e
> começa a fase 0"*. Plano em `docs/09_BACKLOG/plano_refatoracao.md`, ADR-015.

## Escopo

As seis tarefas da fase 0 do plano. Nada muda para quem usa o sistema.

## Fora de escopo

- Qualquer mudança de comportamento. O que o lint revelar e for bug de verdade vira item
  de débito técnico, não correção nesta rodada.
- Renomear migration já aplicada.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | `npm run metricas` imprime todas as métricas da seção 4 do plano | rodar o comando |
| 2 | A linha de base está registrada com testes, build e commit de partida | `docs/09_BACKLOG/refatoracao_metricas.md` |
| 3 | O roteiro de telas fotografa 44 telas sem passo falhando, todas distintas | `capturar` e checar o resumo |
| 4 | O roteiro é determinístico: duas capturas do mesmo código dão 0 diferença | `capturar` com `--ref HEAD`, depois `comparar` |
| 5 | `npm run lint` existe e termina com 0 erros | rodar o comando |
| 6 | As fronteiras de camada aparecem como aviso | saída do lint mostra `no-restricted-imports` |
| 7 | Nenhuma correção do lint muda comportamento: só código morto removido, nada condicional | review do diff |
| 8 | O que o lint revelou de suspeito está registrado | TD021 em `tech-debt.md` |
| 9 | Tipos do banco gerados em `src/types/database.ts` e utilizáveis via JSDoc | `tsc --checkJs` num arquivo de exemplo reprova atribuição de tipo errado |
| 10 | `CLAUDE.md` sem informação falsa sobre estilo; ADR-015 escrito e no índice | ler |
| 11 | Raiz e `supabase/` sem arquivo sem dono nem script de cliente fora de `supabase/ops/` | `ls`; referências dos docs atualizadas |
| 12 | Guard recusa migration nova com prefixo repetido, data inválida ou nome fora do formato | `migrationsNomeGuard.test.js` |
| 13 | Suíte verde, build limpo, nenhum teste existente removido ou enfraquecido | `npm test`, `npm run build`, diff dos testes |
| 14 | Nenhum travessão em texto novo de tela ou de documento | `grep` nos arquivos da rodada |
