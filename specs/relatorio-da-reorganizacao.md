# Relatório da reorganização em PDF, publicado na página de novidades

> Pedido do dono (2026-11-26): "Traz um relatório em PDF de tudo que foi feito desde a primeira
> etapa até a última, e lança na page do patch notes também".

## A mudança

- **O relatório:** `public/relatorios/reorganizacao-2026-11.pdf`, com 6 páginas, gerado de
  `scripts/relatorios/reorganizacao-2026-11.html` por `scripts/relatorios/gerar-pdf.mjs` (Chromium
  do Playwright). Ele traz:
  - o resumo e os números (92 rodadas, 4.465 testes, 225 telas, 13 caminhos de ponta a ponta);
  - a tabela de antes e depois, tirada da seção 4 do plano;
  - as oito etapas, da 0 à final, com as datas;
  - o que quem usa percebe;
  - como cada passo foi conferido;
  - os pedidos feitos no caminho;
  - o que fica para decisão.
- **Página pública, linguagem de quem usa:** a página de novidades é pública, então o relatório
  fala do que mudou para quem usa e descreve as correções de segurança pelo benefício, sem detalhe de
  como explorar. Os números são os medidos. Não entrou o que eu não podia provar, como "nenhuma
  migration pendente".
- **Na página de novidades:** as notas ganham o campo opcional `anexo` (`{ href, rotulo }`), e a
  página mostra o link "Baixar o relatório (PDF)" com alvo grande, de 44 px, ao lado do item novo de
  hoje.
  - Teste de componente: o link aparece com o endereço certo.
  - Teste de estrutura: todo anexo aponta para um PDF que existe em `public/relatorios/`.
- **Service worker:** o app instalável devolvia a página do app para qualquer navegação, inclusive
  para o PDF. Agora `/relatorios/` fica fora dessa regra (`navigateFallbackDenylist`). Conferido no
  `sw.js` gerado pela build.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | O PDF cobre da etapa 0 à última, com números medidos | leitura das 6 páginas |
| 2 | A página de novidades oferece o PDF para baixar | testes e foto no computador e no celular |
| 3 | O PDF é servido como arquivo, também com o app instalado | `application/pdf` no servidor e a lista de exclusão no `sw.js` |
| 4 | Suíte verde, build limpo, lint sem problema, sem travessão nem emoji | comandos e guardas |

## Revisão

- Spec: 4 de 4 em sim. Suíte verde, build limpo, lint 0 problemas.
- Qualidade: nenhum crítico ou importante.
