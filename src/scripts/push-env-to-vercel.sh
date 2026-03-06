#!/usr/bin/env bash
#
# Push .env to Vercel Production
# Reads local .env, applies production overrides, pushes each var to Vercel.
#
# Usage: bash scripts/push-env-to-vercel.sh
#

set -euo pipefail

ENV_FILE=".env"
PROD_URL="https://scaling-up-platform-v2.vercel.app"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run from the src/ directory."
  exit 1
fi

echo "=== Pushing .env to Vercel Production ==="
echo ""

# Production overrides (these differ from local .env)
declare -A OVERRIDES=(
  ["NEXTAUTH_URL"]="$PROD_URL"
  ["APP_URL"]="$PROD_URL"
  ["LANDING_PAGE_BASE_URL"]="$PROD_URL/workshops"
  ["DEMO_MODE"]="false"
  ["NODE_ENV"]="production"
)

# Also add vars that aren't in .env but exist in Vercel (don't touch them)
SKIP_VARS=("BLOB_READ_WRITE_TOKEN")

COUNT=0
ERRORS=0

while IFS= read -r line; do
  # Skip comments and empty lines
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

  # Parse KEY="VALUE" or KEY=VALUE
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
    KEY="${BASH_REMATCH[1]}"
    VALUE="${BASH_REMATCH[2]}"

    # Strip surrounding quotes
    VALUE="${VALUE#\"}"
    VALUE="${VALUE%\"}"

    # Strip inline comments like  # comment
    VALUE="${VALUE%%  #*}"
    VALUE="${VALUE%%	#*}"

    # Skip empty keys
    [[ -z "$KEY" ]] && continue

    # Skip vars we shouldn't touch
    SKIP=false
    for sv in "${SKIP_VARS[@]}"; do
      [[ "$KEY" == "$sv" ]] && SKIP=true && break
    done
    $SKIP && continue

    # Apply production override if exists
    if [[ -v "OVERRIDES[$KEY]" ]]; then
      VALUE="${OVERRIDES[$KEY]}"
      echo "  [$KEY] → OVERRIDE: $VALUE"
    else
      # Truncate display for long values
      if [ ${#VALUE} -gt 40 ]; then
        DISPLAY="${VALUE:0:20}...${VALUE: -10}"
      else
        DISPLAY="$VALUE"
      fi
      echo "  [$KEY] → $DISPLAY"
    fi

    # Remove existing (ignore errors if it doesn't exist)
    printf "y\n" | npx vercel env rm "$KEY" production 2>/dev/null || true

    # Add new value
    echo "$VALUE" | npx vercel env add "$KEY" production 2>/dev/null
    if [ $? -eq 0 ]; then
      ((COUNT++))
    else
      echo "  WARNING: Failed to add $KEY"
      ((ERRORS++))
    fi
  fi
done < "$ENV_FILE"

echo ""
echo "=== Done ==="
echo "  Variables pushed: $COUNT"
echo "  Errors: $ERRORS"
echo ""
echo "Next: Redeploy to apply changes"
echo "  npx vercel --prod"
