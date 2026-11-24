# Refatoração 4.7: Relatórios com o mesmo ticket médio

> Pedido do dono (2026-11-24): *"continue"*.

## O que estava escrito mais de uma vez

O ticket médio (total dividido pelo número de vendas, zero quando não houve venda) estava
escrito **oito vezes**: duas no relatório de Desempenho do computador, duas no gancho dos
Relatórios, uma no resumo de relatórios do celular, uma na tela do garçom e duas nos
agrupamentos por dia e por operador (`utils/datas.js`). As oito faziam a mesma conta.

Agora é `ticketMedio` em `lib/vendas.js`, módulo puro: `utils/datas.js` também usa, e ele
não pode importar `lib/relatorios.js`, que carrega o Supabase.

## O que parece igual e não é

A comparação de período: o celular compara sempre com o período anterior, o computador deixa
escolher a base da comparação. Continuam diferentes.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | A conta do ticket médio existe uma vez só | busca por `> 0 ? x / y : 0` vazia |
| 2 | A regra nasce com teste | `vendas.test.js` |
| 3 | O resumo do celular, que não tinha teste, mostra o ticket certo, provado por sabotagem | `RelatoriosModulo.test.jsx` |
| 4 | Testes existentes passam; telas idênticas no roteiro de fotos | suíte; `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim.
