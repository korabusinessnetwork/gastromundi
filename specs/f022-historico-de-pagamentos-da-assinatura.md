# F022-HISTORICO — histórico de pagamentos da assinatura e correção de lançamento errado

> Rodada 6 do ciclo · 2026-08-01 · spec do passo 1 (planejar)

## 1. Escopo

No Console da Plataforma, na aba **Planos e assinaturas**, ver o histórico de pagamentos de
cada estabelecimento e **estornar** um pagamento lançado por engano — desfazendo o ciclo que ele
empurrou no vencimento, com motivo obrigatório e sem apagar a linha do histórico.

## 2. Fora de escopo

- **Editar** um pagamento no lugar (valor/método/competência). Corrigir = estornar e registrar de
  novo, que é o caminho que a RPC de renovação já sabe fazer. Um UPDATE parcial precisaria recalcular
  vencimento a partir de um delta e não tem inverso confiável.
- **Desestornar** (desfazer o estorno). Se o estorno foi errado, registra-se o pagamento de novo —
  a competência volta a ficar livre (§5.6).
- Recibo/comprovante em PDF, exportação e anexo de comprovante.
- Histórico visível para o **estabelecimento** (hoje a policy deixa gerente/admin ler o do próprio
  tenant, mas não existe tela; criar essa tela é outro item).
- Qualquer cobrança automática, gateway ou conciliação bancária — continua tudo manual
  (Restrições de Custo, sem provedor pago nesta fase).
- Mexer no bloqueio por assinatura (Fase 5) — o estorno reescreve `data_vencimento` e o
  enforcement existente reage a isso sozinho.

## 3. Origem e decisões que este item honra

- **F022** (`docs/09_BACKLOG/features.md`) — Console do desenvolvedor. Este item é a contrapartida
  do "registrar pagamento da assinatura" entregue na Rodada 2: a escrita existe desde a
  `20260909`, a leitura e o desfazer não existem em lugar nenhum do sistema.
- **S1-2** (`docs/09_BACKLOG/sprint_pre_venda.md`) — Console é bloqueador de pré-venda.
- **ADR-006** — status da assinatura é **derivado** de `data_vencimento + carencia_dias`, nunca de
  coluna mantida por job. O estorno tem de recalcular pelo mesmo caminho
  (`calcular_status_assinatura`), nunca cravar um status.
- **ADR-008 §5 / decisão v2 nº 2** — o super-admin lê cross-tenant só onde a policy tem o ramo
  `OR is_super_admin()`. `assinaturas_pagamentos` **tem** esse ramo desde a
  `20260726_multitenant_fase4_billing_isolamento.sql` (linhas 72-81), então o histórico é leitura
  direta com campos explícitos — **não** se cria RPC para ler, nem se toca em policy.
- **Decisão 027 / `20260909`** — só a plataforma escreve em assinatura. As duas tabelas seguem sem
  política de INSERT/UPDATE/DELETE: por isso o estorno é obrigatoriamente uma RPC
  `SECURITY DEFINER`, e não um `.update()` do cliente (que voltaria 0 linhas em silêncio).
- **`memory/patterns.md` → "Conferência textual de SQL"** — RPC cuja forma é a garantia de segurança
  nasce com o autoteste `DO $conf$` **e** o `*SqlGuard.test.js`. Serão 10 guards.
- **Princípio nº 1 (intuitividade)** e **decisão 018 (CSS fora do JSX)**.

## 4. Arquivos afetados

