# CONSOLE-UX 27 — quando a conexão volta, o Console se atualiza sozinho

## 1. Escopo

Fechar a ponta que a rodada 52 deixou: hoje, quando a internet volta, a faixa de
"sem conexão" some e os botões destravam, mas **os dados na tela continuam sendo
os de antes da queda** — a lista, os vencimentos e os painéis podem estar
minutos ou horas atrasados, e nada na tela diz isso. Duas partes:

1. **Recarga silenciosa na volta da conexão.** O `carregar()` do
   `ConsolePage` ganha um modo que **não** acende o estado de carregando (hoje
   ele apaga a tela inteira e recomeça do "carregando…"), para a lista continuar
   de pé enquanto os dados são buscados de novo. Ele dispara na **transição**
   offline → online, nunca na primeira montagem.
2. **A faixa conta o que está acontecendo.** Enquanto estiver offline ela avisa
   que o que está na tela é do que já tinha carregado; na volta ela vira, na cor
   de sucesso, "Conexão de volta — atualizando os dados" e depois "Dados
   atualizados" antes de sumir sozinha. Se a recarga falhar, a faixa diz isso e
   oferece um botão de tentar de novo, em vez de sumir fingindo que deu certo.

## 2. Fora de escopo

- **Fila de escrita offline** (F021): o que falhou durante a queda continua
  falhando; esta rodada só devolve dados frescos.
- Recarregar por tempo (polling) ou por `realtime` — só na volta da conexão.
- Recarga automática em qualquer tela fora do Console.
- Refazer as leituras de dentro dos modais abertos.
- Mexer nas quatro funções de leitura (`listarEstabelecimentos`,
  `listarPlanos`, `listarAssinaturas`, `listarAddonsPorTenant`).

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 27.
- Deixado escrito em `specs/console-sem-internet.md`, seção "Fora, para uma
  próxima rodada", e recomendado no `specs/_loop.md` ao fim da rodada 52.
- `CLAUDE.md`, Princípio nº 1: "Estados sempre visíveis: carregando, erro, vazio
  e sucesso com feedback imediato e humano" — e o inverso, que é o problema
  aqui: dado velho apresentado como se fosse atual não é estado nenhum.
- `memory/patterns.md`, "Tela que trava sozinha quando a internet cai" (rodada
  52): esta rodada acrescenta o quinto momento do ciclo, a volta.
- Reusa `src/hooks/useStatusRede.js`; nada de hook novo de rede.

## 4. Arquivos afetados

- `src/pages/console/ConsolePage.jsx` — o modo silencioso do `carregar`, o
  efeito da transição e os estados da faixa.
- `src/pages/console/ConsolePage.css` — as variações da faixa (atualizando,
  atualizado, falhou).
- `src/pages/console/ConsolePage.test.jsx` — testes de tela da volta.

## 5. Critérios de aceite

1. `carregar()` aceita um modo **silencioso** que não muda o estado de
   carregando: a lista, os filtros e os painéis que já estavam na tela
   continuam visíveis do começo ao fim da recarga.
2. A recarga dispara **só na transição** offline → online. Abrir o Console já
   online carrega **uma vez** só (nada de duas chamadas na montagem).
3. Dois eventos `online` seguidos não disparam duas recargas sobrepostas.
4. Terminada a recarga com sucesso, a tela mostra os **dados novos** (uma
   assinatura que mudou durante a queda aparece atualizada) sem recarregar a
   página.
5. Durante a recarga a faixa diz que está atualizando; ao terminar, diz que
   atualizou e **some sozinha** — sem exigir clique.
6. Se a recarga falhar (voltou o sinal, mas o servidor não responde), a faixa
   **não some**: diz que não conseguiu atualizar e oferece "Tentar de novo",
   que refaz a recarga silenciosa.
7. Nenhum dado da tela é apagado por uma recarga que falhou — o que estava
   visível continua visível.
8. Enquanto offline, a faixa diz que o que está na tela pode estar
   desatualizado (hoje ela só diz que não dá para salvar).
9. Se o componente for desmontado no meio da recarga, nada de `setState` depois
   do desmonte (sem aviso de atualização em componente desmontado no teste).
10. As variações da faixa usam tokens `--gm-*` (`--gm-green` para a volta,
    `--gm-warn` para a queda, `--gm-red` para a falha), CSS separado do JSX,
    sem cor cravada — o arquivo usa `color-mix` sobre o token, não `rgba()`.
11. Nada de marca, nome ou regra de um estabelecimento específico (decisão 017).
12. Nada de migration, RPC nova, variável de ambiente nova ou dependência nova.
13. Suíte verde (`npx vitest run`), com teste de tela cobrindo os critérios 2,
    4, 5, 6 e 7.

## 6. Edge cases conhecidos

- **Modal aberto quando a conexão volta**: a recarga é da lista de trás; o modal
  não pode fechar sozinho nem perder o que já foi digitado.
- **Conexão que volta e cai de novo no meio da recarga**: a faixa termina no
  estado de offline, não no de "atualizado".
- **`online` disparado sem que a internet tenha voltado de verdade** (Wi-Fi sem
  saída): é o caso do critério 6 — a recarga falha e a faixa diz.
- **Falha só nas leituras secundárias** (planos/assinaturas/add-ons devolvem
  lista vazia com erro): o comportamento já existente de "a tela diz que não
  sabe" continua valendo; a recarga não pode transformar isso em zero.
- **Desmonte no meio** (o dono sai do Console enquanto atualiza).

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes do Console — em
especial no carregamento inicial, que precisa continuar mostrando o estado de
carregando na primeira vez e continuar tratando a falha da leitura principal.

---

## Resultado da review (rodada 53)

Aprovado sem ressalvas — 13 de 13 critérios. Suíte `npx vitest run`: 201 arquivos /
3524 testes, verde (o `ConsolePage.test.jsx` foi de 138 para 143).

Três correções feitas durante a review:

1. **`onClick={carregar}` virou bomba-relógio.** Três call sites (`Tentar de novo` do bloco
   de falha, o mesmo botão do bloco de cobrança e o `onAtualizado` do `PlanosDashboard`)
   passavam a função direto como handler. Com o parâmetro novo, o evento do clique chegava
   como `silencioso` — objeto, logo verdadeiro —, e a recarga pedida pelo dono deixaria de
   acender o "Carregando…". Trocados por `() => carregar()`.
2. **`setCarregando(false)` no caminho de sucesso rodava também no modo silencioso.** Só
   apaga o estado quem o acendeu, senão uma recarga silenciosa que termine antes da primeira
   carga desligaria o "Carregando…" dela.
3. **Critério 9 não estava coberto de verdade.** A guarda de desmonte existia só no
   `recarregarNaVolta`; o `carregar` seguia escrevendo estado depois do desmonte. A guarda
   subiu para dentro do `carregar` (vale para todos os chamadores), com o `montado.current =
   true` na entrada do efeito — sem ele, o StrictMode deixa o ref falso para sempre.

## Fora, para uma próxima rodada

- Fila de escrita offline (F021) — o que falha sem internet continua falhando.
- A mesma dupla (tradução de erro e faixa de rede, agora com a volta) no PDV e no delivery.
- `.console__sucesso` e `.console__estado--erro` no `ConsolePage.css` ainda usam `rgba()`
  cravado, de antes da convenção de `color-mix` sobre token — fora do escopo desta rodada.
