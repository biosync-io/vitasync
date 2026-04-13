#!/usr/bin/env bash
# VitaSync API Route Verification Script
# Cross-references route definitions against services and validation
set -euo pipefail

echo "═══════════════════════════════════════════════════════════"
echo "  VitaSync API Route Verification"
echo "═══════════════════════════════════════════════════════════"
echo ""

ROUTES_DIR="apps/api/src/routes/v1"
SERVICES_DIR="apps/api/src/services"

if [ ! -d "$ROUTES_DIR" ]; then
  echo "  ❌ Routes directory not found: $ROUTES_DIR"
  exit 1
fi

# List all route files
echo "▸ Route files in $ROUTES_DIR:"
ROUTE_FILES=$(find "$ROUTES_DIR" -name "*.ts" ! -name "*.test.*" ! -name "*.spec.*" | sort)
echo "$ROUTE_FILES" | while read -r f; do
  echo "  📄 $(basename "$f")"
done
echo ""

# Check Zod validation
echo "▸ Checking Zod validation in route files..."
echo "$ROUTE_FILES" | while read -r f; do
  BASENAME=$(basename "$f")
  if grep -q 'from "zod"\|from '\''zod'\''' "$f" 2>/dev/null; then
    echo "  ✅ $BASENAME — imports Zod"
  else
    # Check if file has any route handlers
    if grep -qP 'app\.(get|post|put|patch|delete)\(' "$f" 2>/dev/null; then
      echo "  ❌ $BASENAME — has route handlers but NO Zod import"
    else
      echo "  ⏭️  $BASENAME — no route handlers (likely barrel/index)"
    fi
  fi
done
echo ""

# Check service layer exists for each route domain
echo "▸ Checking service layer coverage..."
echo "$ROUTE_FILES" | while read -r f; do
  BASENAME=$(basename "$f" .ts)
  # Skip index files
  if [ "$BASENAME" = "index" ]; then continue; fi

  SERVICE_FILE="$SERVICES_DIR/${BASENAME}.service.ts"
  if [ -f "$SERVICE_FILE" ]; then
    echo "  ✅ $BASENAME — service file exists"
  else
    # Try without pluralization or with different naming
    FOUND=$(find "$SERVICES_DIR" -name "*${BASENAME%s}*" -o -name "*${BASENAME}*" 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
      echo "  ✅ $BASENAME — service found: $(basename "$FOUND")"
    else
      echo "  ⚠️  $BASENAME — no matching service file found"
    fi
  fi
done
echo ""

# Check for route handlers without error handling
echo "▸ Checking route handler patterns..."
HANDLER_COUNT=$(grep -rn 'app\.\(get\|post\|put\|patch\|delete\)(' "$ROUTES_DIR" --include="*.ts" | grep -v '\.test\.\|\.spec\.' | wc -l || true)
echo "  Found $HANDLER_COUNT route handlers"

# Check for request.body usage without validation
UNVALIDATED=$(grep -rnA2 'request\.body' "$ROUTES_DIR" --include="*.ts" | grep -v '\.parse\|\.safeParse\|schema\|\.test\.\|\.spec\.' | grep 'request\.body' | wc -l || true)
if [ "$UNVALIDATED" -gt 0 ]; then
  echo "  ❌ $UNVALIDATED request.body usage(s) potentially without Zod validation:"
  grep -rnA2 'request\.body' "$ROUTES_DIR" --include="*.ts" | grep -v '\.parse\|\.safeParse\|schema\|\.test\.\|\.spec\.' | grep 'request\.body' | head -10
else
  echo "  ✅ All request.body usages appear to have validation"
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  Review any ❌ or ⚠️ entries above"
echo "═══════════════════════════════════════════════════════════"
