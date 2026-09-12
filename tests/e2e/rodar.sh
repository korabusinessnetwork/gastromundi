#!/usr/bin/env bash
# Bateria de ponta a ponta da varredura, num comando só.
#   tests/e2e/rodar.sh
# Sobe banco local, ponte de QA e o app, roda as suítes de banco e de navegador.
set -uo pipefail
cd "$(dirname "$0")/../.."
PORTA_PONTE=${PORTA_PONTE:-54321}
PORTA_APP=${PORTA_APP:-5201}
PGPORT_QA=${PGPORT_QA:-55432}
BANCO_QA=${BANCO_QA:-qa_base}
falhas=0

echo "== 1. ambiente =="
tests/e2e/preparar-ambiente.sh || { echo "nao consegui preparar o ambiente"; exit 1; }

echo
echo "== 2. suites de banco =="
for f in tests/e2e/banco/1*.sql tests/e2e/banco/2*.sql; do
  echo "-- $f"
  psql -h /tmp -p "$PGPORT_QA" -U postgres -d "$BANCO_QA" -v ON_ERROR_STOP=1 -f "$f" 2>&1 \
    | grep -E "PASSOU|FALHOU|ERROR" | sed 's/^psql.*NOTICE:  //;s/^psql.*ERROR:  //'
  [ "${PIPESTATUS[0]}" -ne 0 ] && falhas=$((falhas+1))
done

echo
echo "== 3. bugs conhecidos (falham de proposito ate a correcao) =="
for f in tests/e2e/banco/3*.sql; do
  psql -h /tmp -p "$PGPORT_QA" -U postgres -d "$BANCO_QA" -v ON_ERROR_STOP=1 -f "$f" 2>&1 \
    | grep -E "PASSOU|PENDENTE" | sed 's/^psql.*NOTICE:  //;s/^psql.*ERROR:  //'
done

echo
echo "== 4. app no navegador =="
cat > .env.local <<ENV
VITE_SUPABASE_URL=http://127.0.0.1:$PORTA_PONTE
VITE_SUPABASE_ANON_KEY=qa-anon-key-falsa-nao-e-segredo
VITE_TENANT_SLUG=qa-a
VITE_TENANT_SLUG_FALLBACK=qa-a
ENV
(fuser -k "$PORTA_PONTE"/tcp 2>/dev/null || true); (fuser -k "$PORTA_APP"/tcp 2>/dev/null || true); sleep 1
setsid nohup node .full-auto/varredura/ponte-qa.mjs --porta "$PORTA_PONTE" --banco "$BANCO_QA" --pg "$PGPORT_QA" >/tmp/ponte-qa.log 2>&1 < /dev/null &
npm run build >/tmp/build-qa.log 2>&1 || { rm -f .env.local; echo "build falhou, veja /tmp/build-qa.log"; exit 1; }
# as VITE_* já foram embutidas no bundle pelo build. O arquivo precisa sair daqui:
# o vitest também lê .env.local, e o slug de QA quebraria a suíte do projeto.
rm -f .env.local
setsid nohup npx vite preview --port "$PORTA_APP" --host 127.0.0.1 >/tmp/preview-qa.log 2>&1 < /dev/null &
for i in $(seq 1 15); do sleep 2; curl -sf -o /dev/null "http://127.0.0.1:$PORTA_APP/login" && break; done

for f in tests/e2e/navegador/*.mjs; do
  echo "-- $f"
  node "$f" || falhas=$((falhas+1))
done

echo
if [ "$falhas" -eq 0 ]; then echo "bateria verde (fora os pendentes de bug conhecido)"; else echo "$falhas suite(s) com falha"; fi
exit "$falhas"
