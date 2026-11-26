#!/bin/sh
# Monta um banco descartável com o mínimo do Supabase, o núcleo anterior às
# migrations e todas as migrations em ordem. Uso: montar.sh <psql-de-conexão> <banco>
set -e
CONEXAO="$1"; BANCO="$2"
DIR=$(dirname "$0"); RAIZ="$DIR/../.."
$CONEXAO -d postgres -q -c "DROP DATABASE IF EXISTS $BANCO" -c "CREATE DATABASE $BANCO" >/dev/null
Q="$CONEXAO -d $BANCO -q -v ON_ERROR_STOP=0"
$Q -f "$DIR/supabase-minimo.sql" >/dev/null 2>&1
$Q -f "$DIR/nucleo-anterior.sql" >/dev/null 2>&1
for f in "$RAIZ"/supabase/migrations/*.sql; do
  $Q -f "$f" 2>&1 | grep "ERROR" | sed "s#^#$(basename "$f"): #" || true
done
