# Refatoração 3: PDV do celular e coordenação da carga

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

1. **PDV do celular** (`pages/mobile/modulos/pdv/PdvModulo.jsx`, 656 linhas): o
   `Cabecalho` vai para o seu arquivo, as constantes para `apoio.jsx`, e a lógica da venda
   de balcão para `features/pdv/hooks/usePdvCelular.js` (10 `useState`). Os três passos da
   venda (itens, cobrar, concluído) são retornos antecipados e ficaram na tela: 363 linhas.
2. **Coordenação da carga** (`app/CoordenacaoDaCarga.jsx`, 607 linhas): o reenvio da fila
   offline vai para `app/useDrenoFilaOffline.js`, recebendo os 7 nomes de que depende. A
   coordenação fica com 455 linhas.
3. **Fronteira nova, `features/` não importa de `components/desktop/`.** Ao tirar a lógica
   do PDV do celular para um gancho, o aviso "celular importa da pasta do computador" sumiu,
   mas a dependência não: o gancho importa `useFinalizarPagamento` de lá. O mesmo acontece em
   outros 10 arquivos das rodadas anteriores, que importam constantes dos `apoio` das telas.
   A regra de lint e a métrica passam a contar esses casos: 13 imports em 11 arquivos,
   que vão a zero nas fases 4 e 6.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos ficam abaixo de 600 linhas e 15 `useState` | `wc -l`, contagem |
| 2 | Os testes da fila offline passam sem alteração, e desligar o dreno no gancho novo os faz falhar | suíte; sabotagem |
| 3 | O PDV do celular, que não tinha teste, ganha teste da venda de balcão (dinheiro com troco, valor insuficiente travado), provado por sabotagem | `PdvModulo.test.jsx` |
| 4 | A dependência de `features/` para a pasta do computador é contada pelo lint e pela métrica | `eslint.config.js`, `npm run metricas` |
| 5 | Telas idênticas, suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Arquivos acima de 600 linhas: 5 para 3, e os 3 são bibliotecas
de regras em `src/lib/` (`console.js`, `deliveryAdmin.js`, `delivery.js`). Nenhuma tela
passa mais de 600 linhas. Avisos de lint: 26 para 38, todos os 13 novos sendo a fronteira
nova; o aviso da fronteira do celular saiu porque o import mudou de lugar, e agora é
contado na regra de `features/`.
