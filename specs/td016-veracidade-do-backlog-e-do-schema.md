# TD016 — Veracidade do backlog e do `supabase/schema.sql`

> Rodada 10 do ciclo. Item **novo** — não existe em `docs/09_BACKLOG/tech-debt.md` ainda;
> o `/aprender` vai cadastrá-lo como TD016.

## 1. Escopo

Fazer o `docs/09_BACKLOG/` e o `supabase/schema.sql` voltarem a dizer a verdade sobre o
código que existe, e deixar na suíte um guard que quebra quando o `schema.sql` divergir das
migrations de novo.

Três frentes, nesta ordem:

1. **Backlog** — toda afirmação de **ausência** (`Planejado`, `não iniciado`, `Em andamento`,
   linha de sprint em aberto) é conferida contra o código; a que o código desmente é corrigida
   citando o arquivo ou a migration que prova.
2. **`schema.sql`** — o cabeçalho para de afirmar o que não pode sustentar, as tabelas criadas
   depois de 2026-07-04 entram no arquivo, e a camada multi-tenant (`tenants`, `tenant_id`,
   policies por tenant) passa a aparecer.
3. **Guard** — `src/lib/schemaSqlGuard.test.js`, no mesmo formato dos treze `*Guard.test.js`
   que já existem em `src/lib/`: lê `supabase/migrations/*.sql` e `supabase/schema.sql` do
   disco e falha quando uma tabela nova, um `tenant_id` novo ou um `DROP TABLE` não está
   refletido no schema.

## 2. Fora de escopo

- **Regenerar o `schema.sql` via `supabase db dump`.** Exige Docker e a senha do banco — é ação
  do dono, não minha. Esta rodada entrega a melhor reconstrução possível **a partir das
  migrations** e diz isso no cabeçalho, em vez de fingir que é um dump.
- **Fidelidade coluna a coluna das 92 migrations posteriores a 2026-07-04.** O critério é o
  que o guard consegue verificar (tabela existe / `tenant_id` existe / tabela derrubada saiu),
  não uma revisão manual de cada `ALTER TABLE`. Perseguir fidelidade total à mão produziria um
  arquivo que *afirma* precisão que ninguém pode conferir — exatamente o defeito que esta
  rodada existe para consertar.
- **Afirmações de presença** (`Resolvido`, `Entregue`). Um "pronto" falso morre no primeiro
  clique de quem abre a tela; um "falta" falso manda uma rodada inteira reconstruir o que já
  existe. Só o segundo é perigoso o bastante para esta rodada.
- **Qualquer mudança em código de aplicação** (`src/**` fora do guard novo), em migration
  existente, ou migration nova. Nenhuma linha de SQL nova roda em produção por causa desta
  rodada.
- **ADR novo** e **`memory/decisions.md`** — proposta, nunca escrita direta (regra do
  `/aprender`).
- **TD009 etapa 3**, **TD008**, **TD015** e o **fiscal (S1-4/F019)** — o último depende de
  custo e é decisão do dono.

## 3. Origem e decisões que este item honra

- **Não existe item no backlog** para isto. Nasce do `/proximo` da rodada 9, que achou quatro
  afirmações falsas em uma única passada: S1-1 marcado como "o bloqueador nº 1" quando está
  entregue desde as levas `20260723`–`20260726`; S1-2 em aberto com o onboarding do 1º admin já
  funcionando; F022 dizendo faltar configuração fiscal por tenant que vive no `PainelFiscal`
  desde a `20260731`; e o TD009 apontando um defeito do Jarvas já corrigido.
- **`CLAUDE.md`**, "Fonte de verdade": *"Schema do banco em produção: `supabase/schema.sql` +
  `supabase/migrations/`"* e *"Se doc e código conflitarem, a documentação prevalece — e deve
  ser corrigida quando estiver errada."* Esta rodada é a segunda metade dessa frase.
- **`memory/learnings.md`** já registra duas vezes o mesmo prejuízo: nota de backlog envelhecida
  quase mandou refazer trabalho existente, e "entregue"/"não existe" escondem defeito. O
  aprendizado estava escrito e continuou custando — vira guard.
- **Decisão 002** (multi-tenancy por RLS) e **S1-1**: é a camada que o `schema.sql` inteiro
  omite hoje, e a mais cara de se enganar a respeito.

## 4. Arquivos afetados

