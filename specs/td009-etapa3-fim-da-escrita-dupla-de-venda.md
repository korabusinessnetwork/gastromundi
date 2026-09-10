# TD009 etapa 3 — encerrar a escrita dupla de venda

**Item:** TD009 (`docs/09_BACKLOG/tech-debt.md`)
**Data:** 2026-09-10
**Rodada:** 64

## Escopo

Parar de gravar a venda em `sales`. As tabelas relacionais (`vendas`, `venda_itens`,
`venda_pagamentos`) passam a ser a fonte de verdade da escrita, como já são da leitura desde a
etapa 2. `sales` fica como arquivo histórico: ninguém escreve, e a leitura só encosta nele no
fallback de resiliência para dados anteriores ao corte.

Três caminhos escrevem venda hoje e todos entram no escopo:

1. `addSale` no `AppContext.jsx`, a venda fechada online.
2. `reenviarVendaOffline` no `AppContext.jsx`, o replay da venda que fechou sem internet.
3. `cancelarVendaFechada` no `AppContext.jsx`, que hoje marca `data.cancelada` no blob e **apaga**
   as linhas relacionais. Sem o blob, apagar as linhas faria a venda cancelada sumir do banco
   inteiro, sem trilha de auditoria. Por isso o cancelamento precisa virar marca em `vendas`, e
   isso exige migration.

## Fora de escopo

- **Não** apagar a tabela `sales` nem os dados dela. Ela vira arquivo, e apagar arquivo histórico
  é decisão do dono, não da etapa.
- **Não** transformar a cascata da venda em uma RPC transacional única. É a alternativa 2 do
  ADR-013, continua desejável e continua adiada.
- **Não** mexer no backfill `20260708`. Ele cobre o passado e segue como ação manual pendente do
  TD009.
