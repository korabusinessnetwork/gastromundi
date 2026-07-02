#!/usr/bin/env bash
# validate-build.sh — verifica se as env vars VITE_* foram embutidas no bundle de produção
set -euo pipefail

PASS="✅"
FAIL="❌"
WARN="⚠️ "
results=()

echo "════════════════════════════════════════════════"
echo "  GASTROMUNDI — Validação de Build (env vars)"
echo "════════════════════════════════════════════════"
echo ""

# ── 1. .env.local ────────────────────────────────────────────────────
if [ -f ".env.local" ]; then
  echo "${PASS} .env.local encontrado"
  results+=("${PASS} .env.local existe")

  HAS_URL=$(grep -c "^VITE_SUPABASE_URL=" .env.local 2>/dev/null || echo 0)
  HAS_KEY=$(grep -c "^VITE_SUPABASE_ANON_KEY=" .env.local 2>/dev/null || echo 0)

  if [ "$HAS_URL" -ge 1 ] && [ "$HAS_KEY" -ge 1 ]; then
    echo "${PASS} .env.local contém VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY"
    results+=("${PASS} Ambas as variáveis VITE_SUPABASE_* presentes em .env.local")
  else
    echo "${FAIL} .env.local incompleto — HAS_URL=${HAS_URL} HAS_KEY=${HAS_KEY}"
    results+=("${FAIL} .env.local incompleto (URL=${HAS_URL} KEY=${HAS_KEY})")
  fi
else
  echo "${FAIL} .env.local NÃO encontrado — build local vai falhar"
  results+=("${FAIL} .env.local ausente")
fi

echo ""
echo "── Executando npm run build ────────────────────"
if npm run build 2>&1; then
  echo ""
  echo "${PASS} npm run build concluído sem erros"
  results+=("${PASS} npm run build OK")
else
  echo ""
  echo "${FAIL} npm run build FALHOU"
  results+=("${FAIL} npm run build falhou")
  echo ""
  echo "════ RESUMO ════"
  for r in "${results[@]}"; do echo "  $r"; done
  exit 1
fi

echo ""
echo "── Inspecionando bundle ────────────────────────"

BUNDLE=$(ls dist/assets/index-*.js 2>/dev/null | head -1 || true)
if [ -z "$BUNDLE" ]; then
  echo "${FAIL} Nenhum dist/assets/index-*.js encontrado"
  results+=("${FAIL} Bundle não localizado")
  echo ""
  echo "════ RESUMO ════"
  for r in "${results[@]}"; do echo "  $r"; done
  exit 1
fi

BUNDLE_SIZE=$(du -h "$BUNDLE" | cut -f1)
echo "Bundle: $BUNDLE ($BUNDLE_SIZE)"
results+=("${PASS} Bundle localizado: $(basename "$BUNDLE") ($BUNDLE_SIZE)")

echo ""

# ── 2. URL embutida ──────────────────────────────────────────────────
if grep -q "supabase\.co" "$BUNDLE"; then
  FOUND_URL=$(grep -o 'https://[a-z0-9]*\.supabase\.co' "$BUNDLE" | head -1 || true)
  echo "${PASS} 'supabase.co' no bundle — URL injetada: ${FOUND_URL:-<encontrada>}"
  results+=("${PASS} VITE_SUPABASE_URL embutida: ${FOUND_URL:-ok}")
else
  echo "${FAIL} 'supabase.co' NÃO encontrado — VITE_SUPABASE_URL ausente em build time"
  results+=("${FAIL} VITE_SUPABASE_URL AUSENTE no bundle (Vercel não tem a var?)")
fi

# ── 3. Anon key embutida (JWT começa com eyJ) ────────────────────────
if grep -qo '"eyJ[A-Za-z0-9_-][A-Za-z0-9_.-]*"' "$BUNDLE" 2>/dev/null; then
  KEY_PREVIEW=$(grep -o '"eyJ[A-Za-z0-9_.-]*"' "$BUNDLE" | head -1 | cut -c1-30)
  echo "${PASS} Anon key (eyJ…) encontrada no bundle: ${KEY_PREVIEW}…"
  results+=("${PASS} VITE_SUPABASE_ANON_KEY embutida no bundle")
else
  echo "${FAIL} Nenhuma string eyJ… encontrada — VITE_SUPABASE_ANON_KEY possivelmente ausente"
  results+=("${FAIL} VITE_SUPABASE_ANON_KEY AUSENTE no bundle")
fi

# ── 4. Padrão suspeito: undefined como argumento do createClient ─────
RAW_MATCH=$(grep -o '.\{80\}createClient.\{80\}' "$BUNDLE" 2>/dev/null | head -2 || true)
if [ -n "$RAW_MATCH" ]; then
  echo ""
  echo "  Contexto createClient no bundle (primeiros 160 chars):"
  echo "$RAW_MATCH" | head -2 | cut -c1-160 | sed 's/^/    /'
  if echo "$RAW_MATCH" | grep -qE 'createClient\((\s*void 0|\s*undefined)'; then
    echo "${FAIL} DETECTADO undefined/void 0 como primeiro arg — URL ausente"
    results+=("${FAIL} createClient(undefined,...) no bundle — VITE_SUPABASE_URL não injetada")
  elif echo "$RAW_MATCH" | grep -qE ',(\s*void 0|\s*undefined)\)'; then
    echo "${FAIL} DETECTADO undefined/void 0 como segundo arg — KEY ausente"
    results+=("${FAIL} createClient(...,undefined) no bundle — VITE_SUPABASE_ANON_KEY não injetada")
  else
    echo "${PASS} Sem undefined/void 0 detectado como argumento do createClient"
    results+=("${PASS} createClient não recebe undefined no bundle local")
  fi
else
  echo "${WARN}createClient não localizável literalmente (normal — minificado)"
  results+=("${WARN}createClient não localizável; use checagem eyJ acima como referência")
fi

echo ""
echo "════════════════════════════════════════════════"
echo "  RESUMO FINAL"
echo "════════════════════════════════════════════════"
for r in "${results[@]}"; do
  echo "  $r"
done
echo ""

# Exit com erro se qualquer checagem crítica falhou
if printf '%s\n' "${results[@]}" | grep -q "^${FAIL}"; then
  echo "  → Pelo menos uma checagem FALHOU. Configure as variáveis no Vercel Dashboard."
  exit 1
else
  echo "  → Todas as checagens passaram. Bundle local OK."
  echo "  → PRÓXIMO PASSO: confirme que VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY"
  echo "    estão cadastradas em Vercel → Project Settings → Environment Variables."
  exit 0
fi
