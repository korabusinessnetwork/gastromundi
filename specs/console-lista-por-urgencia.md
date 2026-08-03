# CONSOLE-UX (rodada 2) — quem precisa de ação aparece primeiro

## 1. Escopo

Ordenar a lista da aba **Estabelecimentos** do Console por urgência de cobrança
(quem precisa de ação no topo), com uma legenda acima da lista dizendo quantos
precisam de atenção — para que a ordem seja explicada, e não uma reordenação
silenciosa. A régua de urgência é a mesma que a aba "Planos e assinaturas" já
usa no bloco de alerta.

## 2. Fora de escopo

- Busca/filtro de estabelecimento.
- Agrupar a lista em seções com cabeçalho/divisória.
- Qualquer ação de cobrança na aba Estabelecimentos — renovar continua na aba
  "Planos e assinaturas".
- Trocar a ação principal do card (o clique segue abrindo "trocar plano").
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Continuação da rodada 1 (`specs/console-situacao-na-lista.md`), registrada no
  ledger como próximo item recomendado. Item de backlog: **F022** (Console da
  plataforma) — melhoria dentro do escopo já entregue.
- CLAUDE.md, princípio nº 1: "a próxima ação deve ser sempre a mais visível".
  Com a base crescendo, quem está bloqueado ou vencendo se esconde no meio da
  lista.
- CLAUDE.md: "novas funções puras devem nascer com teste" — a ordenação sai como
  função pura em `src/lib/console.js`.

## 4. Arquivos afetados

- `src/lib/console.js` — nova função pura `ordenarPorUrgencia`.
- `src/lib/console.test.js` (ou o arquivo de teste que já cobre `console.js`) —
  testes da função nova.
- `src/pages/console/ConsolePage.jsx` — usa a ordem e mostra a legenda.
- `src/pages/console/ConsolePage.css` — estilo da legenda.
- `src/pages/console/ConsolePage.test.jsx` — testes de ordem na tela.

## 5. Critérios de aceite

1. `ordenarPorUrgencia` é exportada de `src/lib/console.js`, é pura (não faz
   I/O, não muda os arrays recebidos) e tem teste próprio.
2. A ordem de urgência é: sem assinatura → bloqueado → em carência → ativo
   vencendo em até 5 dias; dentro do mesmo status, menos dias primeiro. É a
   mesma régua do `precisamAtencao` de `resumirPlataforma`.
3. Quem não precisa de atenção (ativo com folga, cancelado) vem depois, **na
   ordem original** da lista — a ordenação é estável.
4. A aba Estabelecimentos renderiza os cards nessa ordem.
5. Com pelo menos um precisando de atenção, aparece acima da lista uma legenda
   dizendo quantos são e que eles vêm primeiro, com concordância correta no
   singular e no plural.
6. Sem ninguém precisando de atenção, nenhuma legenda aparece.
7. Quando a leitura das assinaturas falha (`erroAssinaturas`), a lista mantém a
   ordem original e não mostra legenda — sem dado não se ordena nem se afirma.
8. Nenhuma consulta nova ao banco; nenhuma cor hardcodada nova (tokens `--gm-*`).
9. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- Lista vazia e lista com um só estabelecimento.
- Dois estabelecimentos no mesmo status e com o mesmo número de dias — a ordem
  entre eles não pode ficar aleatória entre renders.
- Tenant presente na lista sem linha de situação correspondente.
- `diasParaVencer` nulo (tenant sem assinatura).
- Cancelado: não é pendência, não sobe para o topo.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão na rodada 1 (o selo de situação segue
correto em cada card).

---

## Resultado da review (2026-08-02)

Aprovado sem ressalvas — 9 de 9 critérios em sim, `npx vitest run` em 198
arquivos e 3148 testes, sem rodada de correção.

- (1) `ordenarPorUrgencia` exportada em `src/lib/console.js`; monta um array
  novo com `map` antes de ordenar, e o teste "é pura" prova que a entrada não
  muda.
- (2) a régua saiu para `precisaAtencao`, usada **pelo `precisamAtencao` de
  `resumirPlataforma` e pela ordenação** — não existe mais uma segunda cópia
  do critério para divergir. Teste dedicado compara as duas saídas.
- (3) empate cai no índice original; teste renderiza a mesma lista invertida
  para provar que a ordem vem da entrada, não do id.
- (4)(5)(6) `ConsolePage.jsx` renderiza `tenantsOrdenados` e a legenda
  singular/plural; teste de tela confere a ordem dos cards pelo DOM.
- (7) `erroAssinaturas` mantém `tenants` na ordem original e zera a legenda —
  sem isso, a base inteira viraria "sem assinatura" e subiria ao topo por
  causa de um erro de rede.
- (8) nenhuma chamada nova ao Supabase; o único estilo novo usa `--gm-muted`.

Não verificado no navegador, pelo mesmo motivo da rodada 1: o Console exige
login de super-admin contra o Supabase de produção. A cobertura é por teste de
componente sobre a marcação real.

## Fica para uma próxima rodada

- Busca/filtro de estabelecimento, para quando a base passar de uma tela.
- Ação de cobrança direto do card (renovar sem trocar de aba).
- CSS co-localizado dos três modais que ainda não têm (decisão 018).
