# CONSOLE-UX 26 — o Console quando a internet cai

## 1. Escopo

O Console para de falar inglês técnico quando a rede falha, e passa a avisar
que está sem conexão antes de deixar o dono tentar. Três partes:

1. **`mensagemDeErroDoConsole(error)`** — função pura em `src/lib/console.js`,
   irmã da `mensagemDeErroDoPedido` do delivery: traduz falha de rede e de
   infraestrutura para uma frase em português, e deixa passar na íntegra as
   recusas escritas de propósito no banco (que já vêm em português e dizem o
   que corrigir).
2. **Os sete modais do Console e a página** usam essa função no lugar do
   `error.message ?? "…"` de hoje — hoje o `??` só cobre mensagem vazia, então
   "TypeError: Failed to fetch" aparece na tela de quem acabou de tentar
   registrar um pagamento.
3. **Faixa de "sem conexão" no topo do Console**, com o `useStatusRede` que já
   existe no projeto, e os botões que escrevem (criar, trocar plano, registrar
   pagamento, add-ons, layout, mensalidade, cancelar pagamento) travados
   enquanto estiver offline, com o motivo à vista — prevenção de erro antes de
   mensagem de erro.

## 2. Fora de escopo

- **Fila offline** de operações do Console para enviar quando a internet voltar
  (é o F021, offline-first, e tem ADR próprio pendente).
- Recarregar sozinho a lista quando a conexão voltar.
- Traduzir erro nas telas **fora do Console** (PDV, admin, estoque) — mesma
  doença, outro inventário.
- Mudar as mensagens que o banco escreve nas RPCs.
- `retry` automático de qualquer chamada.

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 26.
- Recomendação registrada em `specs/_loop.md` ao fim da rodada 51.
- `CLAUDE.md`, Princípio nº 1: "Rótulos claros em português do dia a dia do
  restaurante/varejo — nada de jargão técnico na tela", "Estados sempre
  visíveis: carregando, erro, vazio e sucesso" e "Prevenção de erro > mensagem
  de erro".
- Precedente direto: `mensagemDeErroDoPedido` em `src/lib/delivery.js`, escrita
  pelo mesmo motivo para a vitrine — mesma regra, mesmo formato.
- `src/hooks/useStatusRede.js` já existe (usado só em
  `src/context/AppContext.jsx`); esta rodada reusa, não escreve outro.

## 4. Arquivos afetados

- `src/lib/console.js` — a função pura nova.
- `src/lib/console.test.js` — testes dela.
- Os sete `src/components/console/*Modal.jsx` — trocam o `error.message ??`.
- `src/pages/console/ConsolePage.jsx` e `ConsolePage.css` — a faixa de sem
  conexão e o travamento das ações de escrita.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela do offline.

## 5. Critérios de aceite

1. `mensagemDeErroDoConsole(error)` é **pura**, exportada de `src/lib/console.js`,
   e **nunca devolve string vazia** — na falta de qualquer coisa, uma frase
   genérica em português.
