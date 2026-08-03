# CONSOLE-UX 16 — copiar o acesso de um estabelecimento já existente (rodada 42)

## 1. Escopo

Cada card da lista do Console ganha o botão **"Copiar acesso"**, que põe na área de
transferência uma mensagem pronta para o dono mandar ao cliente com **nome do
estabelecimento, plano e endereço de entrada** — sem usuário, sem senha e sem valor.

## 2. Fora de escopo

- **Usuário do responsável.** Ele mora em `public.users`, tabela sem o ramo
  `OR is_super_admin()` na RLS; lê-lo do Console exigiria RPC `SECURITY DEFINER` nova, ou
  seja, mudança de schema em produção — pendência aberta na rodada 41, decisão do dono.
- Senha, ou qualquer forma de recuperá-la/redefini-la pelo Console.
- Qualquer valor financeiro no texto copiado (mensalidade é fatura, não é acesso — a
  mesma régua que o cartão da rodada 11 já aplica).
- Migration, RPC nova, coluna nova, consulta nova na tela.
- Mexer no cartão de primeiro acesso da criação (CONSOLE-UX 11) ou no texto de
  `montarMensagemPrimeiroAcesso`.
- Comprar/apontar domínio ou subdomínio por estabelecimento (item com custo, do dono).

## 3. Origem e decisões que este item honra

- Backlog **F022** (Console da plataforma), 🔴 Critical, bloqueia venda.
- Ledger `specs/_loop.md`, rodada 41: "próximo item recomendado — copiar o endereço de
  acesso de um estabelecimento existente, sem usuário e sem senha".
- Decisão 017 (white-label): nenhum domínio, marca ou nome de cliente cravado no código;
  o endereço sai do `slug` do tenant ou do próprio navegador.
- Decisão 018: estilo no `ConsolePage.css`, com tokens.
- CLAUDE.md, segurança: senha não circula por área de transferência nem por histórico de
  conversa — a mensagem apenas lembra que ela é a definida no cadastro e pede canal
  separado (texto já existente e já testado).

## 4. Verdade de produção que o endereço precisa respeitar

O login monta o e-mail do Auth como `${username}@${slug}.local`, e o slug vem do
**subdomínio** (`emailDoLogin` → `slugDoSubdominio` → `resolverSlugTenant`). Dois estados:

- **Sem `VITE_ROOT_DOMAIN`** (hoje, em produção): o front cai no fallback `gastromundi` e
  a Edge Function de provisionamento faz o mesmo gate (`TENANT_ROOT_DOMAIN` desligado ⇒
  namespace `gastromundi`). Logo, **a porta compartilhada de hoje autentica qualquer
  tenant** — o endereço correto é a origem do próprio navegador, exatamente o que o cartão
  da rodada 11 já entrega.
- **Com `VITE_ROOT_DOMAIN`**: cada estabelecimento entra pelo seu subdomínio, e a origem
  do navegador do dono (que pode ser o host dedicado do Console) seria o endereço errado.
  Aí o endereço é `https://<slug>.<root>`.

## 5. Arquivos afetados

- `src/lib/tenantSlug.js` — função pura nova `urlDeAcessoDoTenant(slug, opcoes)`.
- `src/lib/tenantSlug.test.js` — testes da função nova.
- `src/pages/console/ConsolePage.jsx` — botão, cópia e estados por card.
- `src/pages/console/ConsolePage.css` — estilo do botão e do bloco de cópia manual.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

Nenhum arquivo de `supabase/`. Nenhuma mudança em `src/lib/console.js`.

## 6. Critérios de aceite

1. `urlDeAcessoDoTenant` é pura, exportada de `src/lib/tenantSlug.js`, e nasce com teste.
2. Sem domínio raiz configurado, devolve a origem recebida (a porta de hoje), qualquer que
   seja o slug — inclusive tenant sem slug.
3. Com domínio raiz configurado e slug válido, devolve `https://<slug>.<root>`.
4. Com domínio raiz configurado e slug ausente/inválido, devolve `null` — não existe
   endereço afirmável, e endereço errado é pior do que atalho ausente.
5. Com `null`, o botão **não é renderizado** naquele card.
6. O texto copiado traz nome, plano e endereço, **nunca** usuário, senha ou valor.
7. O texto sai de `montarMensagemPrimeiroAcesso` (reuso, sem alterar a função), com
   `usuario` ausente — campo ausente some da mensagem, comportamento já testado.
8. O botão é irmão dos outros botões laterais do card (não aninhado no botão do card),
   com `aria-label` que nomeia o estabelecimento e ícone distinto dos vizinhos do mesmo
   card (nota, etiqueta, recibo, seta, paleta, peça).
9. Sucesso da cópia tem retorno visível **no card clicado**, e só nele, via `role="status"`.
10. Falha da área de transferência (contexto não seguro, permissão negada) não finge que
    copiou: mostra o texto para copiar à mão, naquele card.
11. Copiar em outro card limpa o retorno do anterior — nunca dois "Copiado!" na tela.
12. Sem `console.log`, sem `TODO`, sem estilo inline, sem cor fora dos tokens, sem domínio
    cravado no código, sem consulta nova e sem migration.
13. Rodadas 1 a 15 do Console seguem verdes.

## 7. Edge cases conhecidos

- Tenant anterior à 20260740 (`slug` null): hoje (sem domínio raiz) o botão aparece com a
  porta compartilhada; com domínio raiz ligado, some.
- Plano sem rótulo no catálogo (`planos` vazio ou leitura falhou): a linha do plano some
  da mensagem em vez de virar "undefined".
- `navigator.clipboard` inexistente (jsdom sem mock, navegador antigo): mesmo caminho da
  permissão negada — texto manual, sem quebrar a tela.
- Lista por partes (rodada 40): o botão pertence ao card, então segue o bloco visível.
- Renderização no servidor / `window` ausente: a origem vira string vazia, e o cálculo do
  endereço não pode estourar.

## 8. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem `TODO` pendente, sem `console.log`
esquecido, sem migration nova e sem regressão nas rodadas 1 a 15 do Console.

---

## 9. Resultado da review (rodada 42)

Aprovado sem ressalvas — 13 de 13 critérios em sim. Suíte `npx vitest run`: 199 arquivos /
3334 testes, verde (4 testes novos em `tenantSlug.test.js`, 7 em `ConsolePage.test.jsx`).

Evidências dos critérios que não são visíveis no diff:

- 6 e 7: teste "não copia usuário, senha nem valor" lê o texto entregue à área de
  transferência e reprova `Usuário:`, `R$` e o valor da mensalidade do fixture.
- 9 e 11: o estado guarda o **id** do card copiado, não um booleano — com booleano todos os
  cards diriam "Copiado!" juntos. O teste "copiar outro estabelecimento move o retorno de
  lugar" prova que só existe um aviso na tela e que ele está no card certo.
- 10: com `writeText` recusando, a tela mostra o texto num campo somente-leitura e **não**
  mostra "Copiado!".

Corrigido durante a review: só a asserção de um teste meu — `toHaveValue` não aceita
matcher assimétrico (`expect.stringContaining`), o valor do campo tem que ser lido direto.

Ficou de fora, para quando o dono decidir: o **usuário do responsável** na mensagem, que
depende da RPC `SECURITY DEFINER` sobre `public.users` (pendência aberta na rodada 41).
