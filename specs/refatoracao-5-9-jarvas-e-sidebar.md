# Refatoração 5.9: painel do Jarvas e barra lateral sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `shared/JarvasPanel.jsx`: 35 atributos `style` para 0. O cabeçalho de `JarvasPanel.css`
  dizia que cor e layout ficavam inline "por simplicidade"; agora moram lá. A severidade do
  insight virou o tom `--jarvas-tom` (info azul, aviso âmbar, perigo vermelho, como a spec do
  Jarvas define), com `info` para severidade desconhecida, como antes. Sino com não lidos,
  aba ativa, balão do usuário e insight lido viraram modificadores. O botão de enviar usa
  `:disabled`, que era a mesma condição da aparência.
- `desktop/Sidebar.jsx`: 32 para 0. A função `linkStyle(ativo)` virou a classe
  `sidebar__nav-item` com `--ativo` e `--bloqueado`; o selo de caixa aberto ou fechado e os
  três botões de caixa (retirar e colocar, fechar, abrir) viraram modificadores. O botão de
  fechar caixa com comanda aberta usa `:disabled`, a mesma condição de antes. Hover do item
  "Comandas fechadas" em CSS.

Antes da conversão o roteiro ganhou sete telas: o sino com insights não lidos, o painel
vazio, o painel com três insights (um de cada severidade, um já lido), a conversa com uma
pergunta respondida, a barra lateral com o caixa fechado e o hover em "Comandas fechadas".
Os insights e a resposta do assistente entram só nessas telas, por rota da própria tela
(`preparar`), para o sino não mudar nas outras fotos.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline | guard: os dois saem da linha de base |
| 2 | Jarvas e barra lateral idênticos em todos os estados fotografados | `comparar` contra `--ref HEAD`: 87 telas, 0 diferença |
| 3 | Testes existentes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: o item bloqueado pelo plano e o
  Relatório protegido por senha não são fotografados. O primeiro depende do plano do
  estabelecimento carregado do banco, e o segundo de um usuário sem permissão de relatório;
  as regras copiam os valores de antes.
