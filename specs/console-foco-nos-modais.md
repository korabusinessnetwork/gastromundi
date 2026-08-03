# CONSOLE-UX 25 — o foco dentro dos modais do Console

## 1. Escopo

Os **sete modais do Console** passam a cuidar do foco do teclado, com uma regra
só num hook novo (`useFocoDoModal`), em três partes:

1. **Foco ao abrir** — vai para o primeiro campo do modal; se o modal não tem
   campo (histórico de pagamentos, add-ons), vai para a própria caixa, para que
   o Tab comece de dentro e o leitor de tela anuncie o diálogo.
2. **Tab preso dentro do modal** — Tab e Shift+Tab circulam entre os elementos
   do modal e nunca escapam para a página que está por baixo do fundo escuro.
3. **Foco devolvido ao fechar** — volta para o elemento que abriu o modal (o
   botão da lista de estabelecimentos), em vez de largar o dono no começo da
   página.

Hoje nenhuma das três existe: `grep` por `autoFocus`, `focus()` e `tabIndex` em
`src/components/console/` não devolve nada. O modal abre com o foco parado no
botão que ficou lá atrás, o Tab passeia pela tabela inteira por baixo do modal,
e ao fechar o dono precisa achar o mouse de novo.

## 2. Fora de escopo

- Modais **fora do Console** (PDV, delivery, estoque) — o hook nasce genérico,
  mas aplicar exige inventário próprio.
- `aria-labelledby` / `aria-describedby` e revisão de rótulos: os modais já têm
  `role="dialog"`, `aria-modal` e `aria-label`.
- `inert` ou `aria-hidden` no resto da página (o Tab preso já resolve o teclado;
  esconder o fundo do leitor de tela é outra rodada).
- Atalhos de teclado novos (Ctrl+Enter para salvar e afins).
- Mudar qualquer regra de negócio, texto, layout ou validação dos modais.

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 25.
- Recomendação registrada em `specs/_loop.md` ao fim da rodada 50.
- Rodada 50 (`specs/console-esc-e-clique-fora.md`): deixou o teclado pela
  metade de propósito — o gesto de sair entrou, o foco ficou para esta.
- `CLAUDE.md`, Princípio nº 1: "Fluxos óbvios: a próxima ação deve ser sempre a
  mais visível" e "Consistência total com o design system".

## 4. Arquivos afetados

- `src/hooks/useFocoDoModal.js` — **novo**. O hook, devolvendo a ref da caixa.
- `src/hooks/useFocoDoModal.test.jsx` — **novo**. Testes do hook.
- Os sete `src/components/console/*Modal.jsx` — uma linha de hook e a `ref` na
  `div.nem-modal`.
- `src/components/console/NovoEstabelecimentoModal.css` — só se a caixa com
  `tabIndex={-1}` precisar apagar o contorno de foco do navegador.

## 5. Critérios de aceite

1. `useFocoDoModal()` vive em `src/hooks/` e devolve **uma ref** para pôr na
   caixa do modal (`div.nem-modal`) — o modal não escreve lógica de foco.
2. Ao montar, o foco vai para o **primeiro campo habilitado** dentro da caixa
   (`input`, `select` ou `textarea` não desabilitado, na ordem do DOM).
3. Sem nenhum campo habilitado, o foco vai para a **caixa do modal**, que ganha
   `tabIndex={-1}` para poder recebê-lo — e sem contorno de foco visível, que
   ali não ajuda ninguém.
4. O botão "X" **nunca** é o primeiro a receber foco: abrir um modal já com o
   dedo em cima de "Fechar" é convite a fechar sem querer.
5. **Tab** no último elemento focável do modal volta para o primeiro;
   **Shift+Tab** no primeiro vai para o último. O foco nunca sai da caixa.
6. Elementos **desabilitados** (durante o envio, por exemplo) ficam fora do
   ciclo do Tab, e a lista de focáveis é recalculada a cada Tab — não pode ser
   uma lista congelada na montagem, porque o conteúdo do modal muda (a
   confirmação de descarte, o estorno em confirmação, a lista que carrega).
7. Ao desmontar, o foco volta para o elemento que estava focado antes de o modal
   abrir, se ele ainda existir na página.
8. Se o elemento anterior sumiu da página (a linha da tabela foi recarregada
   depois de criar ou renovar), o desmonte **não quebra** e simplesmente não
   devolve o foco a lugar nenhum.
9. O ouvinte de `keydown` é registrado uma vez e removido ao desmontar, sem
   `keydown` órfão no `document` — mesma regra do `useFecharModal` (rodada 50).
10. Os sete modais usam o hook, e nenhum deles ganha lógica de foco própria.
11. Esc e clique fora (rodada 50) continuam funcionando exatamente como estão,
    inclusive a confirmação de descarte e o estorno em confirmação.
12. Nenhum `style` no JSX; se precisar de CSS, vai para o `.css` com tokens
    `--gm-*`.
13. Nada de migration, consulta nova, variável de ambiente nova ou dependência
    nova.
14. Suíte verde (`npx vitest run`), com teste do hook cobrindo os critérios 2 a
    8 e teste de tela mostrando o foco inicial num modal com campo e noutro sem.

## 6. Edge cases conhecidos

- **Modal cujo conteúdo carrega depois** (histórico, add-ons): na montagem não
  há campo nenhum, então o foco fica na caixa. Não perseguir o campo que
  aparecer depois — foco que se move sozinho é pior do que foco parado.
- **Todos os campos desabilitados durante o envio**: o ciclo do Tab fica com os
  botões, ou vazio; nesse caso o Tab não faz nada e nada quebra.
- **Confirmação de descarte aberta**: o rodapé troca de botões; como a lista de
  focáveis é recalculada a cada Tab, o ciclo já contempla os novos.
- **Elemento anterior removido do DOM** (critério 8).
- **Ambiente sem `document`**: os modais já dependem de `createPortal` sobre
  `document.body`.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes dos sete modais —
em especial nos envios, no fechamento após sucesso e nas saídas por Esc e clique
fora entregues na rodada 50.

## 8. Resultado da review (2026-08-03)

Aprovado sem ressalvas — 14 de 14 critérios em sim. Suíte `npx vitest run`:
201 arquivos / 3503 testes, verde (+13 desta rodada).

Sem desvio do escopo e sem correção necessária na review. O hook nasceu com
teste próprio (10 casos) e os dois casos de tela — modal com campo (cadastro) e
modal sem campo nenhum (histórico de pagamentos) — têm teste.

O tropeço que valeu registro foi de teste, não de código: filtrar os focáveis
por visibilidade (`offsetParent`) zeraria a lista inteira no jsdom, e todo teste
de Tab passaria por engano. Aqui o filtro é só `disabled`, e o comentário no
hook diz por quê.

**Fica para uma próxima rodada:**

- `inert` ou `aria-hidden` no resto da página enquanto o modal está aberto: o
  teclado já está preso, falta esconder o fundo do leitor de tela.
- Aplicar os dois hooks (`useFecharModal` + `useFocoDoModal`) nos modais **fora
  do Console** — PDV, delivery, estoque. Falta o inventário de quem tem estado
  interno a desfazer antes de fechar.
- `aria-labelledby` apontando para o `<h2>` de cada modal, em vez do
  `aria-label` escrito à mão que existe hoje.
