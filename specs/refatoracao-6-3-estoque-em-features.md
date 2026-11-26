# Refatoração 6.3: o domínio estoque passa a morar em `src/features/estoque/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T14.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`regras/`**: `estoque.js` (baixa e alerta de mínimo), `estoqueSituacao.js` (sem estoque e
  estoque baixo) e `validade.js`, ao lado de `notaManual.js` e `quantidade.js` que já estavam lá.
- **`desktop/`**: a tela de Estoque (`EstoqueView`, a janela de autorização e o `apoio.js` da
  antiga pasta `views/estoque/`) e a aba de notas de entrada da Área Admin (`NotasFiscaisTab`
  com a pasta `notasFiscais/`: lista, detalhe, nota manual e o assistente de XML).
- 21 arquivos movidos, 27 com import reescrito, testes junto de cada arquivo. Os comentários que
  citavam o caminho antigo, no código e em `docs/03_REGRAS_DE_NEGOCIO/ESTOQUE.md`, foram corrigidos.

Fica fora, pela regra da 6.2: a aba de unidades de medida, cujo CSS mora no das Configurações, e
o guarda de SQL da importação de nota.

## Diferenças

34 telas do domínio (Estoque, Área Admin com as notas, módulo Estoque do celular) contra a 6.2:
nenhuma diferença.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Domínio estoque em `src/features/estoque/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import aponta para o caminho antigo | busca no repositório |
| 3 | Nenhuma tela muda | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 77 (sem mudança: estes arquivos não chamam o Supabase).
- Qualidade: nenhum crítico ou importante.
