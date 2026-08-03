# CONSOLE-UX 24 — Esc e clique fora fecham os modais do Console

## 1. Escopo

Os **sete modais do Console** passam a fechar por **Esc** e por **clique no fundo
escuro**, além do "X" e do "Cancelar" que já existem. A regra é uma só, num hook
compartilhado: o gesto de sair chama exatamente o mesmo caminho que o botão de
fechar daquele modal — inclusive a confirmação de descarte da rodada 23, no
cadastro de estabelecimento.

Modais afetados: `NovoEstabelecimentoModal`, `AlterarPlanoModal`,
`DefinirMensalidadeModal`, `ConfirmarRenovacaoModal`, `AddonsModal`,
`AlterarLayoutModal`, `HistoricoPagamentosModal`.

Hoje a única saída é acertar o "X" de 36×36 ou o "Cancelar". Esc e clique fora
são o que qualquer pessoa tenta primeiro em qualquer janela flutuante — e o
Console é a tela que o dono usa com o cliente esperando do outro lado do balcão.
Até a rodada 49 faltava para onde esse gesto ir no cadastro (fechava e apagava
tudo); agora existe: ele cai na pergunta de descarte.

## 2. Fora de escopo

- **Prender o foco** dentro do modal (focus trap) e devolver o foco ao botão que
  o abriu. É acessibilidade de teclado de verdade, merece rodada própria.
- **Foco automático** no primeiro campo ao abrir.
- Modais **fora do Console** (PDV, delivery, estoque): mesma ideia, outro dono,
  outra rodada — o hook nasce reutilizável, mas não sai aplicando por conta.
- Mudar qualquer regra de negócio, texto, layout ou validação dos modais.
- Empilhamento real de modais (o Console nunca abre dois ao mesmo tempo).

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 24.
- Recomendação registrada em `specs/_loop.md` ao fim da rodada 49.
- `CLAUDE.md`, Princípio nº 1: "Consistência total com o design system — mesmos
  padrões, ícones e posições entre telas" e "Fluxos óbvios".
- Rodada 49 (`specs/console-descartar-cadastro.md`): a confirmação de descarte é
  o destino do Esc no cadastro; Esc nunca destrói nada.
- Convenção do projeto: hooks em `src/hooks/`, nome em português do domínio.

## 4. Arquivos afetados

- `src/hooks/useFecharModal.js` — **novo**. O hook com as duas saídas.
- `src/hooks/useFecharModal.test.jsx` — **novo**. Testes do hook.
- Os sete `src/components/console/*Modal.jsx` — passam a usar o hook.
- `src/components/console/NovoEstabelecimentoModal.test.jsx` e
  `HistoricoPagamentosModal.test.jsx` — testes de tela dos casos com estado
  interno.

## 5. Critérios de aceite

1. `useFecharModal(aoPedirFechar, bloqueado)` vive em `src/hooks/`, escuta
   `keydown` no `document` e devolve os handlers do fundo escuro.
2. O ouvinte de `keydown` é **registrado uma vez** e removido ao desmontar: a
   função de fechar entra por `useRef` atualizada a cada render, para que uma
   callback recriada a cada render não re-assine o evento toda hora.
3. **Esc** chama `aoPedirFechar` uma única vez por tecla; qualquer outra tecla
   não faz nada.
4. **Clique no fundo escuro** chama `aoPedirFechar`; clique em qualquer ponto
   *dentro* do modal, não.
5. **Arrastar de dentro para fora não fecha**: se o `mousedown` começou dentro do
   modal (selecionar texto de um campo e soltar o botão no fundo), o clique é
   ignorado. É o erro clássico dessa feature e some dado do dono quando acontece.
6. Com `bloqueado` verdadeiro — que cada modal liga no seu `enviando`/`salvando`
   —, nem Esc nem clique no fundo fazem qualquer coisa: é a mesma regra dos
   botões já desabilitados durante o envio.
7. Ao desmontar o modal, o ouvinte é removido (nenhum `keydown` órfão no
   `document`).
8. Nos **cinco modais simples** (`AlterarPlanoModal`, `DefinirMensalidadeModal`,
   `ConfirmarRenovacaoModal`, `AddonsModal`, `AlterarLayoutModal`), Esc e clique
   fora chamam o mesmo `onFechar` do botão "X".
9. No **`NovoEstabelecimentoModal`**, Esc e clique fora chamam `pedirParaFechar`:
   com o formulário vazio fecham direto; com dado preenchido abrem a confirmação
   de descarte, sem perder nada.
10. Com a **confirmação de descarte já aberta**, Esc e clique fora equivalem a
    "Continuar preenchendo" — voltam ao formulário. **Esc nunca descarta.**
11. No **`HistoricoPagamentosModal`**, com um estorno em confirmação
    (`emCancelamento`), Esc e clique fora **cancelam esse estorno** e voltam à
    lista, em vez de fechar o modal: o gesto desfaz sempre a coisa mais interna.
12. Nenhum modal ganha `style` no JSX; se precisar de CSS, vai para o `.css`
    correspondente com tokens `--gm-*`.
13. Nada de migration, consulta nova, variável de ambiente nova ou dependência
    nova.
14. Suíte verde (`npx vitest run`), com teste do hook cobrindo os critérios 3 a
    7 e teste de tela cobrindo os critérios 9, 10 e 11.

## 6. Edge cases conhecidos

- **Esc segurado** (auto-repeat do teclado): chama fechar mais de uma vez, mas o
  modal já sumiu depois da primeira — o componente desmonta e o ouvinte vai
  junto. Não precisa de trava extra.
- **Esc com um `<select>` aberto** (o campo Plano): o navegador consome a tecla
  para fechar a lista antes de o evento chegar ao `document`. Comportamento
  correto e esperado; não tentar contornar.
- **Clique no fundo durante `enviando`**: ignorado (critério 6).
- **`mousedown` no fundo e `mouseup` dentro do modal**: não fecha — o alvo do
  clique não é o fundo.
- **Modal desmontado por outro caminho** (sucesso do envio, que fecha sozinho):
  o cleanup do `useEffect` cuida; nada a fazer.
- **Ambiente sem `document`** (SSR): os modais já usam `createPortal` sobre
  `document.body`, então quem não tem `document` não chega aqui.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes dos sete modais —
especialmente nos envios e no fechamento após sucesso, que não passam a depender
do hook.

## 8. Resultado da review (2026-08-03)

Aprovado sem ressalvas — 14 de 14 critérios em sim. Suíte `npx vitest run`:
200 arquivos / 3490 testes, verde (+19 desta rodada).

Sem desvio do escopo e sem correção necessária na review. O hook nasceu com
teste próprio (9 casos) e os três comportamentos que dependem do modal —
cadastro, confirmação de descarte e estorno em confirmação — têm teste de tela.

**Fica para uma próxima rodada:**

- **Focus trap** e devolução do foco ao botão que abriu o modal, mais foco
  automático no primeiro campo. É o resto da acessibilidade de teclado, e agora
  é a maior lacuna dos modais do Console.
- Aplicar o mesmo hook nos modais **fora do Console** (PDV, delivery, estoque):
  ele já é genérico, falta só o inventário de quem tem estado interno a desfazer
  antes de fechar.
