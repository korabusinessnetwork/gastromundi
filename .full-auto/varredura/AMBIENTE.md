# Ambiente de varredura

Commit base: `54f76cbe` (branch `claude/dreamy-wright-b35oyo`)
Data: 12/09/2026

Tudo aqui é reproduzível por script. O comando único é `tests/e2e/rodar.sh`.

## Subir do zero

```bash
npm ci                      # ver a ressalva do xlsx logo abaixo
tests/e2e/preparar-ambiente.sh   # Postgres local, schema real, migrations, seed de QA
node .full-auto/varredura/ponte-qa.mjs --porta 54321 --banco qa_base &
npm run build && npx vite preview --port 5201 --host 127.0.0.1 &
tests/e2e/rodar.sh          # faz tudo isso sozinho e roda as suítes
```

## O banco de teste

Não há Docker nem Supabase CLI nesta máquina, então o Supabase local não sobe. O que
existe é um Postgres 16 nativo, e o ambiente foi montado assim:

1. Cluster próprio em `/tmp/pgqa`, porta 55432, banco `qa_base`.
2. `tests/e2e/banco/00-shim-supabase.sql` recria o mínimo do Supabase que as migrations
   esperam: os roles `anon`, `authenticated`, `service_role`, o schema `auth` com
   `auth.users`, e as funções `auth.uid()`, `auth.jwt()`, `auth.role()` lendo
   `request.jwt.claims`, exatamente como o PostgREST faz.
3. `supabase/schema.sql` e as 121 migrations são aplicados em **dois passes**, porque os
   dois arquivos dependem um do outro: o núcleo operacional (`products`, `users`, `sales`,
   `pending`, `config`) só existe no `schema.sql`, e tabelas como `planos` e `tenants` só
   existem nas migrations. Depois do segundo passe o resultado estabiliza em **60 tabelas,
   107 funções e 209 policies**, e os erros que sobram são todos "já existe".
4. Os GRANTs que o Supabase dá por padrão (`GRANT ALL ON ALL TABLES ... TO anon,
   authenticated`) são aplicados à mão. Sem eles a RLS nem chega a ser avaliada, e todo
   teste de isolamento passaria por um motivo errado.

**Limite conhecido:** este banco é uma reconstrução fiel do que está em
`supabase/migrations/`, não um dump da produção. Se a produção divergir das migrations,
a varredura não enxerga a diferença.

## A ponte de QA

`.full-auto/varredura/ponte-qa.mjs` é um servidor que fala o protocolo do Supabase e
traduz para SQL no banco local: `/auth/v1/token` com senha conferida por `crypt`, e o
subconjunto do PostgREST que o app usa (select, eq, neq, gt, gte, lt, lte, like, ilike,
is, in, or, and, order, limit, offset, upsert com `on_conflict`, `Prefer:
return=representation`, `rpc/<função>`).

Ela responde **501 em vez de inventar resposta** para o que não emula, e registra tudo em
`GET /__qa/diagnostico`. O que não é emulado, de propósito:

| Não emulado | Efeito na varredura |
|---|---|
| realtime (websocket) | telas não atualizam sozinhas entre terminais, F097 fica `NAO_TESTADO` |
| `select` com recurso embutido (`combos(...)`) | a leitura de combos falha, F114 a F116 ficam `NAO_TESTADO` |
| storage e Edge Functions | fotos do delivery e NFC-e ficam `NAO_TESTADO` |

Isso não é defeito escondido: um `501` aparece no console do navegador e no diagnóstico.

## Variáveis

`.env.local` gerado pelo `rodar.sh`, tudo falso:

| Variável | Valor em QA |
|---|---|
| VITE_SUPABASE_URL | http://127.0.0.1:54321 (a ponte) |
| VITE_SUPABASE_ANON_KEY | qa-anon-key-falsa-nao-e-segredo |
| VITE_TENANT_SLUG | qa-a |
| VITE_TENANT_SLUG_FALLBACK | qa-a |

## Usuários de teste (seed)

| Papel | Login | Senha | Estabelecimento |
|---|---|---|---|
| admin | qa-admin-a | qa123456 | QA Tenant A |
| gerente | qa-gerente-a | qa123456 | QA Tenant A |
| caixa | qa-caixa-a | qa123456 | QA Tenant A |
| garçom | qa-garcom-a | qa123456 | QA Tenant A |
| inativo | qa-inativo-a | qa123456 | QA Tenant A |
| admin | qa-admin-b | qa123456 | QA Tenant B |
| plataforma | qa-plataforma | qa123456 | sem tenant |

## Dados do seed

| Conjunto | Descrição | Serve para |
|---|---|---|
| vazio | tenant B quase sem nada | estado vazio |
| unitário | 1 produto publicado no delivery | singular, paginação |
| volume | 500 produtos `qa-volume-###` | desempenho, rolagem, filtro |
| extremo | nome com 340 caracteres, acento e emoji, produto inativo | encoding e layout (achou o B04) |
| dois tenants | QA Tenant A e QA Tenant B | isolamento, que é o teste central |

## Limitações do ambiente, e o que elas custaram

- **Sem Docker e sem Supabase CLI**: nada de Supabase local completo. Realtime, storage e
  Edge Functions ficaram fora.
- **`cdn.sheetjs.com` bloqueado pela política de rede da sessão**: `npm ci` não completa
  como está. O `xlsx` foi instalado da versão 0.18.5 do registro público apenas em
  `node_modules`, sem tocar no `package.json` nem no lockfile. Achado em fluxo de
  planilha nesta máquina deve ser reconferido com a versão pinada antes de virar bug.
- **`fonts.googleapis.com` bloqueado**: erro de console na tela de login que é do
  ambiente, e está filtrado nas suítes de navegador.
- **Um cluster Postgres só**: as suítes rodaram em sequência, não em paralelo.
