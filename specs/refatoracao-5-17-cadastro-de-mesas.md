# Refatoração 5.17: cadastro de mesas sem estilo inline e sem emoji

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `mesas/MesasAdmin.jsx` (19), `ModalMesa.jsx` (15), `ConfirmarExclusaoMesa.jsx` (9) e
  `CardMesaAdmin.jsx` (6) para 0. Com isso a área de mesas inteira, do PDV e do cadastro,
  fica sem estilo inline.
- O editor do salão continua calculando a posição de cada peça no JavaScript (a conta de
  arrastar e soltar depende dela), mas a posição chega ao CSS por `--mesas-x` e `--mesas-y`,
  e o tamanho do cartão por `--mesas-card-w` e `--mesas-card-h`, tirados de `CARD_W` e
  `CARD_H`: a medida continua com uma fonte só. A mesa sendo arrastada virou o modificador
  `--arrastando`.
- O destaque do cartão ao passar o mouse saiu do estado React e virou `:hover`. O estado
  continua decidindo só se os botões de editar e remover aparecem, como antes (o teste de
  remoção depende disso).
- Botões com aparência de travado agora usam `:disabled`, porque a condição visual era a
  mesma do `disabled`: salvar layout, confirmar na janela, remover, e o número da mesa na
  edição. A borda vermelha do número repetido ou vazio agora vem de `aria-invalid`.
- Sem emoji (decisão 037): a cadeira do estado vazio virou `LuArmchair`. O botão de fechar a
  janela ganhou nome para leitor de tela; os dois avisos de erro ganharam `role="alert"`.

Antes da conversão o roteiro ganhou nove telas: o mapa do PDV com mesas posicionadas e uma
sem posição (até aqui só a grade tinha foto), e, no cadastro, o salão, o hover do cartão, a
pré-visualização de nove mesas, uma mesa arrastada com o botão de salvar layout, a janela de
nova mesa, a de número repetido, a de editar e a de remover. As mesas ganham posição só
nessas telas, por rota do roteiro, para a grade do PDV continuar coberta.

## Diferenças

Contra o código de antes da conversão, 142 telas: 0 com diferença e 3 leves, todas vistas.

- Janelas de nova mesa e de editar: o campo com foco ganha a borda na cor de destaque, pela
  regra global de foco de `inputs.css`, agora que a borda está numa classe. Esperado, como
  nas rodadas anteriores.
- Mesa arrastada: depois de soltar, o cursor fica sobre a mesa, e o `:hover` a destaca. O
  hover em JavaScript não percebia, porque o navegador não dispara `mouseenter` durante o
  arrasto. O novo comportamento é o certo (o cursor está mesmo em cima do cartão); os botões
  de editar e remover continuam aparecendo só quando o mouse se mexe, como antes.

A primeira referência derrubou a tela de editar com `form.numero.trim is not a function`. Não
era defeito do sistema: `mesas.numero` é `text` no banco e chega sempre como texto, mas as
mesas falsas da rodada 5.16 tinham número. O Supabase falso passou a mandar texto, igual ao
banco, e a referência foi refeita. O roteiro também registra os erros de tela num log, e as
duas capturas finais saíram sem nenhum.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os quatro arquivos sem estilo inline e sem emoji | os dois guards: saem das linhas de base |
| 2 | Cadastro e janelas iguais na tela, fora a borda de foco esperada | `comparar`, cada diferença vista |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor e antigo: o número da mesa no cadastro não
  pode ser alterado, e a ajuda diz "o número é chave primária", termo técnico na tela
  (princípio nº 1). Fica para a rodada de textos, não é desta fase.
