# CONSOLE-UX (rodada 4) — registrar pagamento direto do card

## 1. Escopo

Botão **"Registrar pagamento"** no card do estabelecimento, na aba
Estabelecimentos, aparecendo **só em quem precisa de atenção** (bloqueado, em
carência ou vencendo em até 5 dias). Abre o `ConfirmarRenovacaoModal` que já
existe, e ao confirmar mostra a faixa de sucesso e recarrega a lista.

## 2. Fora de escopo

- Novo modal, nova RPC, nova consulta: a renovação já tem tela pronta
  (`ConfirmarRenovacaoModal`) e a única porta de escrita segue sendo a RPC
  `confirmar_renovacao_assinatura`.
- Botão de "Ver pagamentos" (histórico) no card — continua só na aba
  "Planos e assinaturas".
- Alterar mensalidade pelo card.
- Mudar o comportamento da aba "Planos e assinaturas".
- Estabelecimento de cortesia (`valor_mensal = 0`): segue como pendência de
  decisão do dono, esta rodada não mexe na regra do banco.
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Próximo item recomendado da rodada 29 no ledger (`specs/_loop.md`).
  Item de backlog: **F022**.
- CLAUDE.md, princípio nº 1: "a próxima ação deve ser sempre a mais visível".
  Ver que alguém está bloqueado e poder agir são, hoje, duas abas diferentes.
- CLAUDE.md: "confirmar ações destrutivas" — registrar pagamento empurra o
  vencimento, então a confirmação continua sendo o modal, nunca um clique só.
- Decisão 027 / ADR-008: escrita em assinatura só por RPC `SECURITY DEFINER`
  com guarda de super-admin. O front não decide autorização.
- Decisão 018: estilo do botão novo vai para `ConsolePage.css`.

## 4. Arquivos afetados

- `src/pages/console/ConsolePage.jsx` — botão no card, estado do modal e a
  faixa de sucesso do pagamento.
- `src/pages/console/ConsolePage.css` — estilo do botão.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. O card mostra "Registrar pagamento" **apenas** quando a situação é
   `bloqueado`, `carencia`, ou `ativo` vencendo em até 5 dias — a mesma régua
   que já ordena a lista (`precisaAtencao`), sem uma segunda cópia do critério.
2. Estabelecimento em dia, cancelado ou **sem assinatura** não mostra o botão
   (a RPC recusaria `sem_assinatura` com "Assinatura não encontrada", e
   renovar um cancelado o descancelaria em silêncio).
3. Com a leitura das assinaturas quebrada (`erroAssinaturas`), nenhum card
   mostra o botão — não dá para afirmar que alguém deve.
4. O botão abre o `ConfirmarRenovacaoModal` já existente, com `linha`,
   `vencimentoAtual` e `confirmadoPor` preenchidos; nenhum componente novo de
   renovação é criado.
5. Confirmado o pagamento, o modal fecha, a faixa de sucesso diz o nome do
   estabelecimento e o novo vencimento, e a lista recarrega (`carregar()`) —
   o card sai do topo sozinho, sem F5.
6. O botão é irmão dos outros (não aninhado dentro do card clicável, que é um
   `<button>`), com `aria-label` que nomeia o estabelecimento.
7. Nenhuma consulta nova ao banco além do `carregar()` que já existe; nenhuma
   cor hardcodada (tokens `--gm-*`); nenhum estilo inline novo.
8. A busca da rodada 29 e a ordem por urgência da rodada 28 seguem intactas.
9. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- `erroAssinaturas` verdadeiro (critério 3).
- Tenant sem linha de assinatura e tenant cancelado (critério 2).
- Mensalidade zero (cortesia): o modal já trava "Registrar" enquanto o valor
  não é um pagamento de verdade — não regredir isso.
- Cancelar o modal não pode deixar faixa de sucesso nem recarregar a lista.
- Registrar pagamento durante uma busca ativa: o termo buscado permanece.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nas rodadas 1, 2 e 3 (selo de
situação, ordem por urgência e busca intactos).

---

## 8. Resultado da review — 2026-08-02

**Aprovado sem ressalvas — 9 de 9 critérios.** Suíte: `npx vitest run` — 198
arquivos, 3172 testes, verde.

| # | Critério | Evidência |
|---|---|---|
| 1 | Régua única | `podeCobrar = idsPrecisamAtencao.has(t.id) && …` em `ConsolePage.jsx` — o mesmo `Set` que ordena a lista, derivado de `precisaAtencao` |
| 2 | Em dia, cancelado e sem assinatura sem botão | cancelado nunca entra em `precisamAtencao`; `sem_assinatura` excluído explicitamente; três testes |
| 3 | `erroAssinaturas` desliga o botão | `idsPrecisamAtencao` já nasce vazio nesse caso; teste "nenhum card oferece cobrar" |
| 4 | Reusa o `ConfirmarRenovacaoModal` | nenhum componente novo no diff; teste do modal preenchido com nome e mensalidade |
| 5 | Sucesso + recarga | `aoPagamentoConfirmado` monta a faixa com o vencimento novo e chama `carregar()`; teste confere a faixa e a releitura |
| 6 | Botão irmão, com `aria-label` | fora do `<button>` do card, `aria-label={`Registrar pagamento de ${t.nome}`}` |
| 7 | Sem consulta nova, sem cor crua, sem inline | `.console__cobrar` usa `color-mix` sobre `--gm-green`; diff auditado |
| 8 | Rodadas 28 e 29 intactas | teste "registrar durante uma busca preserva o termo buscado"; blocos anteriores verdes |
| 9 | Suíte verde, sem `console.log`/`TODO` | diff auditado |

### Fica para uma próxima rodada

- "Ver pagamentos" (histórico) direto do card.
- Alterar mensalidade pelo card — hoje é o caminho de quem está `sem_assinatura`,
  e ele continua só na aba de cobrança.
- CSS co-localizado dos modais do Console.
