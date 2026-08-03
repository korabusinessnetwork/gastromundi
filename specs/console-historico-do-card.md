# CONSOLE-UX (rodada 5) — ver pagamentos direto do card

## 1. Escopo

Botão **"Pagamentos"** no card do estabelecimento, na aba Estabelecimentos,
abrindo o `HistoricoPagamentosModal` que já existe. Fecha o ciclo aberto na
rodada 4: hoje dá para cobrar sem trocar de aba, mas conferir o que já foi
lançado — e cancelar um lançamento errado — ainda obriga a ir para "Planos e
assinaturas".

## 2. Fora de escopo

- Novo modal, nova RPC, nova consulta na `ConsolePage`: o histórico já tem tela
  pronta e lê por conta própria (`listarPagamentosAssinatura`), e o estorno já
  passa pela RPC `estornar_pagamento_assinatura` (20260913).
- Mudar o `HistoricoPagamentosModal` por dentro (colunas, estorno, motivo).
- Mudar o comportamento da aba "Planos e assinaturas".
- Resumo de pagamentos no próprio card (total pago, último pagamento) — o card
  continua mostrando situação e vencimento, nada mais.
- Estabelecimento de cortesia: segue como pendência de decisão do dono.
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Próximo item recomendado da rodada 30 no ledger (`specs/_loop.md`).
  Item de backlog: **F022**.
- CLAUDE.md, princípio nº 1: "a próxima ação deve ser sempre a mais visível".
  Depois de registrar um pagamento pelo card, conferir o que foi lançado é a
  pergunta seguinte — e hoje ela troca de tela.
- Decisão 027 / ADR-008: escrita em assinatura só por RPC `SECURITY DEFINER`
  com guarda de super-admin. Esta rodada não cria escrita nenhuma.
- Decisão 018: estilo do botão novo vai para `ConsolePage.css`.

## 4. Arquivos afetados

- `src/pages/console/ConsolePage.jsx` — botão no card e estado do modal.
- `src/pages/console/ConsolePage.css` — estilo do botão.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. O card mostra "Pagamentos" **apenas** quando existe assinatura para mostrar:
   qualquer situação diferente de `sem_assinatura` — inclusive `cancelado`, que
   tem histórico e é justamente onde se confere o que foi pago antes.
2. Com a leitura das assinaturas quebrada (`erroAssinaturas`), nenhum card
   mostra o botão: sem `linha` não há `tenantId` para o modal consultar.
3. O botão abre o `HistoricoPagamentosModal` já existente, com `linha` e
   `confirmadoPor` preenchidos; nenhum componente novo é criado.
4. Estornado um pagamento, a lista recarrega (`carregar()`) — o vencimento e a
   situação do card mudam sozinhos, sem F5. O modal permanece aberto, como já
   faz na aba de cobrança.
5. O botão é irmão dos outros (não aninhado dentro do card clicável, que é um
   `<button>`), com `aria-label` que nomeia o estabelecimento, e estilo neutro
   como "layout" e "add-ons" — consultar não compete visualmente com "Registrar
   pagamento", que é a ação urgente.
6. Nenhuma consulta nova disparada pela `ConsolePage`; nenhuma cor hardcodada
   (tokens `--gm-*`); nenhum estilo inline novo.
7. A busca (rodada 29), a ordem por urgência (rodada 28) e o botão de cobrar
   (rodada 30) seguem intactos, e os dois botões convivem no mesmo card.
8. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- `erroAssinaturas` verdadeiro (critério 2).
- Tenant `sem_assinatura` (critério 1) e tenant `cancelado` (tem botão).
- Card que mostra cobrar e pagamentos ao mesmo tempo: a linha de botões precisa
  continuar legível no celular (`flex-wrap` já existente).
- Fechar o modal não pode deixar faixa de sucesso nem recarregar a lista.
- Abrir o histórico durante uma busca ativa: o termo buscado permanece.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nas rodadas 1 a 4 (selo de situação,
ordem por urgência, busca e cobrar do card intactos).

---

## 8. Resultado da review — 2026-08-02

**Aprovado sem ressalvas — 8 de 8 critérios.** Suíte: `npx vitest run` — 198
arquivos, 3180 testes, verde.

| # | Critério | Evidência |
|---|---|---|
| 1 | Só onde há assinatura | `temHistorico = !erroAssinaturas && !!situacao && situacao.status !== "sem_assinatura"` em `ConsolePage.jsx`; testes de em dia, sem assinatura e cancelado |
| 2 | `erroAssinaturas` desliga o botão | primeira condição do `temHistorico`; teste "nenhum card oferece o histórico" |
| 3 | Reusa o `HistoricoPagamentosModal` | nenhum componente novo no diff; teste confere `listarPagamentosAssinatura("t2")` — o tenant clicado, não o primeiro |
| 4 | Estorno recarrega e o modal fica | `onEstornado={() => carregar()}`; teste checa releitura e o modal ainda aberto |
| 5 | Botão irmão, neutro, com `aria-label` | fora do `<button>` do card; `.console__pagamentos` entra nas regras neutras de `.console__layout`/`.console__addons` |
| 6 | Sem consulta nova na página, sem cor crua, sem inline | a `ConsolePage` não ganhou leitura nenhuma — quem lê é o modal; diff auditado |
| 7 | Rodadas 28, 29 e 30 intactas | teste "abrir o histórico durante uma busca preserva o termo"; os dois botões convivem no mesmo card |
| 8 | Suíte verde, sem `console.log`/`TODO` | diff auditado |

### Fica para uma próxima rodada

- Resumo de pagamentos no próprio card (último pagamento, total recebido).
- CSS co-localizado dos modais do Console.
- Filtro por situação/plano na lista.