**Modificados**
- `supabase/schema.sql` — cabeçalho, blocos de tabela faltando, `tenant_id`, mapa de RLS.
- `docs/09_BACKLOG/features.md` — status e nota dos itens que afirmam ausência.
- `docs/09_BACKLOG/tech-debt.md` — idem, mais o cadastro do próprio TD016 (feito pelo
  `/aprender`, não pelo `/build`).
- `docs/09_BACKLOG/sprint_pre_venda.md` — linhas de sprint ainda em aberto que já foram
  entregues (as de S1-1 e S1-2 já foram corrigidas no fecho da rodada 9; conferir o resto).

**Criado**
- `src/lib/schemaSqlGuard.test.js` — guard textual, sem Postgres, no formato dos existentes
  (`readFileSync`/`readdirSync`, comentário de cabeçalho explicando o que precisa continuar
  verdade e por quê).

**Não tocados**: `src/**` fora do guard, `supabase/migrations/**`, `supabase/functions/**`,
`memory/decisions.md`, `docs/08_DECISOES/**`.

## 5. Critérios de aceite

**Backlog**

1. Todo item de `features.md` cujo status afirma ausência (`Planejado`, `não iniciado`,
   `Em andamento`) foi conferido contra o código, e cada um dos que o código desmente teve o
   status corrigido **com o caminho do arquivo ou o número da migration que prova** escrito na
   própria linha. Os itens conferidos são no mínimo F001, F002, F003, F004, F005, F006, F013,
   F016, F018 e F022.
2. Todo item de `tech-debt.md` com status diferente de `Resolvido` (hoje TD008, TD009, TD015)
   foi conferido, e o que já não é verdade foi corrigido citando a evidência.
3. Nenhuma linha de backlog corrigida nesta rodada afirma entrega **sem** apontar o arquivo ou
   a migration correspondente — afirmação sem evidência é o defeito que a rodada combate, e
   trocá-la por outra sem evidência não conserta nada.
4. Item que o código **confirma** estar aberto continua aberto, com a mesma prioridade escrita
   pelo dono. Esta rodada não repriorriza nada.

**`schema.sql`**

5. O cabeçalho não afirma mais ser o "estado REAL de produção" reconstruído do banco: diz o que
   o arquivo é (reconstrução a partir de `supabase/migrations/`), a data, e que as migrations
   ainda **não aplicadas** em produção (`20260912`, `20260913`, `20260914`, `20260915`) estão
   descritas aqui mas podem não existir no banco.
6. `public.tenants` está no arquivo, com as colunas que as migrations criam.
7. Toda tabela que a migration `20260724_multitenant_fase2_isolamento.sql` isola (o `ARRAY` de
   tabelas do bloco `DO`), mais as de `20260743` e `20260813`, tem `tenant_id` no seu bloco
   `CREATE TABLE` dentro do `schema.sql`.
8. Toda tabela criada por alguma migration e **não** derrubada por uma migration posterior
   aparece no `schema.sql`.
9. Nenhuma tabela derrubada por migration (ex.: `public.logs`, `20260706_drop_logs.sql`)
   continua descrita no `schema.sql`.
10. O mapa de convenções de RLS do cabeçalho menciona o isolamento por tenant
    (`tenant_atual_id()` e a policy `RESTRICTIVE`), hoje ausente.

**Guard**

11. `src/lib/schemaSqlGuard.test.js` lê os arquivos do disco (nada de conteúdo colado no teste)
    e falha se qualquer um dos critérios 7, 8 ou 9 deixar de valer.
12. O guard trata `DROP TABLE` — uma tabela criada e depois derrubada não pode fazer o teste
    exigir que ela esteja no schema.
13. O guard tem comentário de cabeçalho no padrão dos outros treze: o que precisa continuar
    verdade, por que quebra se mudar, e a ressalva de que garante **texto**, não o banco.
14. O guard falha de verdade — a mensagem de erro nomeia a tabela ou a coluna que divergiu, não
    um `expect(true)` genérico.

**Sempre válidos (`CLAUDE.md`)**

15. Nenhum segredo, chave, URL de API ou senha no que for escrito. O `schema.sql` já cita o id
    do projeto Supabase no cabeçalho hoje; ele **sai** na reescrita, por não ser necessário para
    nada e ser identificador de infraestrutura.
