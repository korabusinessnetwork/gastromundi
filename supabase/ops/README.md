# Scripts operacionais

SQL que alguém roda **à mão** no SQL Editor do Supabase, uma vez ou em momento
escolhido. Nada aqui é migration: a CLI não aplica estes arquivos, e o schema
de produção continua sendo `supabase/schema.sql` mais `supabase/migrations/`.

| Arquivo | Para que serve | Quando rodar |
|---|---|---|
| `DIAGNOSTICO_MIGRATIONS.sql` | Só leitura. Confere no catálogo do Postgres se cada objeto que as migrations criam existe de fato, marcando o que falta | Quando houver suspeita de migration que não chegou ao banco |
| `APLICAR_FALTANTES.sql` | Reaplica as duas migrations que o diagnóstico de julho de 2026 achou faltando (`20260714` e `20260721`). Idempotente | Histórico; só rodar de novo se o diagnóstico voltar a apontar essas duas |
| `AUDITORIA_RLS_TENANT.sql` | Só leitura. Acha policy ampla em tabela que tem `tenant_id` sem filtrar por estabelecimento | Depois de criar tabela ou policy, e em auditoria |
| `CUTOVER_SUBDOMINIO_renomear_auth.sql` | Move o e-mail de Auth de cada usuário para o namespace do próprio estabelecimento | **Ainda não rodado.** Só na virada do login por subdomínio (ADR-009) |

## Scripts de um estabelecimento

Ficam numa subpasta com o nome dele, para nada específico de um cliente ficar
misturado com o que vale para todos (decisão 017, white-label).

- `casacoffee/`: go-live, tema e layout da Casa Coffee. Roteiro em
  `docs/05_FLUXOS/golive-casacoffee.md`.
