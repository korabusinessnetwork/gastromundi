# LOG

Uma linha por tarefa concluída: data, tarefa, commit, comando de verificação e resultado.

- 2026-11-25, T01 (5.22 Impostos): `npx vitest run` 268 arquivos e 4435 testes verdes, `npm run build` limpo, lint 0 erros, roteiro 179 telas com 1 diferença explicada. Estilo inline 185 para 162.
- 2026-11-25, T02 (5.23 abertura e login): `npx vitest run` 268 arquivos e 4435 testes verdes, build limpo, lint 0 erros, roteiro 185 telas com 2 diferenças explicadas. Estilo inline 162 para 134.
- 2026-11-25, T03 (5.24 casca e telas de acesso): `npx vitest run` 268 arquivos e 4435 testes verdes, build limpo, lint 0 erros, roteiro 190 telas sem diferença. Estilo inline 134 para 98.
- 2026-11-26, T04 (5.25 configurações restantes): `npx vitest run` 268 arquivos e 4435 testes verdes, build limpo, lint 0 erros, roteiro 197 telas com 4 diferenças explicadas (uma é a correção da regressão do Delivery). Estilo inline 98 para 50.
- 2026-11-26, T05 (5.26 cozinha): `npx vitest run` 268 arquivos e 4435 testes verdes, build limpo, lint 0 erros, roteiro 198 telas, só o emoji virou ícone. Estilo inline 50 para 37.
- 2026-11-26, T06 (5.27 financeiro): `npx vitest run` 268 arquivos e 4435 testes verdes, build limpo, lint 0 erros, roteiro 202 telas sem diferença. Estilo inline 37 para 15.
- 2026-11-26, T07 (5.28 estilo inline zerado): `npx vitest run` 268 arquivos e 4435 testes verdes, build limpo, lint 0 erros, roteiro 206 telas com 1 leve (foco). Estilo inline 15 para 0; guard sem linha de base, vermelho com um estilo de teste e verde sem ele.
- 2026-11-26, T08 parte 1 (5.29 avisos, ícones e cupom): `npx vitest run` 268 arquivos e 4438 testes verdes, build limpo, lint 0 erros, roteiro 209 telas com diferenças só nos emojis trocados. Emoji 91 para 64.
- 2026-11-26, T08 parte 2 (5.30 estados vazios): `npx vitest run` 268 arquivos e 4438 testes verdes, build limpo, lint 0 erros, roteiro 209 telas com 4 diferenças (emoji trocado). Emoji 64 para 40; o resto é do campo de emoji do produto (T10).
- 2026-11-26, T09 (5.31 cores fixas): `npx vitest run` 268 arquivos e 4439 testes verdes, build limpo, lint 0 erros, roteiro 209 telas sem diferença. Cor hexadecimal em JSX 8 para 0, com teste.
- 2026-11-26, T10 parte 1 (5.32 emoji do produto, computador): `npx vitest run` 268 arquivos e 4444 testes verdes, build limpo, lint 0 erros, roteiro 209 telas com diferenças só onde havia emoji. Emoji 40 para 17.
- 2026-11-26, T10 (5.32 e 5.33 emoji do produto): `npx vitest run` 268 arquivos e 4444 testes verdes, build limpo, lint 0 erros, roteiro 209 telas com diferenças só onde havia emoji. Emoji 40 para 0; emojiGuard exige zero (vermelho com um emoji de teste).
- 2026-11-26, T11 (5.34 prova do white-label): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 209 telas sem diferença; `prova-tema` com o tema de prova: 0 tela do estabelecimento com cor do padrão.
- 2026-11-26, T12 (6.1 fiscal em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 31 telas do domínio sem diferença, caminhos das funções de borda conferidos. 76 arquivos com `git mv`.
- 2026-11-26, T13 (6.2 delivery em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 6 telas do domínio sem diferença. 35 arquivos com `git mv`.
- 2026-11-26, T14 (6.3 estoque em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 34 telas do domínio sem diferença. 21 arquivos com `git mv`.
- 2026-11-26, T15 (6.4 caixa em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 21 telas do domínio sem diferença. 16 arquivos com `git mv`.
- 2026-11-26, T16 (6.5 PDV e comandas em features/): `npm test` 269 arquivos e 4446 testes verdes (com os de componente do PDV), build limpo, lint 0 erros, roteiro completo 209 telas sem diferença. 57 arquivos com `git mv`.
- 2026-11-26, T17 (6.6 clientes em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 14 telas do domínio sem diferença. 7 arquivos com `git mv`.
- 2026-11-26, T18 (6.7 console em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 10 telas sem diferença. 44 arquivos com `git mv`.
- 2026-11-26, T19 (6.8 pautas em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo (resolve as telas de pautas pelo import dinâmico), lint 0 erros; sem foto de pautas no roteiro. 10 arquivos com `git mv`.
- 2026-11-26, T20 (6.9 apex em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 6 telas de login sem diferença. 6 arquivos com `git mv`.
- 2026-11-26, T20a (6.9a telas do cardápio em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 22 telas do domínio, 0 diferença. 24 arquivos com `git mv`.
- 2026-11-26, T20b (6.9b configurações, impressão e mesas em features/): `npm test` 269 arquivos e 4446 testes verdes, build limpo, lint 0 erros, roteiro 209 telas, 0 diferença e 1 leve (ruído nas Reservas). 81 arquivos com `git mv`.
- 2026-11-26, pedido do dono (datas um dia antes e página de novidades): `npm test` 272 arquivos e 4456 testes verdes, build limpo, lint 0 erros, roteiro 36 telas com só as datas mudando para o dia gravado; hook de pre-push conferido em repositório de teste.
- 2026-11-26, T20c (6.9c Área Admin em features/): `npm test` 272 arquivos e 4456 testes verdes, build limpo, lint 0 erros, roteiro 22 telas do domínio, 0 diferença. 18 arquivos com `git mv`.
- 2026-11-26, T20d (6.9d, 6.9e e 6.9g cozinha, financeiro e relatório em features/): `npm test` 272 arquivos e 4456 testes verdes, build limpo, lint 0 erros, roteiro 209 telas, 0 diferença e 1 leve (ruído nas Reservas). 44 arquivos com `git mv`.
- 2026-11-26, T21 (6.10 roteador por superfície em src/app/rotas): `npm test` 273 arquivos e 4462 testes verdes, build limpo, lint 0 erros, roteiro 209 telas, 0 diferença e 2 leves (ruído nas Reservas). 0 arquivos com `git mv`.
- 2026-11-26, T22 (6.11 READMEs da ponte e do bot): leitura dos dois READMEs conferida contra os imports reais de `ponte/` e `bot/`.
- 2026-11-26, T20h (6.9h domínios restantes de src/lib em features/): `npm test` 273 arquivos e 4462 testes verdes, build limpo, lint 0 erros, roteiro 209 telas, 0 diferença e 1 leve (ruído nas Reservas). 33 arquivos com `git mv`.
- 2026-11-26, T23 (6.12 documentação final): arquitetura, CLAUDE.md, patterns e ADR-015 conferidos contra o código (package.json, src/, nomes de evento).