- **Não** mudar o contrato de leitura: `montarVendaLegada` continua devolvendo o shape legado, e
  nenhuma tela precisa ser reescrita.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/20260920_vendas_cancelamento.sql` | novo: colunas de cancelamento em `vendas` |
| `src/lib/vendas.js` | `persistirVendaNormalizada` passa a informar se a venda já existia; `montarVendaLegada` carrega o cancelamento |
| `src/context/AppContext.jsx` | `addSale`, `reenviarVendaOffline`, `cancelarVendaFechada`, e a query de `vendas` no bootstrap |
| `src/lib/vendas.test.js` e testes do contexto | cobertura do caminho único |
| `docs/09_BACKLOG/tech-debt.md` | TD009 marcado resolvido, com a ordem de deploy atualizada |
| `docs/08_DECISOES/adr-013.md` | pendência 6 (idempotência do reenvio de venda) atualizada |

## Solução

### 1. Migration: o cancelamento vira coluna

`vendas` ganha `cancelada boolean not null default false`, `motivo_cancelamento text`,
`cancelada_por text` e `cancelada_em timestamptz`. Nenhuma coluna nova é obrigatória, então a
migration não quebra nada que já existe e o `default false` classifica todo o histórico como não
cancelado, que é o que ele é.

O cancelamento passa a ser **marca**, não remoção. As linhas de item e pagamento continuam onde
estão, porque elas são a trilha de auditoria que hoje só existe dentro do blob.

### 2. `addSale`: a gravação relacional deixa de ser fire-and-forget

`persistirVendaNormalizada` nasceu com o contrato "nunca lança, nunca bloqueia", porque `sales` era
a fonte de verdade e a gravação relacional era backup. Invertida a fonte, o contrato precisa
inverter junto: quem chama agora espera pelo resultado e decide a partir dele.

A função continua não lançando, ela devolve `{ ok, falhas, jaExistia }`. `addSale` lê esse retorno:

- **Cabeçalho falhou:** a venda não existe. Mesmo tratamento que o `sales.insert` recebia hoje: se
  é erro de rede, a venda entra na fila offline e a UI segue; se é erro definitivo, desfaz o
  otimista e lança, para o Saldo do Dia não somar dinheiro que não foi gravado.
- **Cabeçalho gravou e uma filha falhou:** a venda **existe** e está incompleta. Aqui não se lança
  e não se desfaz: mandar o operador refazer a venda duplicaria a receita. Registra como
  inconsistência (`reportarFalha` mais evento `venda.dualwrite.falhou`, que muda de nome para
  `venda.gravacao.incompleta`) e devolve sucesso, que é o que de fato aconteceu com o dinheiro.

Essa assimetria é deliberada e é a consequência de não ter transação única. O ADR-013 já a
descreve na seção de consequências negativas.

### 3. `reenviarVendaOffline`: idempotência de verdade

Sai o `upsert` em `sales`, entra `persistirVendaNormalizada`. Ela já é idempotente no cabeçalho:
violação de unicidade em `vendas` significa "esta venda já subiu", e as filhas não são reinseridas
justamente porque não têm chave natural.

O que faltava era usar essa informação. Com `jaExistia` no retorno, o replay deixa de reemitir
`venda.finalizada` quando a venda já estava gravada. Isso fecha a pendência 6 do ADR-013: o
`upsert` protegia a linha, o evento não estava protegido, e agora está.

### 4. `cancelarVendaFechada`: marcar em vez de apagar

`update` em `vendas` marcando as quatro colunas novas, com `.select("id")` para detectar as zero
linhas que o PostgREST devolve como sucesso quando a RLS filtra tudo. As linhas de `venda_itens` e
`venda_pagamentos` **param de ser apagadas**. Os lançamentos financeiros da venda continuam sendo
removidos, porque receita cancelada não é receita.

Se a migration ainda não foi aplicada, o `update` volta com `42703` (coluna inexistente). Nesse
caso o cancelamento **falha com mensagem clara** dizendo que a migration está pendente, em vez de
fingir sucesso. Fingir aqui seria pior que o erro: o operador acharia que cancelou, e a venda
continuaria somando no relatório. O caminho antigo não serve de fallback, porque a venda nova nem
existe mais em `sales` para receber a marca no blob.

### 5. Leitura: o cancelamento volta no shape legado

A query do bootstrap passa a selecionar as colunas novas, e `montarVendaLegada` devolve
`cancelada`, `motivoCancelamento`, `canceladaPor` e `canceladaEm`. As telas já filtram
`s.cancelada` (Sidebar, FinanceiroView, PDVView, RelatorioView), então elas passam a funcionar
para vendas canceladas vindas do banco, e não só para a que acabou de ser cancelada na sessão.
Hoje esse filtro é letra morta depois de um F5, porque a venda cancelada some da leitura relacional
junto com as linhas apagadas.

O fallback em `sales` continua existindo para o caso de a leitura relacional falhar. Ele cobre o
período anterior ao corte, e não é caminho de escrita.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhuma escrita em `sales` no `AppContext.jsx` (`insert`, `update`, `upsert`, `delete`) | `grep` por `from("sales")` mostra só a leitura de fallback do bootstrap |
| 2 | `addSale` grava a venda pelas tabelas relacionais e devolve erro quando o cabeçalho falha | teste com cabeçalho em erro definitivo: desfaz o otimista e lança |
| 3 | `addSale` com erro de rede no cabeçalho enfileira `insert_venda` e devolve `{ error: null, offline: true }` | teste |
| 4 | Falha só em filha não desfaz a venda, e registra a inconsistência | teste conferindo que devolve sucesso e chama o `onFalha` |
| 5 | `reenviarVendaOffline` não reemite `venda.finalizada` quando a venda já existia | teste com violação de unicidade no cabeçalho |
| 6 | `cancelarVendaFechada` marca `vendas` e não apaga `venda_itens`/`venda_pagamentos` | teste conferindo o `update` e a ausência dos `delete` |
| 7 | Cancelamento com a coluna ausente (`42703`) devolve erro explicando a migration pendente | teste |
| 8 | `montarVendaLegada` carrega o cancelamento | teste da função pura |
| 9 | Migration com RLS já coberta pela política existente de `vendas`, sem `SECURITY DEFINER` novo, e idempotente (`ADD COLUMN IF NOT EXISTS`) | leitura do SQL |
| 10 | TD009 marcado resolvido com a ordem de deploy atualizada, e a pendência 6 do ADR-013 atualizada | leitura dos docs |
| 11 | `npm test` verde, sem teste removido para fazer a suíte passar | rodar a suíte e comparar a contagem |

## Casos de borda

- **Venda fechada offline e cancelada antes do dreno:** a venda ainda está na fila, não em `vendas`.
  O cancelamento não encontra a linha e devolve `no_rows_updated`. Comportamento igual ao de hoje
  com `sales`, e fora do escopo desta etapa.
- **Clique duplo em finalizar:** violação de unicidade no cabeçalho, tratada como sucesso
  idempotente, sem duplicar filhas e sem duplicar evento.
- **Migration aplicada mas frontend antigo ainda no ar:** o frontend antigo escreve em `sales` e
  apaga as linhas relacionais. Nada quebra, só volta ao comportamento anterior. A ordem correta é
  migration primeiro, deploy depois, e ela vai escrita na pendência.
- **Venda cancelada aparecendo em relatório:** as telas filtram `cancelada` no cliente. Com as
  linhas preservadas, a venda cancelada agora chega na leitura, então o filtro precisa estar de
  fato funcionando, e é o que o critério 8 garante ponta a ponta.

## Aprovado sem ressalvas quando

Os onze critérios estiverem em sim, com a suíte verde e a migration entregue com a URL do GitHub na
pendência do dono, incluindo a ordem de deploy.

---

## Revisão (2026-09-10) — aprovado sem ressalvas

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| 1 | Nenhum caminho de escrita toca em `sales` | sim | `grep -rn 'from("sales")' src/` fora de teste devolve uma linha só, `AppContext.jsx:387`, que é `select` no fallback do bootstrap. Também assertado dos dois lados de teste: `addSale.test.jsx` ("nenhuma escrita em sales") e `vendaCancelamento.test.jsx` ("o reenvio não escreve em sales") |
| 2 | `addSale` propaga erro quando o cabeçalho não grava | sim | teste "erro DURO (RLS/constraint) desfaz o otimista" e "erro duro não derruba vendas que já estavam no estado" |
| 3 | Erro de rede enfileira `insert_venda` e devolve `{ error: null, offline: true }` | sim | teste "queda de REDE mantém a venda no estado e enfileira para reenvio", que também confere que `reportarFalha` não é chamado (fila é caminho previsto, não inconsistência) |
| 4 | Falha só em filha não desfaz, mas registra a inconsistência | sim | teste "falha SÓ em filha não desfaz a venda", conferindo `reportarFalha` e o evento `venda.gravacao.incompleta` |
| 5 | `reenviarVendaOffline` não reemite `venda.finalizada` para venda que já existia | sim | `vendaCancelamento.test.jsx`, os dois lados: `jaExistia: true` emite zero, `jaExistia: false` emite exatamente um |
| 6 | `cancelarVendaFechada` marca `vendas` e preserva as filhas | sim | teste do payload do `update` e teste conferindo que os `delete` não incluem `venda_itens`, `venda_pagamentos` nem `vendas`, e incluem `lancamentos` |
| 7 | Coluna ausente (`42703`) devolve erro explicando a migration | sim | teste conferindo `migration_pendente`, a mensagem citando `20260920_vendas_cancelamento`, a chamada a `reportarInconsistencia` e o estado local intocado |
| 8 | `montarVendaLegada` carrega o cancelamento | sim | dois testes em `vendas.test.js`: venda cancelada volta com os quatro campos, venda normal continua com o shape legado idêntico ao de antes |
| 9 | Migration idempotente, RLS já coberta, sem `SECURITY DEFINER` novo | sim | `ADD COLUMN IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`; zero ocorrências de `CREATE POLICY` e de `SECURITY DEFINER` no arquivo |
| 10 | TD009 resolvido com ordem de deploy, pendência 6 do ADR-013 atualizada | sim | `docs/09_BACKLOG/tech-debt.md` (linha da tabela, seção TD009 reescrita com a etapa 3 e a migration nova no passo 3 da ordem de deploy) e `docs/08_DECISOES/adr-013.md` (pendência 6 e a linha `insert_venda` da tabela de idempotência) |
| 11 | Suíte verde, sem teste removido | sim | 230 arquivos / 4082 testes, contra a base de 229 / 4067. As diferenças são só somas: `addSale.test.jsx` foi de 5 para 9 testes com os cinco títulos originais preservados, `vendas.test.js` de 31 para 33, e `AppContext.vendaCancelamento.test.jsx` nasceu com 9 |

**Duas coisas que a revisão mudou durante a construção, e por quê:**

O teste "erro duro não derruba vendas que já estavam no estado" usava `23505` como erro duro. Com a
etapa 3, `23505` no cabeçalho virou **sucesso idempotente** (é o clique duplo), então o teste passou a
descrever o oposto do que o código faz. Trocado por `23514`, violação de constraint de check, que
continua sendo definitivo.

O contrato de `persistirVendaNormalizada` mudou de fire-and-forget para retorno estruturado, o que
quebrou os mocks antigos de `addSale.test.jsx` (resolviam `undefined`) e o helper que controlava a
gravação pelo `insert` em `sales`, tabela que não é mais escrita. O arquivo foi reescrito em volta de
um helper `comGravacaoDeVenda` que devolve `{ ok, jaExistia, cabecalhoGravado, falhas }` e chama o
`onFalha` como a função real chama.

**Resíduo declarado (não é esquecimento):** `fechamentos` continua blob JSONB. O TD009 citava as duas
tabelas, mas a escrita dupla, que é o que esta etapa encerra, só existia em `sales`. Normalizar o
fechamento de caixa é trabalho próprio e não tem escrita dupla envolvida.

**Pendência do dono:** a migration `20260920_vendas_cancelamento.sql` precisa ser aplicada **antes**
do deploy do frontend. Registrada em `.full-auto/PENDENCIAS-DO-MATHEUS.md` com a URL do GitHub.
