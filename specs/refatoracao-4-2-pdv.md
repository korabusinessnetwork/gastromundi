# Refatoração 4.2: o PDV do computador e do celular com as mesmas regras

> Pedido do dono (2026-11-24): *"continue"*.

## O que estava escrito duas vezes (ou mais)

| Regra | Onde estava | Agora |
|---|---|---|
| Rótulo da comanda (número vira "Comanda 7", nome livre passa) | 8 cópias: carrinho, grade, finalização, apoio do PDV, cozinha, cancelamento, impressão, celular | `src/lib/rotuloComanda.js`; a impressão só acrescenta o "—" de comanda sem nome |
| Meios de pagamento padrão | `checkout/apoio.js`, `pdv/apoio.jsx` do celular, `ConfigProvider` | `METODOS_PADRAO` em `features/pdv/regras/pagamento.js` |
| TEF bloqueado sem internet | `useCheckout` e `usePdvCelular`, iguais | `metodoBloqueadoSemRede` |
| Troco em dinheiro | `useCheckout` sem arredondar, `usePdvCelular` arredondando | `trocoEmDinheiro`, em centavos exatos |

Os ícones de cada meio de pagamento continuam por superfície: são aparência, e a
aparência de cada tela continua diferente (plano, fase 4).

## Mudança deliberada de comportamento

O troco gravado na venda pelo computador passa a ser arredondado para centavos, como já
era no celular. Antes, R$ 10 numa conta de R$ 6,10 gravava `3.9000000000000004`. Na tela
nada muda, porque o valor já era exibido com duas casas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Cada regra da tabela existe uma vez só | busca por `fmtComanda`, `METODOS_PADRAO`, `metodoUsaTef(` nos ganchos |
| 2 | As regras novas nascem com teste | `rotuloComanda.test.js`, `regras/pagamento.test.js` |
| 3 | O troco gravado pelo computador sai em centavos, provado por sabotagem | teste em `PDVView.checkout.test.jsx` |
| 4 | Testes existentes passam sem alteração; telas idênticas no roteiro de fotos | suíte; `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Imports de `features/` para a pasta do computador: 10 para 8.
