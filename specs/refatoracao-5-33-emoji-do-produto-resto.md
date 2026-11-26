# Refatoração 5.33: o emoji do produto sai do resto do sistema, e o guard exige zero

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T10, segunda metade.

## A mudança

- **Celular:** o emoji do produto sai dos cartões do Pedido e do PDV, do carrinho, do detalhe
  da comanda (linha do item e confirmação de excluir) e da lista do Cardápio (onde entra o
  ícone neutro `LuPackage`, porque o emoji tinha lugar fixo no desenho).
- **Cardápio público:** o azulejo de reserva, que aparece quando o produto não tem foto ou a
  foto falha, mostra o ícone de prato `LuUtensils` em vez do emoji do produto, no cartão e no
  destaque da janela do produto.
- **Página da Kora:** os produtos de demonstração do PDV de exemplo não têm mais emoji.
- **Importação por planilha (contrato muda):** o modelo e a exportação deixam de ter a coluna
  `emoji`; uma planilha antiga, com a coluna, importa normalmente e a coluna é ignorada; a
  importação não grava nem altera o emoji de nenhum produto. `docs/03_REGRAS_DE_NEGOCIO/MIGRACAO_DADOS.md`
  foi corrigido junto (contrato, exemplo e a nota da coluna no banco). Teste antes: casos novos e
  ajustados na planilha e no plano de importação, vermelhos e depois verdes.
- **Formulário e consultas do produto:** o formulário (`regras/produto.js`, `useProdutos`) não
  carrega nem grava mais o emoji, e as consultas de combos e notas de entrada não o pedem mais.
- **O `emojiGuard` passa a exigir zero.** A contagem chegou a 0: o arquivo
  `emojiGuard.linhaDeBase.json` saiu e o teste falha com qualquer emoji no que o código escreve
  (conferido com um arquivo de teste com "🎉"). O CLAUDE.md foi atualizado: a regra exige zero,
  e ©, ® e ™ ficam de fora da contagem.

A coluna `emoji` da tabela `products` continua no banco, sem uso: apagá-la é migration em
produção e fica com o dono (pendência registrada).

## Diferenças

Contra o código da 5.32, 209 telas: 4 com diferença e nenhuma leve, as quatro do celular onde
o emoji do produto aparecia (Pedido no celular e no computador, PDV rápido e Cardápio do Palm),
vistas lado a lado: os cartões ficam só com nome e preço, e a lista do Cardápio com o ícone
neutro. O cardápio público não muda na foto porque o estabelecimento de demonstração não tem
delivery configurado; o azulejo de reserva está coberto pelos testes de componente.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Emoji no código: 0, sem lista de exceções | métrica e `emojiGuard` sem linha de base |
| 2 | Importação aceita planilha antiga e não grava emoji | testes da planilha e do plano |
| 3 | Mudanças de tela só onde havia emoji de produto | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Dois testes do cardápio público esperavam o emoji
  do produto no azulejo de reserva; foram reescritos para a regra nova (o azulejo continua, com
  o ícone de prato).