**Criados**

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260913_estorno_pagamento_assinatura.sql` | colunas de estorno, índice único parcial, RPC `estornar_pagamento_assinatura`, `DO $conf$` |
| `src/lib/estornoPagamentoSqlGuard.test.js` | guard textual da migração (10º do projeto) |
| `src/components/console/HistoricoPagamentosModal.jsx` | modal do histórico + ação de estornar |
| `src/components/console/HistoricoPagamentosModal.css` | estilo (decisão 018), só tokens `--gm-*` |
| `src/components/console/HistoricoPagamentosModal.test.jsx` | teste de componente |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `src/lib/assinatura.js` | `listarPagamentosAssinatura`, `estornarPagamentoAssinatura`, e a pura `resumirPagamentos` |
| `src/lib/assinatura.test.js` | testes da função pura nova |
| `src/components/console/PlanosDashboard.jsx` | botão "Ver pagamentos" na coluna Pagamento |
| `src/components/console/PlanosDashboard.test.jsx` | o botão existe, abre, e não aparece sem assinatura |
| `docs/09_BACKLOG/features.md` | linha do F022 |

## 5. Critérios de aceite

1. **O histórico é leitura direta, com campos explícitos.** `listarPagamentosAssinatura(tenantId)`
   faz `.from("assinaturas_pagamentos").select(<campos nomeados>)` — sem `select *` em tabela de
   billing — e filtra por `tenant_id`. Nenhuma RPC nova de leitura é criada.
2. **A escrita é só pela RPC.** O estorno passa por
   `estornar_pagamento_assinatura(uuid, text, text)`, `SECURITY DEFINER`,
   `SET search_path = public, auth, extensions`, com `IF public.is_super_admin() IS NOT TRUE THEN
   RAISE EXCEPTION … USING ERRCODE = 'insufficient_privilege'` como **primeira** instrução do corpo.
   Nenhuma política de INSERT/UPDATE/DELETE é criada em `assinaturas_pagamentos`.
3. **`REVOKE` antes do `GRANT`.** `REVOKE ALL … FROM PUBLIC, anon;` aparece no arquivo **antes** de
   `GRANT EXECUTE … TO authenticated;` — na ordem inversa o revoke também tira o execute do
   `authenticated`.
4. **Estorno não apaga.** Nenhum `DELETE FROM public.assinaturas_pagamentos` na migração nem no
   cliente. A linha ganha `estornado_em timestamptz`, `estornado_por text` e `estorno_motivo text`;
   quem confirmou, quando, quanto e por qual método continuam legíveis depois do estorno.
5. **Motivo é obrigatório no banco, não só na tela.** `p_motivo` nulo ou com menos de 3 caracteres
   depois do `btrim` é recusado com `USING ERRCODE = 'check_violation'` e frase em português. O
   botão da tela também fica desabilitado enquanto o motivo não for válido (prevenção de erro >
   mensagem de erro).
6. **A competência volta a ficar livre.** O índice único
   `assinaturas_pagamentos_competencia_uidx` passa a ser **parcial**
   (`WHERE estornado_em IS NULL`), mantendo o mesmo nome. Depois de estornar agosto/2026 dá para
   registrar agosto/2026 de novo com o valor certo; sem estornar, continua devolvendo
   `unique_violation`.
7. **O vencimento volta exatamente um ciclo.** A RPC faz
   `data_vencimento = data_vencimento - ciclo_dias` e grava
   `status = public.calcular_status_assinatura(data_vencimento - ciclo_dias, carencia_dias)` —
   nunca um status fixo. Exceção: assinatura `'cancelado'` mantém o status (espelha
   `sincronizar_status_assinatura`).
8. **`ultima_renovacao` não fica mentindo.** Depois do estorno ela vira a data do pagamento válido
   mais recente que sobrou, ou `NULL` se não sobrou nenhum.
9. **Estornar duas vezes não desconta dois ciclos.** A RPC trava a linha da assinatura com
   `FOR UPDATE`, recusa pagamento já estornado com frase própria, e o botão da tela fica
   indisponível para linha já estornada.
10. **Dinheiro em inteiro.** O total do histórico é somado em **centavos inteiros**
    (`Math.round(Number(valor) * 100)` por linha), nunca somando `numeric` em float, e só vira real
    na formatação.
11. **Função pura nasce com teste.** `resumirPagamentos` não faz I/O, ordena do mais recente para o
    mais antigo, separa válidos de estornados, e tem teste em `src/lib/assinatura.test.js`.
12. **Falha de leitura não vira lista vazia.** Se o `select` volta erro, o modal diz que não
    conseguiu carregar e oferece tentar de novo — nunca "nenhum pagamento registrado", que é uma
    afirmação diferente e leva a lançar em duplicidade.
13. **A recusa do banco chega como frase.** O componente exibe `error.message` da RPC; os testes que
    dublam erro copiam frase **e** SQLSTATE verbatim da migração (aprendizado de 2026-08-01).
14. **Sem jargão na tela.** Nada de "estorno de competência", "RPC", "tenant", "rollback",
    "SQL", "MRR". A tela fala "pagamento", "mês pago", "cancelar este pagamento", "quem registrou".
15. **CSS fora do JSX, sem cor crua.** `HistoricoPagamentosModal.css` usa os tokens `--gm-*` do
    design system; nada de marca, nome ou regra de um cliente específico no código (white-label,
    decisão 017).
16. **Migration não roda sozinha em produção.** A entrega avisa que o arquivo precisa ser executado
    no SQL Editor do Supabase e manda a URL do GitHub dele; o `DO $conf$` do fim confere ao vivo a
    assinatura, a guarda, o `search_path`, o `REVOKE` e o índice parcial.
17. **Suíte verde.** `npm test` (é `vitest run`) sem regressão, incluindo os 9 guards já existentes
    — em especial `renovacaoAssinaturaSqlGuard.test.js`, que lê a `20260909` e não pode ser afetado
    por este arquivo novo.

## 6. Edge cases conhecidos

- **Estornar um pagamento que não é o último.** Cada confirmação somou exatamente um `ciclo_dias`,
  então subtrair um ciclo continua batendo. O que não tem inverso confiável é `ciclo_dias` ter
  mudado entre a confirmação e o estorno — a tela diz "o vencimento volta um ciclo de cobrança"
  antes do clique, em vez de prometer uma data que o banco pode não reproduzir.
- **Assinatura sem linha** (`sem_assinatura`) e **cancelada**: sem assinatura não há histórico nem
  ciclo para desfazer — célula sem botão, como já acontece com "Registrar pagamento". Cancelada
  **tem** histórico e pode ser estornada (o dinheiro entrou errado antes do cancelamento), mas o
  status continua `'cancelado'`.
- **Histórico vazio** (nunca pagou): estado vazio explicando, não tabela sem linha.
- **Duplo clique / duas abas**: o `FOR UPDATE` serializa e a segunda tentativa cai na recusa de "já
  estornado".
- **Pagamento de outro estabelecimento**: a RPC valida que o `p_pagamento_id` existe e usa o
  `tenant_id` **da própria linha**, nunca um tenant vindo do cliente.
- **`valor` legado `0` ou negativo** gravado antes da validação da `20260909`: aparece formatado
  como está, e pode ser estornado normalmente.
- **`confirmado_por` nulo** (linha antiga, ou renovação feita antes da tela): mostra "não registrado"
  em vez de vazio.
- **Fuso**: `competencia` e as datas são `date`/`timestamptz` — a competência é formatada pela
  string (`mês/ano`), sem passar por `new Date()`, mesmo motivo do `formatarData` já existente.

## 7. Definição de "aprovado sem ressalvas"

Todos os 17 critérios em **sim** com evidência de arquivo e linha, `npm test` verde, sem `TODO`
pendente, sem `console.log` esquecido, sem `select *` em tabela de billing e sem regressão nos
fluxos já existentes do Console (registrar pagamento, definir mensalidade, alterar plano/layout).

## 8. Decisão que fica pendente do dono (não bloqueia esta rodada)

Continua em aberto desde a Rodada 2: **estabelecimento em cortesia** (`valor_mensal = 0`) não
consegue renovar, porque a RPC recusa `p_valor <= 0`. Opções: (a) a RPC aceitar zero com motivo
obrigatório, (b) cortesia virar campo próprio (`isento_ate`), (c) deixar como está. Este item não
muda isso.

## 9. Resultado da review — 2026-08-01

**Aprovado sem ressalvas.** Os 17 critérios em **sim**; `npm test` (`vitest run`) verde:
186 arquivos, 2908 testes. Nenhum `console.log`, nenhum `TODO`, nenhum `select *` em tabela de
billing, nenhuma política de escrita criada.

Corrigido durante a rodada (tudo no guard, nenhum defeito de produto): `estornoPagamentoSqlGuard`
acusava o próprio `DO $conf$` em três proibições textuais, casava o `FOR UPDATE` dos locks com a
regex de policy, parava o recorte de `ultima_renovacao` no `max(p.confirmado_em)` e falhava a
âncora `"}\n"` por causa do CRLF dos fontes. Registrado em `memory/learnings.md` e
`memory/patterns.md` → "Conferência textual de SQL".

**Fica para uma próxima rodada** (fora do escopo desta, §2): histórico visível para o próprio
estabelecimento (a policy já permite, falta a tela), recibo/comprovante e anexo, e o desestorno.

**Pendência operacional:** `20260913_estorno_pagamento_assinatura.sql` precisa ser executado à mão
no SQL Editor do Supabase — até lá o botão "Cancelar este pagamento" recusa com
`function ... does not exist`.
