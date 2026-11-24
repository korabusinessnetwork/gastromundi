# Refatoração 4.10: Configurações do celular com as regras do computador, e o fim da fase 4

> Pedido do dono (2026-11-24): *"continue"*.

## O que estava em dobro

As seções de Configurações do celular já usavam a mesma camada de dados do computador
(mesas, unidades de medida, configuração do delivery, TEF). O que estava em dobro eram as
regras escritas dentro de cada tela:

| Regra | Cópias | Agora |
|---|---|---|
| Catálogo dos meios de pagamento (nome, ícone, descrição) | 4: finalização do PDV, fechamento de caixa, Meios de Pagamento do computador e do celular | `constants/metodosPagamento.js` (`METODOS_CATALOG` e `METODOS_POR_ID`) |
| Faixa nova e horário para edição do delivery | 2 gêmeas | `features/delivery/regras/edicaoHorario.js` |
| Posição livre, capacidade e validação de mesa nova | 2 | `features/mesas/regras/mapa.js` |

`edicaoHorario.js` mora na feature, e não em `lib/deliveryHorario.js`, porque o módulo de
horário se declara puro e não gera identificador; a primeira versão desta rodada pôs as
funções lá e foi desfeita ao reler o comentário que registra essa decisão.

Ficaram de cada tela, de propósito: os rótulos e cores dos tipos de unidade (aparência) e o
formato vazio do formulário de unidade (não é regra).

## Fronteiras zeradas, regras de lint viram erro

Para fechar a fase, as constantes que os ganchos usavam do `apoio` das telas foram para a
feature (`features/cardapio/regras/produto.js`, `features/relatorios/regras/relatorio.js`,
`features/mesas/regras/mapa.js`); os `apoio` reexportam para as telas. Resultado: nenhuma
tela do celular e nenhum arquivo de `features/` importa da pasta do computador, e as duas
regras de lint passaram de aviso a erro.

## Achado, registrado

TD025: `filtrarPorPeriodo` e `intervaloPeriodo` dizem espelhar uma à outra, mas só uma
limita o fim do período a "agora". Juntar muda resultado de relatório; decisão própria.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Cada regra da tabela existe uma vez só | busca |
| 2 | As regras novas nascem com teste | `mapa.test.js`, `edicaoHorario.test.js` |
| 3 | Nenhum arquivo de `pages/mobile` nem de `features/` importa de `components/desktop`, e a regra de lint é erro | `npm run metricas`, `eslint.config.js` |
| 4 | Testes existentes passam; telas idênticas no roteiro de fotos | suíte; `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. **A fase 4 está concluída.**
