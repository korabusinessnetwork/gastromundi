# Refatoração 5.18: o resto da Frente de Caixa sem estilo inline e sem emoji

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `ClienteFiadoSelector.jsx` (23), `pdv/CabecalhoPdv.jsx` (11), `pdv/SaldoModal.jsx` (9),
  `CheckoutView.jsx` (7), `ProductGrid.jsx` (5) e `PDVView/index.jsx` (1) para 0. Com isso a
  pasta `PDVView` inteira fica sem estilo inline.
- Os espaços que vinham do `sz` chegam por variável: `--pdv-pad`, `--pdv-pad-sm` e
  `--pdv-gap` na raiz do PDV (cabeçalho e abas), `--pg-*` na grade de produtos e `--saldo-*`
  no Saldo do Dia. O cabeçalho no celular virou o modificador `pdv__header--celular`, e o
  Saldo em tela estreita virou `pdv__saldo-modal--estreito`.
- Estado virou classe: o botão de ajuste com desconto ou acréscimo, o modo de remover item, o
  valor da comanda sem itens, a cor de cada indicador do saldo. O Voltar do checkout tinha
  hover em JavaScript e virou `:hover`, com `:disabled` enquanto a venda confirma (a condição
  visual era a mesma do `disabled`). O mesmo vale para "Cadastrar e usar" do fiado.
- A cor de cada meio de pagamento no Saldo do Dia saiu da tabela de hexadecimais do JSX:
  dinheiro, crédito e Pix agora usam `--gm-green`, `--gm-blue` e `--gm-warn` (mesmo tom de
  fábrica, e o estabelecimento troca pelo tema). O débito fica no violeta literal no CSS,
  porque o design system não tem token para ele; é da tarefa 5.x.
- Sem emoji (decisão 037): a cadeira do subtítulo da comanda com mesa virou `LuArmchair`. O
  botão de trocar o cliente do fiado ganhou nome para leitor de tela, e o erro da busca ganhou
  `role="alert"`.

Antes da conversão o roteiro ganhou oito telas: o fiado no checkout (vazio, busca com dois
clientes fictícios, sem resultado, cadastro rápido com telefone incompleto, cliente
escolhido), o Voltar com o mouse em cima e o Saldo do Dia (pedindo senha e aberto). O fiado
é ligado só nessas telas, por rota do roteiro.

## Diferenças

Contra o código de antes da conversão, 150 telas: 1 com diferença e 2 leves, as três da
comanda aberta na Mesa 4, onde a cadeira do subtítulo era emoji e agora é ícone na cor do
texto. Vistas lado a lado. Nenhum erro de tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os seis arquivos sem estilo inline e a pasta do PDV sem emoji de código | os dois guards |
| 2 | A única mudança de tela é o emoji trocado por ícone | `comparar`: 1 diferença e 2 leves, vistas |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: o cartão de produto da grade ainda mostra
  o emoji que o estabelecimento escolheu para o produto; esse campo sai na rodada própria da
  decisão 037, depois da fase 5. Menor e antigo: os valores do PDV seguem com ponto
  ("R$ 32.00"), já registrado na 5.16.
