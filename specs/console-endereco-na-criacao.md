# CONSOLE-UX 19 — escolher o endereço do estabelecimento na hora de criar

## 1. Escopo

O formulário "Novo estabelecimento" ganha o campo **Link do cardápio** (o
`slug`): ele nasce preenchido a partir do nome, mostra em tempo real o
endereço exato que o cliente vai receber, avisa quando o endereço já está
ocupado ou é reservado pelo sistema — com um clique para usar o livre mais
próximo — e vai no corpo do provisionamento, que a Edge Function já aceita e
o Console nunca mandava.

Hoje o dono digita o nome, cria, e só **depois** descobre no cartão de
primeiro acesso qual endereço o banco derivou. Se o endereço já existia ou
era reservado, a RPC renomeia em silêncio (`bardoze` → `bardoze2`,
`console` → `console2`) e ninguém é avisado.

## 2. Fora de escopo

- Mudar o `slug` de um estabelecimento **já criado**. A RLS de `tenants` só
  tem policy de SELECT (rodada 43) e o `slug` é o rótulo do subdomínio e do
  namespace de e-mail do Auth — renomear depois exige RPC nova e migration.
- Qualquer migration, RPC nova ou mudança na Edge Function. O corpo já
  aceita `slug` (`supabase/functions/_shared/validacaoProvisionamento.ts`,
  linha 165) e a RPC já resolve colisão e rótulo reservado.
- Permitir hífen no endereço. `slugify_tenant` (20260741) apaga **todo**
  caractere que não seja `[a-z0-9]`; o campo mostra exatamente o que o
  servidor vai gravar, e não promete o que ele não guarda.
- Pôr o endereço do cardápio na mensagem copiada (pendência de decisão da
  rodada 44) e pôr o usuário do responsável no cartão (pendência da 41).
- Verificar disponibilidade no servidor com consulta nova. O Console já tem
  todos os slugs em memória (`listarEstabelecimentos` traz `slug`).

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 19.
- Recomendação registrada no ledger `specs/_loop.md` ao fim da rodada 44.
- Decisão 017 (white-label): o endereço é do tenant, escolhido por tenant.
- Decisão 018 / ADR-007: estilo em `.css`, tokens `--gm-*`, nada no JSX.
- Migration 20260803 (`slug_reservado`) e 20260741 (`slugify_tenant`): o
  cliente **espelha** essas regras para prevenir; o banco continua sendo a
  autoridade, com CHECK constraint e laço de unicidade.
- Princípio nº 1: prevenção de erro > mensagem de erro. O endereço ocupado
  é barrado antes do envio, com a alternativa livre a um clique.

## 4. Arquivos afetados

- `src/lib/console.js` — `MAX_SLUG`, `SLUGS_RESERVADOS`, `normalizarSlug`,
  `sugerirSlugLivre`; `validarNovoEstabelecimento` passa a receber os slugs
  em uso; `provisionarEstabelecimento` passa a mandar `slug`.
- `src/lib/console.test.js` — testes das funções puras novas.
- `src/components/console/NovoEstabelecimentoModal.jsx` — campo, prévia,
  erro e botão de sugestão.
- `src/components/console/NovoEstabelecimentoModal.css` — estilo do botão
  de sugestão e da prévia.
- `src/components/console/NovoEstabelecimentoModal.test.jsx` — testes de
  componente.
- `src/pages/console/ConsolePage.jsx` — passa `slugsEmUso` ao modal.

## 5. Critérios de aceite

1. `normalizarSlug` espelha `slugify_tenant`/`normalizarSlug` da borda:
   trim, minúsculas, acento removido (NFD), tudo que não é `[a-z0-9]`
   apagado, corte em 40 caracteres (`MAX_SLUG`). `"Bar do Zé"` → `"bardoze"`.
2. `SLUGS_RESERVADOS` contém exatamente os rótulos de `slug_reservado`
   (migration 20260803), e `sugerirSlugLivre` devolve o primeiro sufixo
   numérico livre pela mesma regra do laço da RPC (`base`, `base2`, `base3`…),
   pulando reservados e ocupados.
3. O campo "Link do cardápio" nasce preenchido com `normalizarSlug(nome)` e
   acompanha o nome **enquanto o dono não editar o campo**; depois de editado,
   para de seguir o nome.
4. O que o dono digita no campo é normalizado na hora (maiúscula, acento,
   espaço e hífen somem enquanto digita) — o valor visível é sempre o que o
   servidor vai gravar.
5. Abaixo do campo, a prévia mostra o endereço público real vindo de
   `urlDoCardapioPublico(slug, window.location.hostname)` — a mesma função da
   lista e do cartão de primeiro acesso, nunca uma URL montada à mão.
6. Endereço já usado por outro estabelecimento bloqueia o envio com mensagem
   em português dizendo qual é o livre mais próximo.
