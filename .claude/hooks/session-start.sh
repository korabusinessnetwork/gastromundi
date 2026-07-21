#!/bin/bash
# SessionStart hook — instala dependências para testes/build funcionarem
# no Claude Code na web. Síncrono (garante deps antes da sessão começar).
set -euo pipefail

# Só roda em ambiente remoto (Claude Code na web); local o dev já tem node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# npm install (não `ci`) aproveita o cache do container entre sessões e é
# idempotente — seguro rodar várias vezes.
npm install --no-audit --no-fund
