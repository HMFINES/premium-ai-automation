#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/backend/.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

: "${RENDER_API_KEY:?RENDER_API_KEY is required}"
: "${RENDER_SERVICE_ID:?RENDER_SERVICE_ID is required}"

API_BASE="https://api.render.com/v1"
AUTH_HEADER="Authorization: Bearer ${RENDER_API_KEY}"
CONTENT_HEADER="Content-Type: application/json"

required_keys=(
  DB_HOST
  DB_PORT
  DB_USER
  DB_PASSWORD
  DB_NAME
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  FRONTEND_ORIGIN
)

declare -A env_map
while IFS='=' read -r raw_key raw_value; do
  key="${raw_key#"${raw_key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  [[ -z "$key" ]] && continue
  [[ "${key:0:1}" == "#" ]] && continue

  value="${raw_value:-}"
  value="${value%"${value##*[![:space:]]}"}"
  env_map["$key"]="$value"
done < "$ENV_FILE"

for key in "${required_keys[@]}"; do
  value="${env_map[$key]:-}"
  if [[ -z "$value" ]]; then
    echo "Missing required env key in $ENV_FILE: $key" >&2
    exit 1
  fi
  if [[ "$value" =~ your-|replace_with|change_me ]]; then
    echo "Placeholder value found for $key in $ENV_FILE. Replace with real value." >&2
    exit 1
  fi
done

if [[ ${#env_map[JWT_ACCESS_SECRET]} -lt 32 || ${#env_map[JWT_REFRESH_SECRET]} -lt 32 ]]; then
  echo "JWT secrets must be at least 32 characters." >&2
  exit 1
fi

ensure_domain() {
  local domain="$1"
  local response
  response="$(curl -sS \
    -H "$AUTH_HEADER" \
    "$API_BASE/services/$RENDER_SERVICE_ID/custom-domains")"

  if jq -er --arg name "$domain" '.[]? | select((.name // "") == $name)' >/dev/null <<<"$response"; then
    echo "Domain already exists: $domain"
    return
  fi

  local payload
  payload="$(jq -nc --arg name "$domain" '{name: $name}')"

  local http_code
  http_code="$(curl -sS -o /tmp/render-domain-create.json -w '%{http_code}' \
    -X POST \
    -H "$AUTH_HEADER" \
    -H "$CONTENT_HEADER" \
    -d "$payload" \
    "$API_BASE/services/$RENDER_SERVICE_ID/custom-domains")"

  if [[ "$http_code" =~ ^20[0-9]$ ]]; then
    echo "Added domain: $domain"
    return
  fi

  if [[ "$http_code" == "409" ]]; then
    echo "Domain already attached elsewhere or already exists: $domain" >&2
    return
  fi

  echo "Failed to add domain $domain (HTTP $http_code):" >&2
  cat /tmp/render-domain-create.json >&2
  exit 1
}

ensure_domain "www.elevatex.com"
ensure_domain "elevatex.com"

for key in "${!env_map[@]}"; do
  value="${env_map[$key]}"
  payload="$(jq -nc --arg value "$value" '{value: $value}')"

  http_code="$(curl -sS -o /tmp/render-env-upsert.json -w '%{http_code}' \
    -X PUT \
    -H "$AUTH_HEADER" \
    -H "$CONTENT_HEADER" \
    -d "$payload" \
    "$API_BASE/services/$RENDER_SERVICE_ID/env-vars/$key")"

  if [[ "$http_code" =~ ^20[0-9]$ ]]; then
    echo "Upserted env var: $key"
    continue
  fi

  echo "Failed to upsert env var $key (HTTP $http_code):" >&2
  cat /tmp/render-env-upsert.json >&2
  exit 1
done

deploy_response="$(curl -sS -X POST \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_HEADER" \
  -d '{}' \
  "$API_BASE/services/$RENDER_SERVICE_ID/deploys")"

deploy_id="$(jq -r '.id // empty' <<<"$deploy_response")"
deploy_status="$(jq -r '.status // empty' <<<"$deploy_response")"

if [[ -z "$deploy_id" ]]; then
  echo "Deploy trigger response did not include deploy id:" >&2
  echo "$deploy_response" >&2
  exit 1
fi

echo "Deploy triggered: $deploy_id (${deploy_status:-unknown})"
echo "Service: https://dashboard.render.com/web/$RENDER_SERVICE_ID"
