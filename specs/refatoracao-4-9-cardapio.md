# Refatoração 4.9: Cardápio com a mesma busca e a mesma regra de gerência

> Pedido do dono (2026-11-24): *"continue"*.

## O que estava repetido, e o que divergia

| Regra | Antes | Agora |
|---|---|---|
| Busca de produto pelo nome | 9 lugares comparavam só em minúsculas ("cafe" não achava "Café"): Cardápio do computador e do celular, grade do garçom, combos, fichas técnicas, impostos, vínculo de nota fiscal. Estoque e administração do delivery já ignoravam acento | `nomeBateComBusca` em `lib/busca.js`, sobre `normalizarTexto` |
| Gerência (admin ou gerente) | 11 cópias à mão: excluir cliente, ver documento, pausar produto, autorizar sozinho, conversar com o Jarvas, relatórios, delivery, usuários | `ehGerencia` em `constants/roles.js` |

## Mudança deliberada

A busca por nome passa a ignorar acento, maiúscula e espaço sobrando em todas as telas
listadas, como já fazia no Estoque e no Delivery. Antes, a mesma palavra achava o produto
numa tela e não achava em outra.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Cada regra existe uma vez só | busca por `role === "admin" \|\| ... "gerente"` e `name.toLowerCase().includes` vazia |
| 2 | As regras nascem com teste | `busca.test.js` |
| 3 | O Cardápio do celular, que não tinha teste, acha "Café" com "cafe", provado contra a versão anterior | `CardapioModulo.test.jsx` |
| 4 | Testes existentes passam; telas idênticas no roteiro de fotos | suíte; `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim.
