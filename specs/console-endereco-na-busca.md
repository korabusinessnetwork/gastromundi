# CONSOLE-UX 17 — o endereço do estabelecimento no card e na busca (rodada 43)

## 1. Escopo

O **endereço** de cada estabelecimento (o `slug`, o rótulo que aparece no link do
cardápio e no acesso) passa a ser **visível no card** da lista do Console e
**encontrável pela busca** — hoje ele só existe escondido dentro do `href` do "Ver
cardápio" e do texto que o "Copiar acesso" põe na área de transferência.

## 2. Fora de escopo

- **Editar o endereço pelo Console.** `tenants` só tem política de SELECT na RLS
  (`tenants_select_auth`); trocar o slug de um tenant exigiria mudança de schema em
  produção — e ainda quebraria links já entregues ao cliente. Decisão do dono, outra rodada.
- Migration, RPC nova, coluna nova, consulta nova (`listarEstabelecimentos` já traz `slug`).
- Buscar por qualquer outro campo (plano, situação, data, valor) — plano e situação já
  têm seus próprios atalhos, e misturá-los na busca deixaria o resultado imprevisível.
- Mexer em `urlDoCardapioPublico`, `urlDeAcessoDoTenant` ou no texto copiado da rodada 42.
- Endereço físico/rua do estabelecimento — esse campo não existe no Console.

## 3. Origem e decisões que este item honra

- Backlog **F022** (Console da plataforma), 🔴 Critical, bloqueia venda.
- Ledger `specs/_loop.md`, rodada 42: "próximo item recomendado — o endereço do
  estabelecimento visível no card e encontrável pela busca; só cliente, sem migration".
- Decisão 017 (white-label): o endereço sai do `slug` do tenant, nada cravado no código.
- Decisão 018: estilo em `ConsolePage.css`, com tokens.
- Princípio nº 1: o dono recebe do cliente uma frase do tipo "meu link é casacoffee" —
  hoje não existe jeito de achar esse estabelecimento por esse dado, e dois cards com
  nome parecido não têm como ser distinguidos na tela.

## 4. Arquivos afetados

- `src/lib/console.js` — `filtrarEstabelecimentos` passa a casar nome **ou** slug.
- `src/lib/console.test.js` — testes da busca por endereço.
- `src/pages/console/ConsolePage.jsx` — linha do endereço no card, rótulo do campo de
  busca e texto do vazio de busca.
- `src/pages/console/ConsolePage.css` — estilo da linha do endereço.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela (e o rótulo novo do campo,
  usado em nove lugares hoje).

Nenhum arquivo de `supabase/`.

## 5. Critérios de aceite

1. `filtrarEstabelecimentos` casa qualquer trecho do **slug**, ignorando caixa e espaço
   nas pontas, sem deixar de casar o nome — a mesma régua `paraBusca` já existente.
2. Termo vazio continua devolvendo a lista inteira, na ordem em que chegou.
3. Item sem slug (`null`, `""`, campo ausente, tenant anterior à 20260740) não quebra a
   busca e simplesmente não casa por endereço; continua casando pelo nome.
4. A função continua **pura**: não muda o array recebido e não devolve a mesma referência.
5. O card mostra o endereço do estabelecimento quando ele existe, em português do dia a
   dia, sem jargão técnico e sem o formato de URL completa.
6. Card de tenant **sem** slug não mostra a linha do endereço nem escreve "null"/vazio.
7. A linha do endereço fica **dentro** do botão do card (é informação do card, não um
   atalho novo) e não introduz botão nem link aninhado.
8. O rótulo e o placeholder do campo de busca dizem que dá para buscar por nome **ou**
   endereço — quem não sabe que pode, não usa.
9. O vazio de busca deixa de mandar conferir só "o nome".
10. Estilo só em `ConsolePage.css`, com tokens (`--gm-muted` e afins) — sem cor
    hardcodada, sem estilo inline.
11. Sem `console.log`, sem `TODO`, sem consulta nova, sem migration.
12. As rodadas 1 a 16 do Console seguem verdes (`npx vitest run`).

## 6. Edge cases conhecidos

- Slug com hífen (`bar-do-ze`): digitar "bar-do" acha; digitar "bar do" (com espaço) não
  acha pelo endereço, mas acha pelo nome — comportamento aceito, não se inventa
  normalização de hífen.
- Termo que casa o nome de um e o endereço de outro: os dois aparecem, sem duplicar
  nenhum (o filtro é um `filter`, não uma concatenação de duas listas).
- Busca combinada com os recortes de situação e de plano (rodadas 6 e 36): a ordem dos
  filtros não muda; o endereço só amplia o que a busca casa.
- Lista por partes (rodada 40): a linha nova é do card, então segue o bloco visível.
- Nome e slug iguais (ex.: "casacoffee"): o item aparece uma vez só.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem `TODO` pendente, sem `console.log`
esquecido, sem migration nova e sem regressão nas rodadas 1 a 16 do Console.

---

## 8. Resultado da review (rodada 43)

Aprovado sem ressalvas — 12 de 12 critérios em sim. Suíte `npx vitest run`: 199 arquivos /
3343 testes, verde (4 testes novos em `console.test.js`, 5 em `ConsolePage.test.jsx`).

Evidências dos critérios que não são visíveis no diff:

- 1 e 3: o filtro é um `filter` com `nome || slug` sobre a mesma `paraBusca` — `slug` nulo
  vira `""`, e `"".includes(termo)` é falso para termo não vazio, então tenant sem
  endereço nunca casa por engano nem estoura.
- Edge case "casa nos dois": teste com um item cujo nome e endereço batem no mesmo termo
  prova que ele aparece **uma vez só** (é filtro, não concatenação de duas listas).
- 7: teste lê `linha.tagName === "SPAN"` e `linha.closest("button")` com a classe do card —
  a informação é do card, não virou atalho aninhado.

Nada precisou ser corrigido durante a review.

Ficou de fora, e não por estilo: **editar o estabelecimento pelo Console** (nome ou
endereço). A RLS de `tenants` só tem policy de SELECT — registrado em
`memory/learnings.md` para não voltar como sugestão inocente numa próxima rodada.
