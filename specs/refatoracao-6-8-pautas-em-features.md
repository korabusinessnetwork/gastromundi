# Refatoração 6.8: as pautas passam a morar em `src/features/pautas/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T19.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`dados/`**: `pautas.js` (leitura e gravação das pautas) e `pautasAuth.js` (sessão do sócio).
- **`regras/`**: `pautasHost.js` (quando o endereço é o das pautas, e o e-mail do sócio).
- **`desktop/`**: o cartão e o formulário da pauta, a antiga `src/components/pautas/`, que deixa de
  existir.
- 10 arquivos movidos, 11 com import reescrito. `docs/03_REGRAS_DE_NEGOCIO/PAUTAS.md` aponta para
  o caminho novo.

Fica fora: as páginas em `src/pages/pautas/`, pela regra da 6.2.

## Diferenças

O roteiro de fotos não tem tela de pautas (o módulo só liga com o subdomínio configurado), e não
há teste de componente do cartão nem do formulário. A evidência de que as telas acham os arquivos
novos é o build: ele resolve o `import()` dinâmico do `PautasApp` em `main.jsx` e, a partir
dele, a página e os dois componentes no lugar novo. Como nenhuma linha de código mudou, o resto do
comportamento é o mesmo; as regras e os dados seguem cobertos pelos testes, que andaram junto.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Pautas em `src/features/pautas/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import aponta para o caminho antigo | busca no repositório e build |
| 3 | Nenhuma tela muda | sem foto no roteiro; build resolve as telas |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim, o 3 com a ressalva acima. Suíte 269 arquivos e 4446 testes, verde; build
  limpo; lint 0 erros e 25 avisos. Chamadas ao Supabase fora de `dados/`: 48.
- Qualidade: nenhum crítico ou importante. Menor: as pautas não têm foto no roteiro nem teste de
  componente; fica anotado para a auditoria da fase F (fluxos rodando de verdade).
