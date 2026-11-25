# Refatoração 5.5: aba Vendas e painel de pagamento sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `relatorio/AbaVendas.jsx`: 59 atributos `style` para 1, o das variáveis de espaçamento
  (`--vendas-gap`, `--vendas-pad`, `--vendas-pad-sm`, vindas de `sz`). Regras em
  `relatorio/AbaVendas.css`, co-localizado. Modo ativo (resumido, detalhado, por dia) por
  modificador; hover das linhas em CSS; a grade de indicadores com duas colunas abaixo de
  700px por modificador ligado à mesma largura.
- `PDVView/checkout/PainelPagamento.jsx`: 48 para 1, o das variáveis da grade de métodos
  (`--metodos-colunas`, `--metodos-linhas`). Regras acrescentadas ao `CheckoutView.css`.
  Método escolhido, troco ou falta, falta alocar ou valor excedente e botão de confirmar
  liberado viraram modificadores. `:disabled` nos chips e cartões de método, onde a condição
  de aparência era a mesma do `disabled`. O botão de confirmar não: ele fica desabilitado
  também enquanto processa, mas continua verde, então usa o modificador `--pode`. Os botões
  de mais e menos do divisor não são desabilitados (o clique só não muda nada nos limites),
  então o visual de limite é o modificador `--limite`. Hover do remover e do "Adicionar
  outro" em CSS.
- Os campos de valor pintavam a borda no foco por `onFocus`/`onBlur`; agora quem pinta é a
  regra global de foco do sistema. Nas fotos com o campo de troco focado, o pixel da borda é
  o mesmo antes e depois.

Antes da conversão o roteiro ganhou três vendas no Supabase falso (uma com pagamento
dividido e uma do dia anterior) e sete telas: os três modos da aba Vendas com dados, e o
pagamento com troco, com falta, com o divisor aberto e dividido com valor faltando. Linha de
base refeita com o código sem conversão.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline fora de variável CSS | guard: os dois saem da linha de base |
| 2 | Vendas e pagamento idênticos em todos os estados fotografados | `comparar`: 62 telas, 0 diferença |
| 3 | Testes existentes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: o estado "valor excede o total" do modo
  dividido, o método indisponível sem internet e o cliente do fiado não são fotografados; as
  regras copiam os valores de antes. Menor: a janela de remover item ainda usa
  `.checkout-view__stepper-btn` com estilo inline; o fundo de cartão ficou num modificador só
  do divisor para não mexer nela.
