# Roteamento de modelo e effort — GastroMundi

## [1] Propósito

A regra existe para não decidir modelo do zero a cada tarefa, e para não queimar
orçamento em trabalho que não exige o modelo mais caro (`memory/restrictions.md` —
Restrições de Custo, fase de bootstrap).

## [2] Princípio base

Modelo e effort são alavancas independentes: escolher um não define o outro.
Modelo mais novo **não** autoriza baixar o effort em trabalho difícil.
Effort alto em tarefa simples é desperdício; effort baixo em tarefa difícil é bug em produção.

## [3] Tabela de roteamento

| Modelo | Effort | Quando usar | Exemplo real no repo |
|---|---|---|---|
| Opus 5 | `xhigh` | erro silencioso custa dinheiro ou compliance | fiscal: `src/lib/nfce*.js` (16 arquivos), `src/lib/fiscal.js`, `src/lib/validarConfigFiscal.js`; dinheiro e cobrança: `src/lib/console.js`, `src/lib/assinatura.js`, `src/lib/caixaMovimentos.js`; RLS e migrations: `supabase/migrations/`, `src/lib/*SqlGuard.test.js` |
| Sonnet 5 | `high` | default do dia a dia | tela, componente, query, refactor, revisão de PR — `src/pages/console/`, `src/pages/delivery/`, extração de CSS do JSX (decisão 018) |
| Haiku 4.5 | `low` | volume mecânico sem julgamento | seed (`supabase/SEED_*.sql`), boilerplate, doc gerada de spec já aprovada, laboratório de ciclo (`tools/ciclo-lab/`, ADR-010) |

## [4] Teste de decisão

Uma pergunta: **"consigo justificar Opus em uma frase?"** Se não → Sonnet.

- *"Um centavo errado aqui vira imposto errado na NFC-e."* → justifica. Opus `xhigh`.
- *"É o mesmo card da lista, com mais um selo."* → não justifica. Sonnet `high`.

## [5] Parâmetros técnicos

- `xhigh` exige `max_tokens` grande (base 64k) para não truncar no meio de tool calls ou subagentes.
- O effort default da API é `high`; o valor passado sobrescreve.
- `temperature`, `top_p` e `top_k` não são suportados — guie o comportamento pelo prompt.

## [6] Antipadrões

- Rodar tudo em Opus `xhigh` "por segurança".
- Baixar o effort no meio de uma review longa — ela passa a aprovar o que não checou.
- Trocar de modelo sem revisar o prompt.
- Pular o spec: retrabalho custa mais token do que effort alto.

## [7] Revisão

Última revisão: 03/08/2026. Revisar quando sair modelo novo ou quando o custo mensal fugir do esperado.
