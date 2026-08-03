# CONSOLE-UX (rodada 1) — a situação da cobrança na lista de estabelecimentos

## 1. Escopo

Mostrar a situação da assinatura (Ativo / Vence em X dias / Em atraso / Bloqueado /
Cancelado / Sem assinatura) em cada card da aba **Estabelecimentos** do Console,
reaproveitando `resumirPlataforma` — a mesma fonte de verdade da aba "Planos e
assinaturas" — e extraindo o selo de status para um componente compartilhado, para
que as duas abas falem exatamente a mesma língua.

## 2. Fora de escopo

- Reordenar a lista por urgência (ela continua na ordem que vem do banco).
- Busca/filtro de estabelecimento.
- Trocar a ação principal do card (hoje o clique abre "trocar plano").
- Qualquer ação de cobrança na aba Estabelecimentos — renovar continua na aba
  "Planos e assinaturas".
- CSS dos modais sem arquivo próprio (`AlterarLayoutModal`,
  `ConfirmarRenovacaoModal`, `DefinirMensalidadeModal`) — dívida de decisão 018
  registrada para uma rodada futura.
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Não existe item catalogado no backlog para isto — o `/aprender` cadastra depois.
- CLAUDE.md, princípio nº 1: "Estados sempre visíveis" e "nada de jargão técnico na
  tela". A situação de cobrança é o estado que decide a próxima ação do dono e hoje
  está escondido atrás de uma aba.
- Decisão 018 (CSS separado do JSX): o componente novo nasce com `.css` co-localizado.
- Decisão 017 (white-label): nada de nome/cor/regra de cliente específico — o selo é
  derivado de dado, e as cores saem dos tokens `--gm-*`.

## 4. Arquivos afetados

- `src/components/console/SeloStatus.jsx` — **novo**. Extraído de `PlanosDashboard.jsx`,
  mesmo texto e mesma semântica.
- `src/components/console/SeloStatus.css` — **novo**. Migra o bloco `.pdash__selo*`.
- `src/components/console/PlanosDashboard.jsx` — passa a importar o selo compartilhado
  e perde a cópia local.
- `src/components/console/PlanosDashboard.css` — perde o bloco `.pdash__selo*`.
- `src/pages/console/ConsolePage.jsx` — calcula as linhas com `resumirPlataforma` e
  mostra o selo + o vencimento no card.
- `src/pages/console/ConsolePage.css` — estilo das linhas novas do card.
- `src/components/console/SeloStatus.test.jsx` — **novo**.
- `src/pages/console/ConsolePage.test.jsx` — testes novos da situação no card.

## 5. Critérios de aceite

1. Cada card da aba Estabelecimentos mostra um selo com a situação da assinatura
   daquele tenant, com o mesmo texto que a aba "Planos e assinaturas" já usa.
2. O status exibido vem de `resumirPlataforma` (recálculo por data), não do campo
   `status` cru da tabela — as duas abas nunca discordam para o mesmo tenant.
3. Tenant sem linha de assinatura mostra "Sem assinatura" — não some, não fica em
   branco e não é tratado como erro.
4. Quando `listarAssinaturas` falha (`erroAssinaturas`), o card **não** inventa um
   selo: mostra que a situação não pôde ser carregada.
5. Assinatura ativa mostra também a data de vencimento em português (dd/mm/aaaa),
   formatada sem passar por `new Date()` (não pode deslocar o dia no fuso -03).
6. O selo é um componente único importado pelas duas telas; `PlanosDashboard.jsx` não
   tem mais definição local de `SeloStatus`, e a classe `pdash__selo` deixa de existir.
7. Nenhuma cor hardcodada nova: o CSS do selo usa os tokens `--gm-*` já usados hoje.
8. Nenhuma consulta nova ao banco — o dado já é carregado por `carregar()`.
9. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- Lista de assinaturas vazia por erro de rede/RLS (critério 4) contra lista vazia
  legítima (base nova, critério 3) — são coisas diferentes na tela.
- `data_vencimento` nula ou fora do formato `YYYY-MM-DD`.
- Vencimento hoje (`dias === 0`) e vencido (`dias` negativo).
- Nome de estabelecimento longo: o selo não pode empurrar o nome para fora do card.
- Assinatura cancelada: não é recalculada por data (espelha o SQL).

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão na aba "Planos e assinaturas".

---

## Resultado da review (2026-08-02)

Aprovado sem ressalvas — 9 de 9 critérios em sim, `npx vitest run` em 198 arquivos
e 3134 testes, sem rodada de correção.

- (1)(2) `ConsolePage.jsx` calcula `situacaoPorTenant` com `resumirPlataforma` e
  renderiza `<SeloStatus>` no card; teste com vencimento relativo (`emDias(3)`)
  prova que o status é recalculado pela data, não lido do campo em cache.
- (3) tenant fora da lista de assinaturas cai em `sem_assinatura` — teste próprio.
- (4) `erroAssinaturas` troca o selo por "Situação indisponível"; o teste também
  garante que nem "Ativo" nem "Sem assinatura" aparecem nesse caso.
- (5) `formatarVencimento` casa `YYYY-MM-DD` por regex, sem `new Date()`.
- (6) `grep -rn "pdash__selo" src/` não retorna nada.
- (7) só tokens `--gm-*`; o único hex do arquivo (`#f59e0b`) veio migrado de
  `PlanosDashboard.css`, não é novo.
- (8) nenhuma chamada nova ao Supabase.

Não verificado no navegador: o Console exige login de super-admin contra o
Supabase de produção, então subir o dev server não provaria nada aqui. A
cobertura é por teste de componente sobre a marcação real.

## Fica para uma próxima rodada

- Ordenar a lista por urgência (quem precisa de ação primeiro).
- Busca/filtro de estabelecimento, para quando a base crescer.
- CSS co-localizado dos três modais que ainda não têm (`AlterarLayoutModal`,
  `ConfirmarRenovacaoModal`, `DefinirMensalidadeModal`) — decisão 018.
- O `#f59e0b` de `SeloStatus.css` virar `--gm-warn`, junto com a limpeza geral
  do F018.
