# Refatoração 5.31: o JSX sem cor hexadecimal (tarefa 5.x)

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T09.

## A mudança

A meta do plano é "cor hexadecimal escrita no JSX: 0" (eram 23 na linha de base, 8 nesta rodada).

- **Dois tokens novos, `--gm-orange` (#f97316) e `--gm-violet` (#8b5cf6)**, em `src/styles/tema.css`,
  na lista de campos que o tenant pode sobrescrever (`TOKENS_PERMITIDOS` de `lib/tema.js`) e na
  tabela de reserva. São tons de apoio de status, fora da marca. Com eles saem o laranja do KPI
  "Itens Cancelados" (era `color="#f97316"` no JSX) e os dois literais que as rodadas 5.19 e 5.18
  tinham deixado no CSS: a seção de Impostos e Configuração Fiscal na grade da Área Admin e o
  débito no Saldo do Dia.
- **Mapa de raio de entrega:** a cor do pino e do círculo sai do `resolverCor("--gm-accent")` que
  já existia em `lib/tema.js`; a reserva deixa de ser um azul solto (`#2563eb`) e passa a ser a do
  próprio tema.
- **Monograma da Kora:** as variantes da haste passam como variável (`--kora-lilas`, novo, e
  `--kora-nevoa`, que já existia) em vez de hexadecimal; o comentário que citava os dois valores
  foi reescrito.
- **Guard novo:** `inlineStyleGuard.test.js` ganhou "nenhum .jsx escreve #rrggbb", com a mesma
  conta da métrica. Conferido nos dois sentidos (um arquivo de teste com `#ff0000` faz falhar).

## Diferenças

Contra o código da 5.30, 209 telas: 0 com diferença e 1 leve (o ruído de fonte de sempre em
Reservas). Os tokens novos têm o mesmo valor dos literais, então o KPI laranja, a seção de
Impostos e o débito no Saldo do Dia ficaram idênticos.

Nota de processo: a primeira captura do "depois" foi disparada num subshell que segurou o
terminal e acabou rodando ao mesmo tempo que uma segunda; as duas fotografavam o mesmo código.
A comparação valida foi a da segunda, completa, com as 209 telas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Cor hexadecimal em JSX: 0 | métrica e o teste novo |
| 2 | Telas iguais (os tokens novos têm o mesmo valor do literal) | `comparar` |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor, para a prova de white-label (T11): a força da
  senha (`utils/crypto.js`) devolve cores hexadecimais para a barra; é JS, fora desta meta, e o
  último nível ("Forte", ciano) não tem token.
