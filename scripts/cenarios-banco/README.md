# Cenários de banco (fase 1 do plano de refatoração)

Prova, num Postgres local e descartável, que as quatro funções atômicas do banco fazem o que as
specs da fase 1 dizem: `salvar_combo`, `importar_nota_fiscal`, `excluir_unidade_medida` e
`salvar_subproduto`. Nunca toca o banco de produção.

```
sh scripts/cenarios-banco/rodar.sh      # ou: npm run cenarios-banco
```

Precisa do Postgres 16 instalado (`/usr/lib/postgresql/16/bin`) e de rodar como root, porque o
banco sobe com o usuário `postgres` numa pasta dele (`/var/lib/postgresql/gm-cenarios`, mude com
`CENARIOS_PG_DIR`; a porta é `55432`, mude com `CENARIOS_PG_PORTA`).

## Como funciona

1. `supabase-minimo.sql`: o mínimo do Supabase que o schema espera. São os papéis (`anon`,
   `authenticated`...), o `auth.uid()`, `auth.jwt()` e `auth.role()` lidos de
   `request.jwt.claims`, como o PostgREST faz, e um esqueleto do Storage.
2. `nucleo-anterior.sql`: as tabelas que já existiam no banco antes da primeira migration (gerado
   do `supabase/schema.sql`, sem `tenant_id`).
3. `montar.sh`: aplica os dois e **todas** as migrations em ordem.
4. `00-base.sql`: as ajudas `teste.como(papel, estabelecimento)` e `teste.conferir(...)`, e dois
   estabelecimentos, A e B.
5. `10-` a `40-`: os cenários de cada função. Cada um troca para o papel `authenticated` com o JWT
   de quem age, então a RLS vale como em produção. Os números seguem a tabela de critérios da spec
   da rodada (1.1, 1.2, 1.3 e 1.6).
6. No fim, as quatro migrations são aplicadas de novo, para provar que aplicam duas vezes.

## Aviso conhecido da montagem

A `20260725_fix_search_path_secdef.sql` altera `baixar_estoque_subproduto`, que só a
`20260748_estoque_subprodutos.sql` cria. Em produção elas foram aplicadas fora da ordem dos nomes.
O aviso não afeta os cenários.
