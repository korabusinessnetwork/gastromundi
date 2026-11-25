# Refatoração 5.15: área de Relatórios sem estilo inline e sem emoji

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `relatorio/RelatorioView.jsx` (15), `AbaCancelamentos.jsx` (22), `AbaFechamentos.jsx` (15),
  `AbaLogs.jsx` (13), `AbaCredenciais.jsx` (15) e `AbaAdmin.jsx` (17) para 0. A casca passa o
  espaçamento de `sz` por variável (`--rel-pad`, `--rel-pad-sm`, `--rel-gap`), e as abas,
  que ficam dentro dela, herdam. A estrutura que as cinco abas repetiam virou um conjunto
  comum `rel-*` no `RelatorioView.css` (aba, indicadores, barra, conteúdo, tabela, linha com
  hover, rodapé). Aba ativa, período escolhido, data preenchida, origem do cancelamento e a
  linha de fechamento com observação viraram modificadores; a cor do tipo de registro em
  Logs chega como `--log-cor`. O bloco `<style>` do ícone do calendário saiu do JSX.
- Sem emoji na área (decisão 037): os estados vazios de Vendas e do Desempenho, o ícone dos
  cartões de comanda, a observação do item e os filtros de Logs eram emoji e viraram
  `LuReceipt`, `LuCalendar`, `LuHourglass`, `LuChartBar`, `LuNotebookPen` e `LuLandmark`. O
  `Estado` do Desempenho passou a receber o componente do ícone. Emoji no código: 112 para 102.
- Com isso a área de Relatórios inteira fica sem estilo inline e sem emoji.

Antes da conversão o Supabase falso ganhou três fechamentos (conferido, com falta, com
sobra), seis registros de ação e um item cancelado numa venda; o roteiro ganhou oito telas.

## Diferenças

Contra `--ref HEAD`, 129 telas: 3 com diferença e 1 leve, todas onde havia emoji (calendário
do Desempenho, recibo dos cartões de comanda, os dois filtros de Logs). Cada uma vista.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os seis arquivos sem estilo inline e a área sem emoji | os dois guards: saem das linhas de base |
| 2 | As únicas mudanças de tela são os emojis trocados por ícone | `comparar`: 3 diferenças e 1 leve, cada uma vista |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: o ícone de recibo dos cartões de comanda
  ficou na cor do texto (o emoji tinha cor própria); a cor de destaque seria uma escolha
  visual nova, então ficou neutra. Menor: o KPI "Itens Cancelados" continua com o laranja
  `#f97316` cravado, que é da tarefa 5.x (cores fixas).