7. Endereço reservado pelo sistema (`console`, `www`, `app`, …) bloqueia o
   envio com a mesma clareza — hoje ele passa e vira `console2` em silêncio.
8. A mensagem de conflito vem acompanhada de um botão que aplica a sugestão
   em um clique.
9. Nome sem nenhuma letra ou número (`"@@@"`) resulta em endereço vazio, e o
   envio é bloqueado com "Informe o endereço do cardápio" — em vez de o banco
   cair no fallback `tenant`.
10. `provisionarEstabelecimento` envia `slug` no corpo apenas quando há valor,
    já normalizado; nenhum outro campo do corpo muda.
11. O rótulo do endereço físico deixa de ser "Endereço (opcional)" e passa a
    "Endereço da loja (opcional)", para não haver dois campos "Endereço" na
    mesma tela — a dica de delivery continua igual.
12. `ConsolePage` passa os slugs já existentes ao modal sem consulta nova ao
    banco.
13. Nenhum estilo novo no JSX: só classes em `NovoEstabelecimentoModal.css`,
    com tokens `--gm-*`.
14. Nenhum segredo, URL de API ou domínio de cliente hardcodado.
15. Suíte verde (`npx vitest run`), com teste de unidade para as funções puras
    novas e teste de componente cobrindo os critérios 3, 4, 6, 7 e 8.
16. Nenhum `console.log` e nenhum `TODO` sem justificativa.

## 6. Edge cases conhecidos

- **Nome só com acento/símbolo** (`"Café ☕"`) → `cafe`; `"@@@"` → vazio,
  bloqueado pelo critério 9.
- **Nome com mais de 40 caracteres úteis**: corta em 40, e a prévia mostra o
  cortado — nada de o dono descobrir o corte depois de criar.
- **Colisão em cadeia**: se `bardoze` e `bardoze2` existem, a sugestão é
  `bardoze3`.
- **Sugestão que cai em reservado**: `console` ocupado leva a `console2`,
  que não é reservado — o laço trata os dois critérios juntos, como a RPC.
- **Lista de tenants ainda carregando**: `slugsEmUso` vazio significa "não
  sei de nenhum ocupado"; o campo não inventa conflito, e o banco continua
  sendo a barreira final.
- **Corrida real** (dois estabelecimentos criados ao mesmo tempo com o mesmo
  endereço): o cliente não consegue impedir; a RPC resolve com sufixo, como
  hoje. O ganho desta rodada é o caso comum, não a corrida.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes do Console.

## 8. Resultado da review (2026-08-03)

✅ Aprovado sem ressalvas — 16 de 16 critérios em "sim".
Suíte: `npx vitest run` — 199 arquivos, 3388 testes, verde.

Evidências principais:

- 1, 2 — `src/lib/console.js:607-670`; a lista de `SLUGS_RESERVADOS` bate rótulo
  a rótulo com `supabase/migrations/20260803_reservar_slug_console.sql`.
- 3, 4 — `NovoEstabelecimentoModal.jsx:82` (estado derivado) e `:185-192`
  (normaliza a cada tecla).
- 5 — `:83`, via `urlDoCardapioPublico` de `src/lib/tenantSlug.js`.
- 6, 7, 8, 9 — `console.js:692-703` e `NovoEstabelecimentoModal.jsx:194-221`.
- 10 — `console.js:806-821`: `...(slug ? { slug } : {})`, nada mais mudou no corpo.
- 11 — `NovoEstabelecimentoModal.jsx:224`.
- 12 — `ConsolePage.jsx:1151`, sobre `tenants` (lista completa, não a filtrada
  pela busca) — sem consulta nova; `listarEstabelecimentos` já traz `slug` no
  `select` nomeado (`console.js:40`).
- 13 — só classes; `.nem-sugestao` em `NovoEstabelecimentoModal.css:134-146`,
  com tokens `--gm-*`.
- 14 — nenhum literal de domínio ou chave; o domínio vem de `ROOT_DOMAIN`.
- 15 — `console.test.js` (funções puras), `NovoEstabelecimentoModal.test.jsx`
  (9 testes de tela) e `provisionamentoValidacao.test.js` (deriva com a borda).
- 16 — nenhum `console.log` nem `TODO` marcador nos arquivos tocados.

Corrigido durante a review:

- `src/lib/console.js:642` — a faixa de acentos estava escrita com os
  caracteres combinantes literais em vez de `̀-ͯ`. Funcionava, mas
  punha caractere invisível no fonte e fugia da convenção das outras duas
  ocorrências do arquivo (linhas 164 e 602).
- `src/lib/provisionamentoValidacao.test.js` — o `base` do teste "os mínimos são
  os mesmos que o Console já cobrava" não tinha `slug`, que passou a ser
  obrigatório; ficou vermelho até ganhar `slug: "casacoffee"`.

Fora desta rodada, para uma próxima: mudar o endereço de um estabelecimento já
criado (precisa de RPC nova, porque a RLS de `tenants` só tem SELECT).
