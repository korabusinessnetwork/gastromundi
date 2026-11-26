# Refatoração 5.34: prova do white-label no roteiro de fotos

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T11 (item 5.y do plano).

## A mudança

- **Roteiro ganha a prova de tema.** `TEMA_TENANT=<arquivo.json>` faz toda tela rodar com um
  estabelecimento que tem esse tema e todos os módulos do plano; o comando
  `prova-tema <pasta>` lê cada foto e aponta as que ainda mostram, em 30 pixels ou mais, uma
  cor do tema padrão (as cores hexadecimais do `:root` de `src/styles/tema.css`). O tema de
  prova é `scripts/telas/tema-prova.json`: fundo verde escuro e destaque vermelho, sem nenhuma
  cor em comum com o padrão. Os dois temas da prova são, portanto, o padrão e o de prova.
- **Três vazamentos reais corrigidos, com teste antes:**
  1. A prévia do cupom em Configurações, Impressão (e a janela de impressão de verdade) é um
     documento à parte, sem o tema do estabelecimento: o valor do TOTAL saía sempre no roxo
     padrão. O driver de impressão no navegador passa a levar `--gm-accent` e `--gm-warn`
     resolvidos para o papel (`drivers/browserRaster.test.js`, novo).
  2. O aviso "sem valor fiscal" do cupom tinha âmbar cravado no texto e no fundo; agora os dois
     saem do `--gm-warn` do estabelecimento.
  3. A barra de força da senha em Configurações, Usuários usava cinco cores cravadas em
     `utils/crypto.js`; agora usa `--gm-red`, `--gm-orange`, `--gm-warn`, `--gm-green` e
     `--gm-blue` (a "Forte" era ciano, que não existe no tema; ficou com o azul do tema).
- **Dois defeitos do roteiro corrigidos:** as telas de assinatura e de plano registravam um
  estabelecimento próprio com tema vazio, apagando o tema de prova; e a rota falsa de
  estabelecimentos devolvia um objeto onde o console da plataforma espera uma lista.

## Resultado da prova

Primeira volta com o tema de prova: 209 telas, 15 com cor do padrão. Depois das correções,
sobram 8 fotos, todas de antes de o estabelecimento ser conhecido, e por isso corretas: o login
(normal, com erro e com endereço inválido) e o cardápio público de um endereço sem delivery, no
computador e no celular. Sem estabelecimento não há tema para aplicar.

## Diferenças

Contra o código da 5.33, sem tema de prova: 209 telas, nenhuma diferença e 2 mudanças leves de
0,000% nas Reservas do PDV, tela que esta rodada não toca (ruído de captura). No tema padrão as
cores resolvidas são as mesmas de antes, por isso a prévia do cupom não muda.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Com o tema de prova, nenhuma tela do estabelecimento mostra cor do tema padrão | `prova-tema` |
| 2 | Cada vazamento corrigido tem teste que falha sem a correção | testes do driver e da senha |
| 3 | Sem tema de prova, o visual padrão não muda além do esperado | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim. Prova com tema: 0 tela do estabelecimento com cor do padrão (as 8 que
  sobram são login e cardápio sem estabelecimento). Suíte 269 arquivos e 4446 testes, verde;
  build limpo; lint 0 erros e 25 avisos.
- Qualidade: nenhum crítico ou importante. Menor: a cor "Forte" da senha passou de ciano para
  o azul do tema, porque ciano não é token; anotado em `.full-auto/DECISOES.md`.
