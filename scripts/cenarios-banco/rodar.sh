#!/bin/sh
# Cenários de banco da fase 1 do plano de refatoração, num Postgres local descartável.
#
# Sobe um Postgres 16 numa pasta do usuário `postgres` (nunca o banco de produção),
# monta o banco com o mínimo do Supabase, o núcleo anterior às migrations e todas
# as migrations, e roda os cenários das quatro funções atômicas: salvar_combo,
# importar_nota_fiscal, excluir_unidade_medida e salvar_subproduto. No fim reaplica
# as quatro migrations para conferir que elas aplicam duas vezes sem erro.
#
# Uso (como root, num ambiente com o Postgres 16 instalado):
#   sh scripts/cenarios-banco/rodar.sh
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
RAIZ="$DIR/../.."
PG=/usr/lib/postgresql/16/bin
DADOS=${CENARIOS_PG_DIR:-/var/lib/postgresql/gm-cenarios}
PORTA=${CENARIOS_PG_PORTA:-55432}
BANCO=cenarios

if ! psql -h "$DADOS" -p "$PORTA" -U postgres -Atc "select 1" >/dev/null 2>&1; then
  su postgres -c "rm -rf '$DADOS' && mkdir -p '$DADOS' && $PG/initdb -D '$DADOS/data' -A trust -U postgres >/dev/null && $PG/pg_ctl -D '$DADOS/data' -o \"-p $PORTA -k $DADOS -c listen_addresses=\" -l '$DADOS/log' -w start >/dev/null"
fi
CONEXAO="psql -h $DADOS -p $PORTA -U postgres"

echo "Montando o banco a partir das migrations..."
"$DIR/montar.sh" "$CONEXAO" "$BANCO" 2>&1 | grep -v "NOTICE" | sed 's/^/  aviso da montagem: /' || true
$CONEXAO -d "$BANCO" -q -v ON_ERROR_STOP=1 -f "$DIR/00-base.sql" >/dev/null 2>&1

SAIDA=$(mktemp)
for f in "$DIR"/[1-9]0-*.sql; do
  $CONEXAO -d "$BANCO" -q -At -f "$f" >"$SAIDA.parte" 2>&1 || true
  cat "$SAIDA.parte" >>"$SAIDA"
done
for m in 20261123_salvar_combo_atomico 20261124_importar_nota_fiscal_atomica 20261125_excluir_unidade_medida_atomica 20261126_salvar_subproduto_atomico; do
  if $CONEXAO -d "$BANCO" -q -v ON_ERROR_STOP=1 -f "$RAIZ/supabase/migrations/$m.sql" >/dev/null 2>&1; then
    echo "NOTICE:  ok: a migration $m aplica de novo sem erro" >>"$SAIDA"
  else
    echo "FALHOU: a migration $m não aplica duas vezes" >>"$SAIDA"
  fi
done

grep -E "NOTICE:  ok:|FALHOU|ERROR" "$SAIDA" | sed 's/^psql:[^ ]* //; s/^NOTICE:  //'
OK=$(grep -c "NOTICE:  ok:" "$SAIDA" || true)
FALHAS=$(grep -cE "FALHOU|ERROR" "$SAIDA" || true)
rm -f "$SAIDA" "$SAIDA.parte"
echo ""
echo "$OK conferências passaram, $FALHAS falharam."
[ "$FALHAS" -eq 0 ]