2. Texto com **marca de máquina** vira frase em português: tanto o do navegador
   ("Failed to fetch", "NetworkError…") quanto o do Postgres cru ("new row
   violates row-level security policy", "duplicate key value") **nunca** chegam
   à tela. *(Ajustado na review — ver o registro no fim deste arquivo: o
   critério original separava por presença de `code`, e isso não funciona
   aqui.)*
3. **Recusa escrita de propósito passa na íntegra**, venha da RPC, da Edge
   Function ou do front — é a frase que diz o que corrigir. Isso inclui as que
   reusam ERRCODE de infraestrutura ("Somente a plataforma pode confirmar
   renovação de assinatura." com `42501`, "A competência 08/2026 já foi
   confirmada…" com `23505`) e as que não têm código nenhum ("Sessão expirada.
   Entre novamente.").
4. Quando o navegador está **offline** (`navigator.onLine === false`), a frase
   diz isso — "Sem conexão com a internet" — em vez da genérica de servidor.
5. Cada modal mantém a **sua** frase de fallback específica ("Não foi possível
   alterar o plano.", "Não foi possível registrar o pagamento." etc.): a função
   recebe o texto de fallback do modal e o usa no lugar da genérica.
6. Nenhum dos sete modais nem a página mostram mais `error.message` direto.
7. Com o navegador offline, o Console mostra **uma faixa** no topo dizendo que
   está sem conexão e o que isso significa — que dá para ler o que já carregou,
   mas não dá para salvar nada.
8. Offline, os botões de **escrita própria** ficam desabilitados com o motivo
   visível (não só um `disabled` mudo): criar estabelecimento, add-ons, layout,
   definir mensalidade e registrar pagamento. **Trocar plano** e **cancelar
   pagamento** ficam de fora deste travamento porque não são botões próprios:
   o "trocar plano" é o próprio card, que também é a superfície de leitura da
   lista (travá-lo apagaria a lista inteira e contrariaria o critério 9), e o
   "cancelar pagamento" vive dentro do modal de histórico. Nos dois, quem
   defende é a camada de mensagem — `mensagemDeErroDoConsole` traduz a falha
   quando o salvamento não sai.
9. Offline, o que é **leitura** continua funcionando: a lista já carregada, os
   filtros, a busca e os dashboards não são bloqueados.
10. Quando a conexão volta, a faixa some e os botões voltam sozinhos, sem
    recarregar a página.
11. A faixa usa o CSS separado do JSX com tokens `--gm-*` (decisão 018 /
    ADR-007), sem `style` no JSX e sem cor hardcodada.
12. Nada de marca, nome ou regra de um estabelecimento específico na frase
    (decisão 017, white-label).
13. Nada de migration, RPC nova, variável de ambiente nova ou dependência nova.
14. Suíte verde (`npx vitest run`), com teste da função pura cobrindo os
    critérios 1 a 5 e teste de tela cobrindo os critérios 7, 8 e 10.

## 6. Edge cases conhecidos

- **`navigator` inexistente** (SSR/ambiente de teste sem jsdom): o
  `useStatusRede` já trata assumindo online; a função pura não pode quebrar
  nesse caso.
- **Offline que o navegador não percebe** (Wi-Fi conectado, sem internet):
  `navigator.onLine` continua `true` e a chamada falha — é o critério 2 que
  cobre, e por isso a tradução não pode depender só do `onLine`.
- **Texto cru do Postgres** (a policy de RLS barrando, `PGRST202` de função
  ausente): cai na frase genérica do modal, nunca na íntegra — mesmo quando o
  código do erro é o mesmo de uma recusa deliberada.
- **Conexão que cai no meio de um envio**: o botão já está travado pelo
  `enviando`; ao voltar o erro, a frase é a de rede.
- **A faixa não pode empurrar a lista** de lugar a ponto de o dono clicar no
  botão errado quando ela aparece de repente.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes do Console — em
especial nas mensagens de recusa que o banco escreve (usuário já em uso, plano
inválido, pagamento duplicado), que precisam continuar chegando inteiras à tela.

---

## Resultado da review (rodada 52)

Aprovado sem ressalvas — 14 de 14 critérios. Suíte `npx vitest run`: 201 arquivos /
3519 testes, verde.

Correção feita durante a review: a primeira versão de `mensagemDeErroDoConsole` decidia
pelo código do erro (lista `P0001`/`23514` copiada da vitrine do delivery). Isso quebrou
quatro arquivos de teste já existentes, porque as RPCs de assinatura do Console levantam
recusa em português reusando ERRCODE de infraestrutura — `42501` em "Somente a plataforma
pode confirmar renovação de assinatura." e `23505` em "A competência 08/2026 já foi
confirmada para este estabelecimento.". O discriminador passou a ser a marca do texto, e
a `MARCA_TECNICA` ganhou os padrões do Postgres cru (`violates `, `duplicate key`,
`permission denied`, `could not find`, `schema cache`, `invalid input syntax`,
`does not exist`, `null value in column`) além dos do navegador. Também: o wrapper
grudento nasceu como `.console__cabecalho`, nome já usado no mesmo CSS pelo cabeçalho da
seção — virou `.console__topo-fixo`; e o fundo da faixa trocou `rgba()` cravado por
`color-mix` sobre `--gm-warn`, como o resto do arquivo.

## Fora, para uma próxima rodada

- Fila de escrita offline (F021) — o que falha sem internet continua falhando; esta
  rodada só avisa antes e explica depois.
- Recarregar sozinho quando a conexão volta: a faixa some e os botões destravam, mas os
  dados na tela continuam sendo os de antes da queda.
- A mesma tradução de erro e o mesmo aviso de rede no PDV e no delivery.
