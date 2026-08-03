# CONSOLE-UX 18 — o endereço do estabelecimento no cartão de primeiro acesso

## 1. Escopo

O cartão que aparece logo depois de criar um estabelecimento passa a falar o
endereço **daquele estabelecimento**, e não o do navegador de quem criou: o
"Endereço de entrada" passa a sair da mesma função pura que a lista já usa
(`urlDeAcessoDoTenant(slug)`), e o cartão ganha uma linha nova com o endereço
do cardápio (`urlDoCardapioPublico(slug)`), clicável, em aba nova.

## 2. Fora de escopo

- Mudar os campos de `montarMensagemPrimeiroAcesso`. O texto copiado continua
  com estabelecimento, plano, endereço de entrada e usuário — o endereço do
  cardápio **não** entra na mensagem nesta rodada (é decisão de produto sobre
  o que o cliente recebe, e o texto atual já foi acordado na rodada 42).
- Qualquer migration, RPC nova ou mudança de RLS.
- Editar nome, endereço ou qualquer campo do estabelecimento pelo Console —
  a RLS de `tenants` só tem policy de SELECT (aprendizado da rodada 43).
- O card da lista, que já resolveu isso nas rodadas 15, 16 e 17.
- Pôr o usuário do responsável em qualquer lugar novo (pendência de decisão
  aberta desde a rodada 41).

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 18.
- Recomendação registrada no ledger `specs/_loop.md` ao fim da rodada 43.
- Decisão 017 (white-label): o endereço vem do tenant, nunca de marca fixa.
- ADR-007 / decisão 018: estilo em `ConsolePage.css`, tokens `--gm-*`.
- Princípio nº 1: prevenção de erro > mensagem de erro — endereço que não se
  pode afirmar não é exibido, em vez de ser exibido errado.

## 4. Arquivos afetados

- `src/pages/console/ConsolePage.jsx` — origem do endereço de entrada e a
  linha nova do cardápio no `<dl className="console__acesso-dados">`.
- `src/pages/console/ConsolePage.css` — estilo do link do cardápio dentro do
  cartão.
- `src/pages/console/ConsolePage.test.jsx` — testes de componente.

Nenhum arquivo de `src/lib/` muda: as duas funções puras já existem, já são
testadas e já tratam slug inválido.

## 5. Critérios de aceite

1. O "Endereço de entrada" do cartão vem de `urlDeAcessoDoTenant(sucesso.slug)`
   — não há mais `window.location.origin` cru alimentando o cartão.
2. Sem `VITE_ROOT_DOMAIN` (produção de hoje), o valor exibido continua sendo a
   origem do navegador: nada muda para quem usa o Console agora.
3. Com domínio raiz ligado e slug utilizável, o valor exibido é
   `https://<slug>.<root>`.
4. Quando `urlDeAcessoDoTenant` devolve `null`, a linha "Endereço de entrada"
   **não** é renderizada, e a mensagem copiada sai sem a linha de endereço —
   nunca com "null", vazio ou o endereço de outro.
5. O cartão mostra uma linha "Endereço do cardápio" com o endereço público
   quando `urlDoCardapioPublico(sucesso.slug)` devolve endereço.
6. Essa linha é um link que abre em aba nova, com `rel="noopener noreferrer"`.
7. Slug ausente ou fora do formato de endereço não gera a linha do cardápio.
8. Nenhuma cor, tamanho ou espaçamento novo no JSX: estilo só em
   `ConsolePage.css`, com tokens `--gm-*`.
9. Nenhum segredo, URL de API ou domínio de cliente hardcodado — o domínio
   raiz continua vindo de `import.meta.env`, lido dentro de `tenantSlug.js`.
10. Nenhuma consulta nova ao banco: o `slug` já vem na resposta da Edge
    Function de provisionamento.
11. Suíte de testes verde (`npx vitest run`), com teste de componente novo
    cobrindo os critérios 4, 5 e 7.
12. Nenhum `console.log` e nenhum `TODO` sem justificativa.

## 6. Edge cases conhecidos

- **Resposta sem `slug`** (deploy antigo da Edge Function, mock de teste):
  sem domínio raiz, o endereço de entrada continua sendo a origem; com
  domínio raiz, some. A linha do cardápio some nos dois casos.
- **Slug com caractere inválido** (`"bar do zé"`): as duas funções puras já
  devolvem `null`; o cartão perde as linhas em vez de gerar link quebrado.
- **Falha da mensalidade** (`mensalidadeFalhou`): o alerta do cartão continua
  onde está e não interfere no endereço.
- **Console em host dedicado** (`console.dominio`): `urlDoCardapioPublico` já
  troca para `https://<slug>.<root>/cardapio` — é o caminho que essa função
  cobre e o cartão apenas o consome.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes do Console.

---

## Resultado da review (rodada 44)

Aprovado sem ressalvas. Suíte: `npx vitest run` — 199 arquivos / 3348 testes verdes
(5 testes novos em `ConsolePage.test.jsx`, que passou de 128 para 133).

Todos os 12 critérios em sim. Nada precisou de correção na auditoria.

Ficou para uma próxima rodada: pôr o endereço do cardápio também na mensagem que o
"Copiar dados de acesso" gera. É decisão de produto (muda o texto que o cliente recebe,
acordado na rodada 42), não trabalho técnico — precisa do aval do dono.
