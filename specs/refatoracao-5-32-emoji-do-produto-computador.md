# Refatoração 5.32: o emoji do produto sai do computador e da impressão

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T10, primeira metade.
> Decisão 037: "o ícone que o estabelecimento escolhe para cada produto também sai".

## A mudança

- **Escolha:** o campo "Emoji" da janela de produto do Delivery saiu, e o salvamento não
  grava mais o campo (num produto já existente, o valor antigo fica no banco, sem uso; não há
  migration).
- **Impressão:** o emoji do produto não vai mais para o papel, nem na térmica (onde saía
  como um quadrado) nem no navegador: comprovante, via de produção e layout de comanda
  configurável. A opção "Emoji do produto" do layout saiu, e um layout antigo com ela ligada é
  ignorado. Teste antes: cinco casos novos, vermelhos e depois verdes; dois testes antigos que
  esperavam o campo `emoji` no item montado foram ajustados para a regra nova.
- **Exibição no computador:** PDV (grade de produtos, carrinho, resumo do checkout, avisos de
  estoque, saldo do dia, transferir itens, comandas fechadas), Cadastro de Produtos, Estoque,
  Impostos, Combos, Fichas Técnicas, Notas de Entrada, Delivery (cartão, grupos de
  complemento), Relatórios (tela e planilha exportada) e Importar/Exportar.
  - Onde o emoji ocupava um lugar fixo no desenho (coluna da lista, caixa do cartão, item de
    lista), entra um ícone neutro, `LuPackage` (ou `LuUtensils` no cartão do Delivery sem
    foto), na cor do tema.
  - Onde o emoji só vinha antes do nome, ele sai e fica o nome.
- **Dados de exemplo** da prévia de impressão sem emoji.

O que sobra no `emojiGuard` (17) é do celular, do cardápio público, da página da Kora, da
importação por planilha e do formulário do produto: a 5.33.

## Diferenças

Contra o código da 5.31, 209 telas: 33 com diferença e 25 leves, todas onde havia emoji de
produto (PDV, checkout, Cadastro, Estoque, Impostos, Combos, Fichas, Relatórios, prévia de
impressão). Conferidas pelas telas inteiras depois da mudança: o desenho se mantém, com o
ícone neutro no lugar do emoji nas listas e os cartões do PDV só com nome e preço.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum emoji de produto no computador nem no papel | `emojiGuard` (40 para 17) e os testes de impressão |
| 2 | Telas sem quebra de desenho | `comparar` e as telas inteiras do depois |
| 3 | Testes passam | suíte (4.444) |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Na primeira passada a troca automática caiu dentro
  de dois template strings (planilha do relatório e chip do Importar/Exportar) e deixou o texto
  quebrado; a suíte e o lint pegaram, e as linhas foram reescritas à mão.
