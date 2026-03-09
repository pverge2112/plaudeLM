#!/usr/bin/env bash
# setup-n8n.sh — Idempotent n8n owner setup + workflow upsert + activation.
#
# Run after first `docker compose up -d n8n` or after wiping n8n_data volume.
# Reads credentials from .env — never hardcoded, never lost.
#
# Idempotency: if a workflow with the same name already exists, it is updated
# in-place (PUT) preserving the existing ID. No duplicate workflows are created.
#
# Usage: ./scripts/setup-n8n.sh

set -euo pipefail

# Load .env from repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE — copy .env.example and fill in values" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${N8N_OWNER_EMAIL:?N8N_OWNER_EMAIL not set in .env}"
: "${N8N_OWNER_FIRSTNAME:?N8N_OWNER_FIRSTNAME not set in .env}"
: "${N8N_OWNER_LASTNAME:?N8N_OWNER_LASTNAME not set in .env}"
: "${N8N_OWNER_PASSWORD:?N8N_OWNER_PASSWORD not set in .env}"

N8N_BASE="${N8N_WEBHOOK_BASE_URL:-http://localhost:5678}"
WORKFLOW_FILE="$SCRIPT_DIR/../n8n/workflows/ingest-pipeline.json"

echo "==> Waiting for n8n to be ready at $N8N_BASE ..."
for i in $(seq 1 30); do
  if curl -sf "$N8N_BASE/healthz" >/dev/null 2>&1; then
    echo "    n8n is up."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "ERROR: n8n did not become ready in 30s" >&2
    exit 1
  fi
  sleep 1
done

echo "==> Setting up owner account ..."
SETUP_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$N8N_BASE/rest/owner/setup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$N8N_OWNER_EMAIL\",
    \"firstName\": \"$N8N_OWNER_FIRSTNAME\",
    \"lastName\": \"$N8N_OWNER_LASTNAME\",
    \"password\": \"$N8N_OWNER_PASSWORD\"
  }")

if [[ "$SETUP_RESP" == "200" ]]; then
  echo "    Owner account created."
elif [[ "$SETUP_RESP" == "400" ]]; then
  echo "    Owner already exists — skipping setup."
else
  echo "ERROR: owner setup returned HTTP $SETUP_RESP" >&2
  exit 1
fi

echo "==> Logging in as $N8N_OWNER_EMAIL ..."
COOKIE_JAR=$(mktemp)
LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$N8N_BASE/rest/login" \
  -H "Content-Type: application/json" \
  -d "{\"emailOrLdapLoginId\": \"$N8N_OWNER_EMAIL\", \"password\": \"$N8N_OWNER_PASSWORD\"}")

if echo "$LOGIN_RESP" | grep -q '"id"'; then
  echo "    Logged in."
else
  echo "ERROR: login failed: $LOGIN_RESP" >&2
  rm -f "$COOKIE_JAR"
  exit 1
fi

# Extract the workflow name from the JSON file to use as the lookup key
WORKFLOW_NAME=$(python3 -c "import json; print(json.load(open('$WORKFLOW_FILE'))['name'])")
echo "==> Checking for existing workflow: '$WORKFLOW_NAME' ..."

# Get ALL workflow IDs matching this name — first is kept, rest are deleted
MATCHING_IDS=$(curl -s -b "$COOKIE_JAR" "$N8N_BASE/rest/workflows" \
  | python3 -c "
import sys, json
workflows = json.load(sys.stdin).get('data', [])
matches = [w['id'] for w in workflows if w.get('name') == '$WORKFLOW_NAME']
print('\n'.join(matches))
" 2>/dev/null)

EXISTING_ID=$(echo "$MATCHING_IDS" | head -1)
DUPLICATE_IDS=$(echo "$MATCHING_IDS" | tail -n +2)

if [[ -n "$EXISTING_ID" ]]; then
  echo "    Found existing workflow ID: $EXISTING_ID — updating in-place (PATCH) ..."
  # PATCH /rest/workflows/{id} with the full workflow JSON updates without creating a duplicate.
  # PUT /rest/workflows/{id} is not supported by the /rest/ internal API (returns 404).
  UPDATE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
    -X PATCH "$N8N_BASE/rest/workflows/$EXISTING_ID" \
    -H "Content-Type: application/json" \
    -d @"$WORKFLOW_FILE")

  if [[ "$UPDATE_HTTP" != "200" ]]; then
    echo "ERROR: PATCH workflow returned HTTP $UPDATE_HTTP" >&2
    rm -f "$COOKIE_JAR"
    exit 1
  fi
  WORKFLOW_ID="$EXISTING_ID"
  echo "    Workflow updated."

  # Delete any duplicates
  if [[ -n "$DUPLICATE_IDS" ]]; then
    while IFS= read -r DUP_ID; do
      [[ -z "$DUP_ID" ]] && continue
      echo "    Deleting duplicate workflow: $DUP_ID ..."
      curl -s -o /dev/null -b "$COOKIE_JAR" \
        -X PATCH "$N8N_BASE/rest/workflows/$DUP_ID" \
        -H "Content-Type: application/json" -d '{"active":false}'
      curl -s -o /dev/null -b "$COOKIE_JAR" -X DELETE "$N8N_BASE/rest/workflows/$DUP_ID"
    done <<< "$DUPLICATE_IDS"
  fi
else
  echo "    No existing workflow found — creating ..."
  IMPORT_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$N8N_BASE/rest/workflows" \
    -H "Content-Type: application/json" \
    -d @"$WORKFLOW_FILE")

  WORKFLOW_ID=$(echo "$IMPORT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)

  if [[ -z "$WORKFLOW_ID" ]]; then
    echo "ERROR: could not create workflow. Response: $IMPORT_RESP" >&2
    rm -f "$COOKIE_JAR"
    exit 1
  fi
  echo "    Workflow created with ID: $WORKFLOW_ID"
fi

echo "==> Activating workflow $WORKFLOW_ID ..."
ACTIVATE_RESP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  -X PATCH "$N8N_BASE/rest/workflows/$WORKFLOW_ID" \
  -H "Content-Type: application/json" \
  -d '{"active": true}')

if [[ "$ACTIVATE_RESP" == "200" ]]; then
  echo "    Workflow activated."
else
  echo "ERROR: activation returned HTTP $ACTIVATE_RESP" >&2
  rm -f "$COOKIE_JAR"
  exit 1
fi

rm -f "$COOKIE_JAR"
echo ""
echo "==> n8n setup complete."
echo "    Workflow ID: $WORKFLOW_ID"
echo "    Webhook:     $N8N_BASE/webhook/ingest"
echo "    UI:          $N8N_BASE"
