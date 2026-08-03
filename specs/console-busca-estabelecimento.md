# CONSOLE-UX (rodada 3) — achar um estabelecimento pelo nome

## 1. Escopo

Campo de busca por nome na aba **Estabelecimentos** do Console: o dono digita
parte do nome e a lista filtra na hora, sem acento e sem caixa atrapalharem.
Com nada encontrado, a tela diz o que foi buscado e oferece limpar a busca.

## 2. Fora de escopo

- Filtro por situação, por plano ou por layout (só nome nesta rodada).
- Busca no servidor / paginação — a lista já vem inteira do banco.
- Busca nas abas "Planos e assinaturas" e "Uso e faturamento".
- Guardar o termo buscado entre visitas (URL, localStorage).
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Próximo item recomendado da rodada 28 no ledger (`specs/_loop.md`), já
  antecipado como pendência na rodada 1. Item de backlog: **F022**.
- CLAUDE.md, princípio nº 1: "Estados sempre visíveis" (o vazio de busca é um
  estado, e precisa dizer o que houve) e "rótulos claros em português".
- CLAUDE.md: função pura nova nasce com teste — o filtro sai de
  `src/lib/console.js`, como `ordenarPorUrgencia` na rodada anterior.
- Decisão 018: o estilo do campo vai para `ConsolePage.css`, nada de inline.

## 4. Arquivos afetados

- `src/lib/console.js` — nova função pura `filtrarEstabelecimentos`.
- `src/lib/console.test.js` — testes da função nova.
- `src/pages/console/ConsolePage.jsx` — campo de busca, lista filtrada e o
  estado de "nada encontrado".
- `src/pages/console/ConsolePage.css` — estilo do campo e do vazio de busca.
- `src/pages/console/ConsolePage.test.jsx` — testes de busca na tela.

## 5. Critérios de aceite

1. `filtrarEstabelecimentos` é exportada de `src/lib/console.js`, é pura (não
   faz I/O, não muda o array recebido) e tem teste próprio.
2. A busca ignora caixa e acentos nos dois lados: "cafe" acha "Café Central" e
   "CAFÉ" também.
3. A busca casa com qualquer trecho do nome, não só com o começo.
4. Termo vazio ou só com espaços devolve a lista inteira, na ordem em que veio
   (a ordenação por urgência da rodada 2 continua valendo).
5. O campo aparece na aba Estabelecimentos com rótulo/placeholder em português
   claro, e tem `aria-label` — é um input sem `<label>` visível.
6. Com nada encontrado, a lista some e a tela mostra um vazio que repete o
   termo buscado e traz um botão para limpar a busca; limpar traz a lista de
   volta.
7. Buscando, a legenda de urgência ("N precisam de atenção") reflete o que está
   **na tela** — ou não aparece — em vez de contar quem foi filtrado fora.
8. O estado de base vazia (nenhum estabelecimento cadastrado) continua como
   está hoje, com o botão "Criar o primeiro" — não pode ser confundido com o
   vazio de busca.
9. Nenhuma consulta nova ao banco; nenhuma cor hardcodada (tokens `--gm-*`);
   nenhum estilo inline novo.
10. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- Nome com acento, ç e caixa alta misturada.
- Termo com espaços nas pontas.
- Estabelecimento com `nome` nulo ou vazio (não pode quebrar o filtro).
- Base vazia contra busca sem resultado (critério 8).
- Buscar enquanto a leitura das assinaturas falhou — a busca funciona igual, a
  situação segue "indisponível".

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nas rodadas 1 e 2 (selo de situação e
ordem por urgência intactos).

---

## 8. Resultado da review — 2026-08-02

**Aprovado sem ressalvas — 10 de 10 critérios.** Suíte: `npx vitest run` — 198
arquivos, 3164 testes, verde.

| # | Critério | Evidência |
|---|---|---|
| 1 | `filtrarEstabelecimentos` pura e exportada, com teste | `src/lib/console.js` (após `ordenarPorUrgencia`); 9 testes em `src/lib/console.test.js` |
| 2 | Ignora caixa e acento nos dois lados | `paraBusca` normaliza NFD e corta os combining marks; teste "ignora acento e caixa nos dois lados" |
| 3 | Casa com qualquer trecho | `.includes(alvo)`; teste "casa com qualquer trecho do nome" |
| 4 | Termo vazio devolve a lista inteira na ordem | `if (!alvo) return [...(itens ?? [])]`; testes de termo vazio e de ordem preservada |
| 5 | Campo com `aria-label` e placeholder em português | `.console__busca-campo` em `ConsolePage.jsx` |
| 6 | Vazio de busca com o termo e botão de limpar | ternário `tenantsVisiveis.length === 0`; teste "sem resultado, mostra o vazio de busca" |
| 7 | Legenda conta só quem está na tela | `quantosPrecisamAtencao` deriva de `tenantsVisiveis`; teste "a legenda de urgência conta só quem está na tela" |
| 8 | Vazio de base segue distinto | ternário externo `tenants.length === 0` intacto; teste "base vazia mostra o vazio de cadastro" |
| 9 | Sem consulta nova, sem cor hardcodada, sem inline | filtro é `useMemo` local; CSS novo só com tokens `--gm-*` |
| 10 | Suíte verde, sem `console.log`/`TODO` novo | diff auditado |

### Fica para uma próxima rodada

- Filtro por situação (só os bloqueados, só os vencendo) e por plano.
- Ação de cobrança direto do card (hoje o card só troca o plano).
- CSS co-localizado dos três modais do Console.
