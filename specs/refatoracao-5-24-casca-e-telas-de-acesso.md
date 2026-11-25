# Refatoração 5.24: casca do app e telas de acesso sem estilo inline

> Execução Full Automático do plano de refatoração (2026-11-25), tarefa T03.

## A mudança

- `pages/desktop/DesktopLayout.jsx` (13), `AssinaturaBloqueada.jsx` (8), `SemAcesso.jsx` (4),
  `UpgradeNecessario.jsx` (4), `AssinaturaBanner.jsx` (3) e `main.jsx` (4) para 0.
- Casca: a raiz, a barra lateral recolhível, o botão de recolher, a gaveta de tela estreita, a
  barra de topo e o selo de caixa aberto ou fechado foram para o `DesktopLayout.css`. O hover
  do botão de recolher era JavaScript e virou `:hover`; a barra recolhida virou modificador;
  as larguras chegam por `--desktop-sidebar-w` e `--desktop-drawer-w`. Os botões de recolher
  e de menu ganharam nome para leitor de tela.
- Avisos de assinatura: cada tom (`--aviso`, `--carencia`, `--bloqueado`) define a cor e as
  porcentagens do fundo e da borda por variável.
- Telas de acesso (bloqueio por mensalidade, sem acesso, fora do plano): cor para o CSS de
  cada uma.
- A tela de erro geral (o React estourou) saiu do `main.jsx` para `src/app/TelaDeErro.jsx`,
  com CSS próprio, um componente por arquivo como pede o CLAUDE.md.

O roteiro ganhou seis telas: o botão de recolher com o mouse em cima, a barra recolhida, um
módulo fora do plano, e os avisos de mensalidade vencendo, em carência e bloqueada (por rota,
com um estabelecimento e uma assinatura só nessas telas). Também aprendeu a pedir outra
largura de tela por tela (`viewport`).

**Lacunas de foto, conferidas de outra forma:** a barra de topo e a gaveta de tela estreita,
e a tela "Sem acesso", não são alcançáveis pelo roteiro: abaixo de 768 px, ou sem nenhuma
permissão, o app manda para o `/palm`. A tela de erro geral só aparece com o React
quebrando. Nas três, a conversão foi conferida linha a linha contra o estilo antigo.

## Diferenças

Contra o código de antes da conversão, 190 telas: 0 com diferença e 1 leve (o ruído de fonte
de sempre na aba Reservas). Nenhum erro de tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os seis arquivos sem estilo inline | guard de estilo: saem da linha de base |
| 2 | Telas iguais | `comparar`: 0 diferença |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor e antigo: a tela de mensalidade atrasada
  aparece com fonte serifada (não declara fonte e é renderizada fora da casca), o mesmo caso
  do TD026; registrado lá.
