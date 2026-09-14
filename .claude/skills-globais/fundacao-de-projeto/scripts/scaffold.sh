#!/usr/bin/env bash
#
# scaffold.sh — gera a fundação de um projeto novo no padrão "fundacao-de-projeto".
#
# Cria a árvore (memory/ + docs/00→11 + esqueleto de src/ e backend), copia os
# templates opinativos e substitui os placeholders {{CHAVE}} pelos valores do
# intake.
#
# Uso:
#   scaffold.sh --target <dir> [--values <arquivo>] [--backend supabase] [--no-ui] [--force]
#
#   --target   Diretório onde a fundação será criada (obrigatório).
#   --values   Arquivo KEY=VALUE com as respostas do intake (opcional).
#              Sem ele, os placeholders ficam intactos para preencher à mão.
#   --backend  Nome da pasta da camada de dados (default: supabase).
#   --no-ui    Pula design system e componentes (produto sem UI).
#   --force    Escreve mesmo se o --target já tiver conteúdo.
#
# NÃO comita nada. Rode a partir da raiz da skill ou de qualquer lugar.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="$SKILL_DIR/assets/templates"

TARGET="" VALUES="" BACKEND="supabase" NO_UI=0 FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 ;;
    --values)  VALUES="${2:-}"; shift 2 ;;
    --backend) BACKEND="${2:-}"; shift 2 ;;
    --no-ui)   NO_UI=1; shift ;;
    --force)   FORCE=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

[ -n "$TARGET" ] || { echo "ERRO: --target é obrigatório." >&2; exit 1; }
if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null || true)" ] && [ "$FORCE" -eq 0 ]; then
  echo "ERRO: $TARGET não está vazio. Use --force para escrever mesmo assim." >&2; exit 1
fi

echo ">> Gerando fundação em: $TARGET"
mkdir -p "$TARGET"

# ── 1. Copiar governança e documentação ────────────────────────────────────
cp -R "$TEMPLATES/memory" "$TARGET/memory"
cp -R "$TEMPLATES/docs"   "$TARGET/docs"
cp "$TEMPLATES/CLAUDE.md.template"              "$TARGET/CLAUDE.md"
cp "$TEMPLATES/respostas-intake.template.md"   "$TARGET/respostas-intake.md"

# Produto sem UI: remove design system e componentes
if [ "$NO_UI" -eq 1 ]; then
  rm -rf "$TARGET/docs/02_DESIGN_SYSTEM" "$TARGET/docs/06_COMPONENTES"
  echo "   (--no-ui) removidos 02_DESIGN_SYSTEM e 06_COMPONENTES"
fi

# ── 2. Esqueleto de código e dados ──────────────────────────────────────────
mkdir -p "$TARGET/src/components/shared" "$TARGET/src/pages" "$TARGET/src/context" \
         "$TARGET/src/hooks" "$TARGET/src/lib" "$TARGET/src/constants" \
         "$TARGET/src/styles" "$TARGET/src/utils"
mkdir -p "$TARGET/$BACKEND/migrations" "$TARGET/$BACKEND/functions" "$TARGET/$BACKEND/seeds"
mkdir -p "$TARGET/.claude/skills" "$TARGET/scripts"

# Notas para não deixar pasta vazia (combate à "página em branco")
echo "# Camada de serviços — todo acesso ao backend passa por aqui (nunca no componente)." \
  > "$TARGET/src/lib/README.md"
echo "-- Fonte de verdade do banco. RLS obrigatório em toda tabela (multi-tenant)." \
  > "$TARGET/$BACKEND/schema.sql"

# ── 3. Substituição de placeholders {{CHAVE}} ───────────────────────────────
subst_all() {
  local key="$1" val="$2"
  # escapa & e / e \ para o sed
  local esc; esc=$(printf '%s' "$val" | sed -e 's/[\/&\\]/\\&/g')
  grep -rlZ "{{$key}}" "$TARGET" 2>/dev/null | while IFS= read -r -d '' f; do
    sed -i "s/{{$key}}/$esc/g" "$f"
  done
}

if [ -n "$VALUES" ] && [ -f "$VALUES" ]; then
  echo ">> Aplicando valores de: $VALUES"
  # Lê linhas KEY=VALUE (ignora comentários e linhas vazias)
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"; val="${line#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [ -n "$key" ] || continue
    subst_all "$key" "$val"
  done < "$VALUES"
else
  echo ">> Sem --values: placeholders {{...}} mantidos para preenchimento manual."
fi

# ── 4. Relatório ────────────────────────────────────────────────────────────
echo ""
echo ">> Fundação criada. Placeholders ainda pendentes:"
if grep -rlo "{{[A-Z_]\{1,\}}}" "$TARGET" 2>/dev/null | head -n 20; then :; else echo "   (nenhum)"; fi
echo ""
echo "Próximos passos:"
echo "  1. Preencha respostas-intake.md e memory/identity.md com o produto real."
echo "  2. Registre a stack em docs/08_DECISOES/ (copie adr-000-template.md -> adr-001.md)."
echo "  3. Preencha o plano de segurança em docs/11_SEGURANCA/."
echo "  4. Rode o checklist de validação (SKILL.md, Fase 4)."
