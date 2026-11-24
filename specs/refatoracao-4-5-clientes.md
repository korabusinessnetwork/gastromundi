# Refatoração 4.5: Clientes do computador e do celular com a mesma regra de fiado

> Pedido do dono (2026-11-24): *"continue"*.

## O que estava escrito mais de uma vez

"Conta em aberto" (previsto ou vencido) já era regra do financeiro, `contaEmAberto`, com o
motivo documentado: conta vencida é a mais urgente e não pode sumir da lista. Ela estava
reescrita à mão em três lugares: no saldo devedor (`calcularSaldoDevedor`), no detalhe do
cliente no computador e no detalhe do cliente no celular.

Agora `lib/clientes.js` tem `contasDeFiadoEmAberto`, que usa `contaEmAberto`; o saldo
devedor e as duas telas usam ela.

## O que já era igual

O módulo do celular já usava `lib/clientes.js` para listar, buscar, ver o histórico e dar
baixa no fiado. A soma do fiado por cliente, para ordenar a lista, só existe no celular.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | "Previsto ou vencido" escrito à mão some do código de clientes | busca |
| 2 | A regra nova nasce com teste, e tirar "vencido" da regra do financeiro faz o fiado falhar | `clientes.test.js`; sabotagem |
| 3 | Testes existentes passam; telas idênticas no roteiro de fotos | suíte; `screenshots-refatoracao.mjs comparar` |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

4 de 4 critérios em sim. O teste da biblioteca substituía o módulo do financeiro inteiro e
levava a regra junto; passou a substituir só a gravação (`baixarConta`).
