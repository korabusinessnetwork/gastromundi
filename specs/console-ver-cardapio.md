# CONSOLE-UX 15 — prévia do cardápio de cada estabelecimento no Console (rodada 41)

## 0. Reescopo desta rodada

O item recomendado na rodada 40 era "copiar os dados de acesso de um estabelecimento já
existente". Ele não passa: a mensagem de primeiro acesso precisa do **usuário do
responsável**, que mora em `public.users` — tabela **sem** o ramo `OR is_super_admin()` na
RLS. Ler isso do Console exigiria uma RPC `SECURITY DEFINER` nova, ou seja, mudança de
schema em produção — parada obrigatória do `/review`, decisão do dono. Fica registrado
como pendência.

No lugar entra o primeiro item da fila do dono (`memory/` — fila de próximas features):
**preview clicável do cardápio do cliente**, aqui na superfície onde ele mais serve — o
Console, onde o dono acabou de criar ou de cobrar o estabelecimento e quer ver a loja de pé.

## 1. Escopo

Cada card da lista de estabelecimentos ganha um atalho **"Ver cardápio"** que abre, em
aba nova, a vitrine pública daquele estabelecimento. O endereço sai do `slug` do próprio
tenant — que a lista passa a ler junto dos campos que já lê.

## 2. Fora de escopo

- Qualquer migration, RPC nova ou coluna nova. `tenants.slug` já existe (20260740) e a
  policy de `tenants` já tem o ramo de super-admin.
- Editar ou definir o slug pelo Console.
- Comprar/apontar domínio ou subdomínio por estabelecimento (item separado da fila do
  dono, com custo — decisão do dono).
- Prévia embutida (iframe/modal) dentro do Console.
- Mexer na `CardapioPage`, na `DeliveryView` ou no botão de prévia que o estabelecimento
  já tem dentro do próprio app.
- Copiar dados de acesso de estabelecimento existente (bloqueado, ver seção 0).

## 3. Origem e decisões que este item honra

- Backlog **F022** (Console da plataforma), 🔴 Critical, bloqueia venda.
- Fila de próximas features do dono, item 1: preview clicável do cardápio do cliente.
- Decisão 017 (white-label): o endereço vem do slug do tenant, nada cravado no código.
- Decisão 018: estilo no `ConsolePage.css`, com tokens.
- Precedência de endereçamento já fixada em `slugDaVitrine` (`tenantSlug.js`):
  **subdomínio > query > fallback**.

## 4. Arquivos afetados

- `src/lib/tenantSlug.js` — função pura nova `urlDoCardapioPublico(slug, hostname)`.
- `src/lib/tenantSlug.test.js` — testes da função nova.
- `src/lib/console.js` — `listarEstabelecimentos` passa a selecionar `slug` (campos
  explícitos, nunca `select *`).
- `src/pages/console/ConsolePage.jsx` — o atalho no card.
- `src/pages/console/ConsolePage.css` — estilo do atalho, com tokens.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

Nenhum arquivo de `supabase/`.

## 5. Critérios de aceite

1. `urlDoCardapioPublico` é pura, exportada de `src/lib/tenantSlug.js`, e nasce com teste.
2. Fora do host do Console, devolve `/cardapio?loja=<slug>` com o slug percent-encoded —
   o caminho que funciona hoje, em domínio compartilhado.
3. No host dedicado do Console (`ehConsoleHost()` verdadeiro), devolve o endereço
   publicado do estabelecimento, `https://<slug>.<VITE_ROOT_DOMAIN>/cardapio`: ali o
   rótulo "console" seria lido como reivindicação de subdomínio e venceria a query,
   abrindo a loja errada.
4. Slug ausente, vazio ou fora do formato DNS devolve `null`.
5. Com `null`, o atalho **não é renderizado** — nada de link quebrado na tela
   (prevenção de erro > mensagem de erro).
6. O atalho é uma âncora de verdade (`<a href>`), irmã dos outros botões laterais do card
   (não aninhada dentro do botão do card — HTML inválido), abre em aba nova com
   `rel="noopener noreferrer"` e tem rótulo acessível com o nome do estabelecimento.
7. O ícone do atalho é distinto dos que já aparecem no mesmo card (nota, etiqueta, recibo,
   paleta, peça) — dois ícones iguais lado a lado fazem clicar no errado (aprendizado da
   rodada 39).
8. `listarEstabelecimentos` continua com campos explícitos, agora incluindo `slug`.
9. Sem `console.log`, sem `TODO`, sem estilo inline, sem cor fora dos tokens, sem URL de
   domínio cravada no código.
10. Nenhuma consulta nova na `ConsolePage`; nenhuma migration.
11. Rodadas 1 a 14 do Console seguem verdes.

## 6. Edge cases conhecidos

- Tenant antigo, criado antes da migration 20260740: `slug` vem `null` → sem atalho.
- Slug com maiúsculas ou espaços no banco: normalizado para minúsculas/trim antes de
  validar; o que não formar rótulo DNS vira `null`.
- `VITE_ROOT_DOMAIN` não configurado: `ehConsoleHost()` é falso por definição, então o
  caminho relativo com `?loja=` é sempre o usado — o de hoje em produção.
- Estabelecimento sem delivery no plano: a vitrine pública é quem responde por isso; o
  Console não duplica a regra de plano aqui.
- Lista por partes (rodada 40): o atalho pertence ao card, então segue o bloco visível.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem `TODO` pendente, sem `console.log`
esquecido, sem migration nova e sem regressão nas rodadas 1 a 14 do Console.

---

## 8. Resultado da review (rodada 41)

Aprovado sem ressalvas — 11 de 11 critérios em sim. Suíte `npx vitest run`: 199 arquivos /
3323 testes, verde (5 testes novos em `tenantSlug.test.js`, 6 em `ConsolePage.test.jsx`).

Nada corrigido na review além do próprio teste que mirava o botão de layout pelo `title`
como se fosse nome acessível (ver `memory/learnings.md`).

Um desvio de uma linha, deliberado: a regra responsiva de `ConsolePage.css` que faz os
botões laterais dividirem a linha em tela estreita não listava `.console__preco` (lacuna da
rodada 39). Como o atalho novo entra exatamente nessa regra, os dois nomes foram
adicionados juntos — sem isso, a fileira quebraria no celular.

Ficou para uma próxima rodada: copiar os dados de acesso de um estabelecimento já
existente, bloqueado pela leitura de `public.users` (seção 0) — precisa de decisão do dono
sobre criar a RPC `SECURITY DEFINER`.
