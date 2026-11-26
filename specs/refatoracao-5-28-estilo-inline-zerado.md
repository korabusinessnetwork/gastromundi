# Refatoração 5.28: o estilo inline que sobrava, e o guard passa a exigir zero

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T07.

## A mudança

- Os últimos oito arquivos para 0: `estoque/PopupAutorizacaoEstoque` (3), `apex/demo/DemoRelatorios`
  (3), `delivery/SacolaModal` (4), `console/PlanosDashboard`, `delivery/ModalProduto`,
  `shared/Notification`, `delivery/CardapioPage` e `mobile/.../CarrinhoSheet` (1 cada).
  - Barras de proporção (planos do Console, gráficos da demonstração) recebem o tamanho por
    `--barra`; o menu da foto do produto no delivery, a posição por `--menu-topo` e
    `--menu-esquerda`.
  - A janela de liberar entrada do Estoque: borda de senha errada por `aria-invalid`, botão
    "Liberar" travado por `:disabled` (a condição era a mesma).
  - A notificação passa a ter `notification--ok` e `--erro` e ganhou `role="status"`.
  - O espaço no fim do cardápio público e a folha do carrinho sendo arrastada viraram
    modificadores.
- Sem emoji (decisão 037): a notificação mostrava "🗑️" no erro e "✅" no sucesso; viraram
  `LuCircleAlert` e `LuCircleCheck`.
- **O guard passa a exigir zero.** Com a linha de base vazia, o `inlineStyleGuard` deixa de
  comparar com ela: o arquivo `inlineStyleGuard.linhaDeBase.json` saiu e o teste falha se
  qualquer arquivo tiver `style={{}}` que não seja só variável CSS. Conferido nos dois
  sentidos: um arquivo de teste com `style={{ color: "red" }}` faz o guard falhar, e sem ele o
  guard passa. É o "pronto quando" da fase 5 para estilo inline ("guard em zero, sem lista de
  exceções").

O roteiro ganhou três telas: a janela de liberar entrada do Estoque (vazia e com senha errada) e
a aba de planos do Console.

**Lacunas de foto, conferidas linha a linha:** a sacola do cardápio público (o estabelecimento
de demonstração não tem delivery configurado), a demonstração da página de vendas (outra
superfície, o domínio da Kora), o menu da foto do produto, a notificação (some em segundos) e a
folha do carrinho do celular sendo arrastada.

**Um teste a menos, de propósito:** a suíte vai de 4.435 para 4.434 testes. O guard tinha dois
testes, um para "nenhum arquivo sobe" e outro para "a linha de base acompanha a queda"; sem
linha de base, os dois viram um só, "nenhum arquivo tem estilo inline", que cobre os dois.

## Diferenças

Contra o código de antes da conversão, 206 telas: 0 com diferença e 1 leve. A leve é a janela
de liberar entrada do Estoque: o campo de senha abre com foco e agora recebe a borda da regra
global de foco, como nas rodadas anteriores. Nenhum erro de tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum estilo inline no sistema, sem lista de exceções | `inlineStyleGuard` sem linha de base, verde; vermelho com um estilo de teste |
| 2 | Telas iguais, fora o que está explicado | `comparar` |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante.
