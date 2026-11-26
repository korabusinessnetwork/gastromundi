# Refatoração 6.1: o domínio fiscal passa a morar em `src/features/fiscal/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T12.

## A mudança

Mudança só de lugar, com `git mv` para o histórico de cada arquivo continuar. Nenhuma linha de
lógica mudou; os imports foram reescritos por script e conferidos pela suíte, pelo lint e pelo
build.

- **`dados/`** (fala com o Supabase ou com as funções de borda): `fiscal.js`,
  `fiscalConfigRepo.js` e `nfceEmitidasRepo.js`, ao lado do `itensFiscal.js` que já estava lá.
- **`regras/`** (funções puras): os 16 arquivos `nfce*` restantes, `validarConfigFiscal.js` e
  `decidirDesfechoReenvio.js`, com os certificados de teste em `regras/__fixtures__/`.
- **`desktop/`** (telas): o que estava em `src/components/fiscal/` (Painel Fiscal, Histórico,
  cupom, cancelar, inutilizar, reimprimir) e a tela de Impostos da Área Admin com a pasta
  `impostos/`.
- Cada teste andou junto com o seu arquivo: 76 arquivos movidos, 78 com import reescrito.

**Funções de borda.** `emitir-nfce`, `cancelar-nfce`, `inutilizar-nfce`, `reenviar-nfce` e
`_shared/nfceTransmissao.ts` importam as regras por caminho relativo (`../../../src/...`). Os
caminhos foram reescritos e conferidos um a um (todos existem). Os arquivos de regra usados por
elas continuam importando entre si com caminho relativo e extensão `.js`, como o Deno exige; só os
que o Deno não usa passaram a importar `@/lib/...`. As funções em produção não mudam até o
próximo deploy delas, e esse deploy já sai com os caminhos novos.

Ficam fora desta rodada, de propósito: a aba de notas de entrada (`NotasFiscaisTab`, compra de
mercadoria, vai com estoque), o `ModalCpfNota` do PDV (vai com o PDV) e as duas páginas de rota
em `pages/desktop/` (vão com o roteador por superfície, 6.10). Um comentário de
`supabase/schema.sql` ainda cita o caminho antigo do Painel Fiscal; o arquivo é o retrato do banco
em produção e não foi tocado por causa de um comentário.

## Diferenças

31 telas do domínio (Impostos, Área Admin, finalizar e pagar no PDV) contra a 5.34: nenhuma
diferença, nenhuma leve.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Domínio fiscal em `src/features/fiscal/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import aponta para o caminho antigo, e as funções de borda acham as regras | busca no repositório e conferência dos caminhos |
| 3 | Nenhuma tela muda | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 111 para 106.
- Qualidade: nenhum crítico ou importante. Não há Deno no ambiente para checar as funções de
  borda por tipo; a conferência foi de caminho, e as regras que elas usam estão cobertas pela
  suíte no lugar novo.
