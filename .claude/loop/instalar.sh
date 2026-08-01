#!/usr/bin/env bash
# Instala os comandos do loop em ~/.claude/commands/, deixando-os disponíveis
# em todos os projetos. Idempotente: rode de novo sempre que editar um comando.
set -euo pipefail

origem="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/commands"
destino="${HOME}/.claude/commands"

if [ ! -d "$origem" ]; then
  echo "Erro: não encontrei $origem" >&2
  exit 1
fi

mkdir -p "$destino"

instalados=0
for arquivo in "$origem"/*.md; do
  [ -e "$arquivo" ] || continue
  nome="$(basename "$arquivo")"
  cp "$arquivo" "$destino/$nome"
  echo "  /${nome%.md}"
  instalados=$((instalados + 1))
done

if [ "$instalados" -eq 0 ]; then
  echo "Nenhum comando encontrado em $origem" >&2
  exit 1
fi

echo
echo "$instalados comandos instalados em $destino"
echo "Comece com /ciclo (ou /proximo para ver o que falta)."
