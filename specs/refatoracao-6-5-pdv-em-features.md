# Refatoração 6.5: o PDV e as regras de comanda passam a morar em `src/features/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T16.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`src/features/pdv/desktop/`**: a tela inteira do PDV do computador, a antiga pasta
  `views/PDVView/` com as subpastas `checkout/` e `pdv/`: grade de produtos, carrinho, comandas,
  mapa e reservas de mesa, finalizar, CPF na nota e impressão. O ponto de entrada continua sendo o
  `index.jsx` da pasta.
- **`src/features/pdv/regras/tef.js`**: a abstração de pagamento na maquininha.
- **`src/features/comandas/regras/`**: `comandaItens.js` (reconciliação de itens entre Palm e
  PDV), `comandaLock.js` (trava de edição), `rotuloComanda.js`, `pedidosEmEspera.js` e
  `painelGarcom.js`. São regras usadas pelo PDV e pelo celular, por isso vão para o domínio
  comandas e não para dentro do PDV.
- 57 arquivos movidos, 67 com import reescrito, os testes de componente do PDV junto.
- **Guarda do pagamento:** `consolePagamentoGuard` lista pelo caminho os arquivos onde a venda vira
  dinheiro, e a tela do PDV era um deles. O caminho foi corrigido; o guarda lê o arquivo com
  `readFileSync`, então um caminho errado reprova a suíte em vez de passar calado.
- **Imports entre módulos:** o script das rodadas anteriores tinha deixado quatro imports relativos
  longos de `src/lib` para `features/` (`../features/caixa/...`). Viraram `@/features/...`, e o
  script passa a escrever `@/` sempre que o import cruza de um módulo para outro. Dentro da mesma
  feature o caminho continua relativo, o que mantém as regras da NFC-e legíveis pelo Deno.

Fica fora: `uidLista.js`, que é utilidade técnica de lista editável, sem regra de negócio.

## Diferenças

Roteiro completo, 209 telas, contra a 6.4: nenhuma diferença e 1 mudança leve de 0,000% nas
Reservas do PDV, o mesmo ruído de captura que já apareceu na 5.34 (a tela não mudou de código).

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | PDV e regras de comanda em `src/features/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import nem leitura de fonte aponta para o caminho antigo | busca e guardas da suíte |
| 3 | Nenhuma tela muda | `comparar` com as 209 telas |
| 4 | Suíte verde (com os testes de componente do PDV), build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 74.
- Qualidade: nenhum crítico ou importante.
