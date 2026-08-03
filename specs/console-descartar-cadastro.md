# CONSOLE-UX 23 — confirmar antes de descartar o cadastro pela metade

## 1. Escopo

No modal de criação de estabelecimento, fechar (o "X" ou o "Cancelar") com
**qualquer dado preenchido** passa a pedir confirmação em vez de jogar o
formulário fora na hora. A pergunta aparece **dentro do próprio modal**, no lugar
do rodapé, com "Continuar preenchendo" como ação primária e "Descartar" como
secundária. Formulário ainda vazio fecha direto, sem perguntar.

É a única ação destrutiva sem volta do Console: nome, endereço do cardápio,
plano, mensalidade combinada, nome do responsável, usuário de acesso e a senha
provisória **sorteada** (rodada 20) somem juntos, e a senha em particular não dá
para recuperar — ela não é relida de lugar nenhum. Um clique no "X" no meio de
uma venda refaz o cadastro inteiro. O `CLAUDE.md` manda confirmar ação
destrutiva; este modal é o que mais tem a perder e é o único que não confirma.

## 2. Fora de escopo

- Fechar por **Esc** ou por clique fora do modal: hoje nenhum dos dois fecha o
  `NovoEstabelecimentoModal`, e criar essa saída é feature nova, não confirmação.
- **Guardar rascunho** do formulário (localStorage, retomar depois). É outro
  problema — e dado de cliente parado no navegador pede decisão do dono.
- Confirmar descarte nos outros modais do Console (`AlterarPlanoModal`,
  `DefinirMensalidadeModal`, `ConfirmarRenovacaoModal`, `AddonsModal`,
  `AlterarLayoutModal`): são de um campo só, onde reabrir custa um clique.
- Mudar o que acontece **depois** de criar (o cartão de primeiro acesso).
- Bloquear a saída durante o envio — `enviando` já desabilita os dois botões.

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 23.
- Recomendação registrada em `specs/_loop.md` ao fim da rodada 48.
- `CLAUDE.md`, Princípio nº 1: "Prevenção de erro > mensagem de erro:
  desabilitar/guiar antes de deixar o usuário errar; **confirmar ações
  destrutivas**"; e "Estados sempre visíveis".
- Decisão 018 / ADR-007: estilo em `.css`, tokens `--gm-*`, nada no JSX.
- Decisão 017 (white-label): texto genérico, sem nome de cliente ou de marca.

## 4. Arquivos afetados

- `src/lib/console.js` — `cadastroTemDados` (função pura).
- `src/lib/console.test.js` — testes da função.
- `src/components/console/NovoEstabelecimentoModal.jsx` — estado
  `confirmandoDescarte` e o rodapé de confirmação.
- `src/components/console/NovoEstabelecimentoModal.css` — classes da faixa de
  confirmação, se as existentes não bastarem.
- `src/components/console/NovoEstabelecimentoModal.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. `cadastroTemDados(form)` é função pura, sem I/O, e devolve `true` se **algum**
   campo digitável tiver conteúdo: nome, endereço do cardápio (quando tocado),
   mensalidade, nome do responsável, usuário de acesso (quando tocado) ou senha.
2. O **plano escolhido sozinho não conta** como dado preenchido: ele já vem
   selecionado por padrão quando o modal abre, e perguntar sobre um formulário em
   que ninguém digitou nada é fricção inventada.
3. Espaço em branco não conta como conteúdo (`"   "` é vazio).
4. Com o formulário vazio, "X" e "Cancelar" fecham o modal na hora, chamando
   `onFechar` — sem pergunta, sem clique a mais.
5. Com qualquer dado preenchido, "X" e "Cancelar" **não** chamam `onFechar`:
   mostram a confirmação e o formulário continua na tela, com os dados intactos.
6. A confirmação diz em português do dia a dia o que se perde, cita a senha
   provisória quando houver uma preenchida, e não usa jargão técnico.
7. "Continuar preenchendo" é a ação **primária** (a próxima ação óbvia é voltar
   ao formulário), fecha a confirmação e devolve o rodapé normal, sem mexer em
   nenhum campo.
8. "Descartar" chama `onFechar` — é o único caminho que descarta.
9. Enquanto a confirmação está aberta, "Criar estabelecimento" não fica acessível
   ao lado dela: o rodapé mostra uma decisão de cada vez.
10. Durante o envio (`enviando`) nada muda: os dois botões seguem desabilitados e
    a confirmação não aparece.
11. A senha gerada pelo botão "Gerar senha" conta como dado preenchido — é o dado
    que mais dói perder, porque não existe em nenhum outro lugar.
12. Nada de consulta nova, migration nova ou variável de ambiente nova.
13. Nenhum estilo no JSX; só classes do `.css` com tokens `--gm-*`.
14. Suíte verde (`npx vitest run`), com teste de unidade da função nova e teste de
    tela cobrindo os critérios 4, 5, 7, 8 e 11.

## 6. Edge cases conhecidos

- **Só o plano trocado**: não confirma (critério 2).
- **Campo preenchido e depois apagado**: volta a ser formulário vazio e fecha
  direto — o dono já desfez o que tinha.
- **Endereço do cardápio derivado do nome** (rodada 45) e **usuário derivado do
  responsável** (rodada 48): o que conta é o valor **digitado**, não a derivação;
  como os dois só existem se o nome de origem existir, e o nome de origem já
  conta, nenhum formulário fica sem confirmação por causa disso.
- **Erro do servidor na tela**: o formulário está preenchido, então confirma —
  esse é justamente o momento em que descartar sem querer dói mais.
- **Confirmação aberta e o dono clica no "X" de novo**: mantém a confirmação, não
  empilha nem fecha.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes do modal —
especialmente no envio (`submeter`) e no fechamento após criar com sucesso, que
não passa por confirmação nenhuma.

## 8. Resultado da review (2026-08-03)

Aprovado sem ressalvas — 14 de 14 critérios em sim. Suíte `npx vitest run`:
199 arquivos / 3471 testes, verde (+16 desta rodada).

Sem desvio do escopo. O único tropeço do build foi de teste: o campo Plano é um
`<select>`, não um grupo de rádios — `selectOptions`, não `click` em `radio`.

**Fica para uma próxima rodada:**

- Fechar por **Esc** e por clique fora do modal, agora que existe para onde ir
  (a mesma confirmação). Hoje nenhum dos dois fecha o modal.
- O mesmo desenho cabe em `AlterarLayoutModal`, que também tem mais de um campo
  — os outros modais do Console são de campo único e não precisam.
