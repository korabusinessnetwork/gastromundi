# CONSOLE-UX 14 — lista de estabelecimentos por partes (rodada 40)

## 1. Escopo

A aba Estabelecimentos passa a mostrar os **primeiros 20** da lista já recortada e
ordenada, com uma linha dizendo **"Mostrando 20 de 47"** e um botão **"Ver mais
estabelecimentos"** que revela o próximo bloco. Hoje ela renderiza todos os tenants de
uma vez — é o único ponto do Console que piora exatamente quando a venda dá certo.

## 2. Fora de escopo

- **Paginação no banco** (`range`/`limit` na consulta). A ordem por urgência, os três
  recortes, a busca e todas as contagens são calculados sobre a base inteira no cliente;
  paginar a leitura faria cada contador mentir ou exigiria uma consulta por recorte. O
  custo de hoje é de renderização, não da consulta única em `tenants`.
- Numeração de páginas, rolagem infinita ou virtualização de lista.
- Levar a quantidade mostrada para a URL — é estado transitório de rolagem, diferente de
  aba, situação, plano e período (rodadas 7 a 9).
- Mexer nos recortes, na busca, na ordem ou nas contagens.
- Mexer nas abas "Planos e assinaturas" e "Uso e faturamento".

## 3. Origem e decisões que este item honra

- Backlog **F022** (Console da plataforma), 🔴 Critical, bloqueia venda.
- Recomendação registrada em `specs/_loop.md` desde a rodada 37.
- Princípio nº 1: o que importa continua na primeira tela — a ordem por urgência garante
  que quem precisa de ação está no primeiro bloco, nunca escondido atrás do botão.
- Decisão 018: o estilo do botão e da linha vai para o CSS, com tokens.

## 4. Arquivos afetados

- `src/pages/console/ConsolePage.jsx` — o corte, a linha de contagem e o botão.
- `src/pages/console/ConsolePage.css` — estilo dos dois, com tokens.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

Nenhum arquivo de `supabase/`. Nenhuma consulta nova.

## 5. Critérios de aceite

1. Com mais de 20 estabelecimentos, só os 20 primeiros da lista visível são renderizados.
2. Existe uma linha acima ou abaixo da lista dizendo quantos estão à mostra e quantos
   existem no recorte atual, em português direto ("Mostrando 20 de 47").
3. O botão revela o próximo bloco de 20 sem consulta nova ao banco e sem perder a posição
   dos que já estavam na tela.
4. Quando não sobra ninguém, o botão e a linha de contagem somem — com 20 ou menos, a tela
   fica exatamente como é hoje.
5. Trocar de recorte (situação, plano) ou digitar na busca **volta ao primeiro bloco** — a
   lista nova não herda a quantidade revelada da anterior.
6. As contagens dos atalhos e a legenda de urgência continuam sobre a base inteira, não
   sobre o que está à mostra.
7. A ordem por urgência é preservada: quem precisa de ação está no primeiro bloco.
8. Nenhuma consulta nova na `ConsolePage`; nenhuma migration.
9. Sem `console.log`, sem `TODO`, sem estilo inline, sem cor fora dos tokens.
10. Rodadas 1 a 13 do Console seguem verdes.

## 6. Edge cases conhecidos

- Exatamente 20: nada de botão nem de linha de contagem.
- Busca que reduz a 3 resultados depois de o dono ter revelado 60: mostra os 3, sem botão.
- Revelar tudo e então limpar a busca: volta ao primeiro bloco (critério 5).
- Falha na leitura das assinaturas: a lista continua na ordem do banco e o corte por partes
  funciona igual — não depende de situação.
- Definir mensalidade, registrar pagamento ou trocar plano recarrega a lista: o dono volta
  ao primeiro bloco, e é o comportamento certo — a ordem por urgência mudou.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem `TODO` pendente, sem `console.log`
esquecido, sem migration nova e sem regressão nas rodadas 1 a 13 do Console.

---

## 8. Resultado da review (rodada 40)

Aprovado sem ressalvas — 10 de 10 critérios em sim. Suíte `npx vitest run`: 199 arquivos /
3312 testes, verde (6 testes novos em `ConsolePage.test.jsx`).

Nada corrigido na review além do próprio teste de urgência, que fabricava o bloqueio pelo
campo `status` em vez da data de vencimento (ver `memory/learnings.md`).

Ficou para uma próxima rodada: nada. Se a base passar de algumas centenas, o próximo passo
natural é paginar a leitura no banco — e aí as contagens precisam virar `count` no servidor.
