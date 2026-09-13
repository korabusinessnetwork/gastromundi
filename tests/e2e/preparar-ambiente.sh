#!/usr/bin/env bash
# Levanta o ambiente de QA local: Postgres próprio com o schema real do
# projeto, seed determinístico e a ponte que fala o protocolo do Supabase.
# Nada aqui toca banco de produção. Ver .full-auto/varredura/AMBIENTE.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

PGDATA=${PGDATA_QA:-/tmp/pgqa}
PGPORT=${PGPORT_QA:-55432}
BANCO=${BANCO_QA:-qa_base}
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}

echo "1. cluster postgres em $PGDATA porta $PGPORT"
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"
  runuser -u postgres -- "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
fi
runuser -u postgres -- "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k /tmp" -l "$PGDATA/pg.log" start >/dev/null 2>&1 || true
sleep 2

echo "2. banco $BANCO do zero"
psql -h /tmp -p "$PGPORT" -U postgres -q -c "DROP DATABASE IF EXISTS $BANCO;" -c "CREATE DATABASE $BANCO;"

echo "3. shim do Supabase (roles, schema auth, auth.uid/jwt/role)"
psql -h /tmp -p "$PGPORT" -U postgres -d "$BANCO" -q -f tests/e2e/banco/00-shim-supabase.sql

echo "4. schema real e as migrations, em dois passes (há dependência cruzada entre os dois arquivos)"
for passe in 1 2; do
  psql -h /tmp -p "$PGPORT" -U postgres -d "$BANCO" -f supabase/schema.sql >/dev/null 2>&1 || true
  for f in $(ls supabase/migrations/*.sql | sort); do
    psql -h /tmp -p "$PGPORT" -U postgres -d "$BANCO" -f "$f" >/dev/null 2>&1 || true
  done
done

echo "5. grants que o Supabase dá por padrão (sem eles a RLS nem chega a ser avaliada)"
psql -h /tmp -p "$PGPORT" -U postgres -d "$BANCO" -q -c "
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;"

echo "6. seed determinístico de QA (dois estabelecimentos, um por papel)"
psql -h /tmp -p "$PGPORT" -U postgres -d "$BANCO" -q -f .full-auto/varredura/seed-qa.sql
psql -h /tmp -p "$PGPORT" -U postgres -d "$BANCO" -q -c "
UPDATE auth.users SET email = replace(email,'@teste.local','@qa-a.local'), encrypted_password = crypt('qa123456', gen_salt('bf'))
 WHERE email LIKE '%-a@teste.local' OR email = 'qa-plataforma@teste.local';
UPDATE auth.users SET email = replace(email,'@teste.local','@qa-b.local'), encrypted_password = crypt('qa123456', gen_salt('bf'))
 WHERE email LIKE '%@teste.local';
INSERT INTO public.config (key, value, tenant_id) VALUES
 ('caixa_aberto','false'::jsonb,'aaaaaaaa-0000-4000-8000-000000000001'),
 ('fundo_atual','0'::jsonb,'aaaaaaaa-0000-4000-8000-000000000001')
ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value;"

tabelas=$(psql -h /tmp -p "$PGPORT" -U postgres -d "$BANCO" -tAc "select count(*) from information_schema.tables where table_schema='public'")
policies=$(psql -h /tmp -p "$PGPORT" -U postgres -d "$BANCO" -tAc "select count(*) from pg_policies where schemaname='public'")
echo "pronto: $tabelas tabelas, $policies policies, banco $BANCO na porta $PGPORT"
