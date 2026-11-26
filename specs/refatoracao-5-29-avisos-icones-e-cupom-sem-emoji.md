# Refatoração 5.29: avisos, ícones e cupom sem emoji

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T08, primeira metade.

## A mudança

Decisão 037, "o sistema não tem emoji". Esta rodada tira o emoji que é do código (não o do
campo de emoji do produto, que é da T10):

- **Cupom e via de produção.** A observação do item saía como "📝 sem cebola", e a impressora
  térmica não tem o desenho do emoji: imprime um quadrado. Agora sai "Obs.: sem cebola", a mesma
  palavra da sacola do cardápio, no comprovante e na via de produção (`escposFormatador.js`) e
  na impressão pelo navegador (`renderizar.js`). Teste antes: quatro casos novos, vermelhos com
  o "📝" e verdes com "Obs.:".
- **Avisos de erro.** O "⚠"/"⚠️" na frente da mensagem virou `LuTriangleAlert` em combos,
  cadastro de produto, categorias, subprodutos, delivery e cancelar comanda (12 lugares).
- **Ícones.** A cadeira da mesa na grade de comandas e na janela de escolher mesa virou
  `LuArmchair`; a lixeira de cancelar pedido, `LuTrash2`; o dinheiro de movimentar caixa,
  `LuBanknote`; a observação do item no checkout, `LuNotebookPen`. Os ícones dos círculos das
  janelas ficam na cor do círculo.
- **Ícone de cargo sem uso.** `constants/roles.js` guardava um emoji por cargo (`icon`) que
  nenhuma tela lia; o campo saiu.
- **Classe nova `gm-icone-texto`** (`src/styles/icones.css`, importada pelo `tema.css`) para
  ícone no meio de uma linha de texto.
- **©, ® e ™ deixam de contar como emoji** no `contarEmoji`. Estão na propriedade Unicode
  Extended_Pictographic, mas são símbolos de texto: o crédito "© OpenStreetMap" que a licença
  do mapa exige e o "© ano KORA" do rodapé. Teste antes: dois casos novos no `emojiGuard`,
  vermelhos e depois verdes.

O roteiro ganhou três telas: cancelar comanda com itens, cancelar pedido vazio e escolher
mesa.

## Diferenças

Contra o código de antes da conversão, 209 telas: 16 com diferença e 32 leves, todas nos
lugares trocados, conferidas por região e por amostra lado a lado.
- Checkout (19 telas): a observação do item com o ícone no lugar do "📝".
- Grade de comandas (12 telas, inclusive as que mostram a grade atrás de uma janela): a cadeira
  da Mesa 4 virou ícone.
- Movimentar dinheiro (4), cancelar pedido, escolher mesa, erro do cadastro de produto: o
  emoji virou ícone.
- Configurações, Impressão: a prévia do cupom mostra "Obs.: sem cebola". O emoji do produto
  na prévia ("🥤") continua e sai na T10.
- As leves de Reservas são o ruído de fonte de sempre.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Sem emoji de código nos arquivos tocados; cupom sem emoji na observação | `emojiGuard` (91 para 64) e os testes de impressão |
| 2 | As mudanças de tela são só os emojis trocados | `comparar`, por região e amostra |
| 3 | Testes passam | suíte (4.438) |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. O que sobra de emoji (64 em 30 arquivos) é o
  campo de emoji do produto e seus reservas (T10) e os estados vazios, o cardápio público e a
  página da Kora (próxima rodada).