16. Nenhum `console.log`, nenhum `TODO` sem justificativa.
17. `npx vitest run` verde, sem regressão: a suíte parte de **190 arquivos / 3014 testes**.
18. Nada de marca, nome ou regra de um cliente específico cravado (white-label, decisão 017) —
    vale inclusive para o texto do schema, que hoje trata o tenant original como se fosse o
    sistema inteiro.

## 6. Edge cases conhecidos

- **Tabela criada e derrubada** (`logs`): não pode entrar no schema nem quebrar o guard.
- **Tabela criada com `IF NOT EXISTS` em duas migrations diferentes** — o guard não pode contar
  duplicado nem exigir dois blocos.
- **Tabela criada dentro de bloco `DO $$` ou via `EXECUTE format(...)`**: a `20260724` faz
  `ALTER` assim. Se alguma criação de tabela também for dinâmica, o parser textual não a vê —
  o guard deve declarar essa limitação no cabeçalho em vez de fingir cobertura total.
- **Migration que renomeia tabela** (`ALTER TABLE ... RENAME TO`): se existir, o guard veria a
  tabela antiga como ausente. Conferir se existe alguma antes de assumir que não.
- **Backlog que afirma ausência e está certo**: o resultado esperado é "conferido, continua
  aberto" — não corrigir nada é resultado válido e precisa aparecer na review.
- **Item cuja verdade depende de migration não aplicada** (`20260912`–`20260915`): o código
  existe, o banco pode não ter. A nota do backlog tem que distinguir "código entregue" de
  "rodando em produção", senão troca uma mentira por outra.
- **`schema.sql` com CRLF**: os arquivos do projeto são CRLF; o guard não pode quebrar por causa
  de fim de linha.

## 7. Definição de "aprovado sem ressalvas"

Todos os 18 critérios em **sim** com evidência (arquivo e linha), `npx vitest run` verde em pelo
menos 191 arquivos e 3014+ testes, nenhum arquivo tocado fora do §4, nenhuma migration criada ou
alterada, e nenhuma linha de backlog corrigida sem citar a evidência que a sustenta.

---

## 8. Resultado da review (2026-08-02)

**Aprovado sem ressalvas — 18 de 18 critérios em sim.** `npx vitest run`: 191 arquivos / 3018
testes, verde (partiu de 190/3014; o guard entrou com 4). Nenhuma migration criada ou alterada.

**Corrigido pela review, um ponto:** o guard contava o `DROP TABLE _numeros` da `20260903` como
tabela derrubada, mas ela é uma `CREATE TEMP TABLE` de bloco de verificação. A lista de derrubadas
é o que **isenta** uma tabela dos outros três testes — uma temp table que colidisse de nome com uma
tabela real a tiraria da cobertura em silêncio. Temporárias passaram a ser reconhecidas e ignoradas.

**Provado por mutação:** renomear `combo_produtos` no schema quebra dois testes do guard nomeando a
tabela e a migration que a criou (`combo_produtos (criada em 20260726_combo_produtos.sql)`).

**Edge case que virou não-problema:** `ALTER TABLE ... RENAME TO` não existe em nenhuma migration.

**Arquivo tocado além do §4:** nenhum. Dentro do `sprint_pre_venda.md` fui além das linhas 15–17
(status do S1-3, nota do `colors.js`/F018 e o parágrafo do F021), porque as três afirmavam o que a
auditoria acabara de desmentir.

### Fica para uma próxima rodada

1. **F021 sem ADR** — a fila offline, o replay da cascata e o PWA rodam desde a Leva 11, mas o item
   exigia ADR antes de codar e ele nunca foi escrito. É decisão do dono, não trabalho de código:
   falta registrar IndexedDB × `localStorage`, conflito multi-dispositivo, realtime e contingência
   fiscal/TEF.
2. **F005 — sangria não existe.** Zero ocorrências em `src/` e `supabase/migrations/`. O item
   estava marcado como se fosse só prioridade; é ausência de verdade.
3. **Fidelidade coluna a coluna** continua fora: o guard garante que a tabela e o `tenant_id`
   existem, não que cada `ALTER TABLE` das 92 migrations posteriores a 2026-07-04 esteja refletido.
   Só `supabase db dump` fecha isso, e exige Docker e a senha do banco.
4. **Afirmações de presença** (`Resolvido`, `Entregue`) não foram auditadas — ficaram fora de
   escopo de propósito, por serem o erro que morre no primeiro clique.
