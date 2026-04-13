#!/usr/bin/env bash
# VitaSync Violations Audit Script
# Usage: bash audit.sh [path]
# Default: audits apps/ and packages/

set -euo pipefail

TARGET="${1:-apps/}"
TOTAL=0

echo "═══════════════════════════════════════════════════════════"
echo "  VitaSync Engineering Guidelines Audit"
echo "  Target: $TARGET"
echo "═══════════════════════════════════════════════════════════"
echo ""

# --- 1. `any` type usage ---
echo "▸ [1/8] Explicit \`any\` type usage..."
COUNT=$(grep -rn ': any\b\|: any;\|: any,\|as any\b' "$TARGET" --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|\.d\.ts' | wc -l || true)
if [ "$COUNT" -gt 0 ]; then
  echo "  ❌ $COUNT violation(s):"
  grep -rn ': any\b\|: any;\|: any,\|as any\b' "$TARGET" --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|\.d\.ts' | head -20
  TOTAL=$((TOTAL + COUNT))
else
  echo "  ✅ 0 violations"
fi
echo ""

# --- 2. console.log in API/worker ---
echo "▸ [2/8] console.log in production code..."
COUNT=$(grep -rn 'console\.\(log\|warn\|error\|debug\)' "$TARGET" --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|biome\|eslint\|apps/web/' | wc -l || true)
if [ "$COUNT" -gt 0 ]; then
  echo "  ❌ $COUNT violation(s):"
  grep -rn 'console\.\(log\|warn\|error\|debug\)' "$TARGET" --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|biome\|eslint\|apps/web/' | head -20
  TOTAL=$((TOTAL + COUNT))
else
  echo "  ✅ 0 violations"
fi
echo ""

# --- 3. Non-null assertions ---
echo "▸ [3/8] Non-null assertions (!)..."
COUNT=$(grep -rnP '\w+!\.' "$TARGET" --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|\.d\.ts\|!=' | wc -l || true)
if [ "$COUNT" -gt 0 ]; then
  echo "  ⚠️  $COUNT potential non-null assertion(s) (review manually):"
  grep -rnP '\w+!\.' "$TARGET" --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|\.d\.ts\|!=' | head -20
  TOTAL=$((TOTAL + COUNT))
else
  echo "  ✅ 0 violations"
fi
echo ""

# --- 4. Missing Zod validation in routes ---
echo "▸ [4/8] Route handlers potentially missing Zod validation..."
if [ -d "apps/api/src/routes" ]; then
  # Count route files that don't import zod
  ROUTE_FILES=$(find apps/api/src/routes -name "*.ts" ! -name "*.test.*" | wc -l || true)
  NO_ZOD=$(find apps/api/src/routes -name "*.ts" ! -name "*.test.*" -exec grep -L 'from "zod"\|from '\''zod'\''' {} \; | wc -l || true)
  if [ "$NO_ZOD" -gt 0 ]; then
    echo "  ⚠️  $NO_ZOD of $ROUTE_FILES route file(s) don't import Zod:"
    find apps/api/src/routes -name "*.ts" ! -name "*.test.*" -exec grep -L 'from "zod"\|from '\''zod'\''' {} \;
    TOTAL=$((TOTAL + NO_ZOD))
  else
    echo "  ✅ All $ROUTE_FILES route files import Zod"
  fi
else
  echo "  ⏭️  Skipped (no apps/api/src/routes directory in target)"
fi
echo ""

# --- 5. Raw SQL patterns ---
echo "▸ [5/8] Raw SQL (should use Drizzle ORM)..."
COUNT=$(grep -rn 'db\.execute\|\.query(' "$TARGET" --include="*.ts" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|migrations\|\.d\.ts\|drizzle' | wc -l || true)
if [ "$COUNT" -gt 0 ]; then
  echo "  ⚠️  $COUNT potential raw SQL usage(s):"
  grep -rn 'db\.execute\|\.query(' "$TARGET" --include="*.ts" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|migrations\|\.d\.ts\|drizzle' | head -20
  TOTAL=$((TOTAL + COUNT))
else
  echo "  ✅ 0 violations"
fi
echo ""

# --- 6. Hardcoded secrets ---
echo "▸ [6/8] Potential hardcoded secrets..."
COUNT=$(grep -rn 'password.*=.*["\x27].\{8,\}["\x27]\|secret.*=.*["\x27].\{8,\}["\x27]\|apiKey.*=.*["\x27].\{8,\}["\x27]' "$TARGET" --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|\.env\.\|example\|schema\|\.d\.ts\|type\|interface\|zod' | wc -l || true)
if [ "$COUNT" -gt 0 ]; then
  echo "  ⚠️  $COUNT potential hardcoded secret(s):"
  grep -rn 'password.*=.*["\x27].\{8,\}["\x27]\|secret.*=.*["\x27].\{8,\}["\x27]' "$TARGET" --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|\.spec\.\|__tests__\|node_modules\|\.env\.\|example\|schema\|\.d\.ts\|type\|interface\|zod' | head -20
  TOTAL=$((TOTAL + COUNT))
else
  echo "  ✅ 0 violations"
fi
echo ""

# --- 7. TypeScript ---
echo "▸ [7/8] TypeScript compilation..."
if pnpm typecheck 2>&1; then
  echo "  ✅ TypeScript passes"
else
  echo "  ❌ TypeScript errors found"
  TOTAL=$((TOTAL + 1))
fi
echo ""

# --- 8. Biome ---
echo "▸ [8/8] Biome linting..."
if pnpm exec biome ci . 2>&1; then
  echo "  ✅ Biome passes"
else
  echo "  ❌ Biome violations found"
  TOTAL=$((TOTAL + 1))
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$TOTAL" -eq 0 ]; then
  echo "  ✅ ALL CHECKS PASSED — 0 total violations"
else
  echo "  ❌ AUDIT FAILED — $TOTAL total violation(s)"
fi
echo "═══════════════════════════════════════════════════════════"
