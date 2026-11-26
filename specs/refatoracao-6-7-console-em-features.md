# Refatoração 6.7: o console da plataforma passa a morar em `src/features/console/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T18.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **Raiz da feature**: `console.js`, a fachada que só reexporta (o antigo `src/lib/console.js`).
- **`regras/`**: `cadastro.js` (validação do novo estabelecimento), `erros.js` (tradução das
  falhas), `lista.js` e `consoleHost.js` (quando o endereço é o do console).
- **`dados/`**: `gravacoes.js`, `leitura.js`, `paineis.js` e `solicitacoes.js`, a antiga pasta
  `src/lib/console/`.
- **`desktop/`**: as janelas e painéis do console, a antiga pasta `src/components/console/`, que
  deixa de existir.
- 44 arquivos movidos, 50 com import reescrito. Comentários no código, nas funções de borda e em
  `memory/learnings.md` que citavam `src/lib/console.js` apontam para o caminho novo.
- **Guardas que leem fonte por caminho:** o guarda do provisionamento lê a janela de novo
  estabelecimento com `join(RAIZ, "src", ...)`, e reprovou a suíte até o caminho ser corrigido
  (é o comportamento certo). Daqui em diante a conferência de caminhos lidos pelos testes cobre
  também esse formato com segmentos separados.

Fica fora: as páginas de rota do console em `src/pages/console/`, pela regra da 6.2.

## Diferenças

10 telas (console e login) contra a 6.6: nenhuma diferença.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Console em `src/features/console/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import nem leitura de fonte aponta para o caminho antigo | busca e guardas da suíte |
| 3 | Nenhuma tela muda | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 53.
- Qualidade: nenhum crítico ou importante.
