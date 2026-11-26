# Refatoração 6.10: um arquivo de rotas por superfície em `src/app/rotas/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T21.

## A mudança

O `src/routes/index.jsx` tinha 294 linhas com as quatro superfícies do app misturadas. Agora:

- **`src/app/rotas/apex.jsx`**: o site da Kora (vitrine, demonstração, entrar, criar conta e
  novidades). Fora do domínio do site, cada uma dessas rotas leva ao login, como antes.
- **`src/app/rotas/console.jsx`**: as rotas do host dedicado do Console e o `/console` dentro do
  app de estabelecimento (que vira beco sem saída quando o Console mora em subdomínio próprio).
- **`src/app/rotas/cardapioPublico.jsx`**: o cardápio público, sem login.
- **`src/app/rotas/estabelecimento.jsx`**: login, Palm e o app do computador com as 12 telas. As
  12 entradas repetiam a mesma forma; uma função pequena (`telaDoApp`) monta cada uma com a
  permissão e o módulo do plano, sem mudar nenhuma permissão.
- **`src/app/rotas/index.js`**: `escolherRotas`, função que recebe o que o endereço diz (host do
  Console, Console fora do host, site da Kora) e devolve as rotas da superfície.
- **`src/routes/index.jsx`**: 22 linhas. Só lê o endereço e entrega a escolha ao
  `createBrowserRouter`, como o plano pede.

Ficam onde estão: `PrivateRoute`, `ConsoleRoute`, `InicioApp` e `CarregandoApex`, em `src/routes/`.
São guardas e telas de transição, não rotas, e os testes deles continuam passando sem mudança.

**Teste novo** (`src/app/rotas/index.test.jsx`, 6 casos): no host do Console só existem as rotas
do Console; nos outros hosts existem todas as superfícies, sem caminho repetido; fora do site as
rotas do site levam ao login, e no site mostram as páginas; com o Console em subdomínio, o
`/console` de um estabelecimento leva ao login; o app do computador mantém exatamente a tela inicial
e as 12 telas, na mesma ordem.

## Diferenças

Roteiro completo, 209 telas, contra a main: nenhuma diferença e 2 mudanças leves de 0,000% nas
Reservas do PDV, o mesmo ruído de captura das rodadas anteriores. O roteiro passa por todas as
superfícies (login, app do computador, Palm, Console, cardápio público).

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | `routes/index.jsx` só escolhe a superfície | arquivo com 22 linhas e o teste de `escolherRotas` |
| 2 | Toda rota e permissão de antes continua igual | teste de `escolherRotas` e testes de `PrivateRoute` e `ConsoleRoute` |
| 3 | Nenhuma tela muda | `comparar` com as 209 telas |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 273 arquivos e 4462 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 35.
- Qualidade: nenhum crítico ou importante.
