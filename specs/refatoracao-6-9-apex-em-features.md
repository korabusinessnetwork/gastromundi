# Refatoração 6.9: a lógica do site da Kora passa a morar em `src/features/apex/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T20.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`regras/apex.js`**: quando o endereço é o do site institucional e não o de um estabelecimento.
- **`dados/`**: `leads.js` (pedido de demonstração) e `solicitacoes.js` (pedido de conta nova).
- 6 arquivos movidos, 11 com import reescrito. Os comentários que citavam o caminho antigo, na
  página de agendamento e no roteador, apontam para o novo.

Ficam fora: as telas do site em `src/pages/apex/` (pela regra da 6.2) e o guarda de SQL das
solicitações.

## Diferenças

O site da Kora não tem foto no roteiro (só abre no domínio da plataforma). As 6 fotos do login,
que dependem da mesma decisão de endereço, não mudaram. As telas do site têm testes de componente
(planos, criar conta, entrar), que passam com os imports novos.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Lógica da apex em `src/features/apex/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import aponta para o caminho antigo | busca no repositório |
| 3 | Nenhuma tela muda | `comparar` do login e testes de componente do site |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 46.
- Qualidade: nenhum crítico ou importante.
