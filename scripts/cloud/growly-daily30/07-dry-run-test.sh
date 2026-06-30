#!/usr/bin/env bash
# Growly Sales Daily 30 — post-deploy dry-run test (no secrets printed)
set -euo pipefail

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE="${CLOUD_RUN_SERVICE:-growly-sales-daily30}"

gcloud config set project "$PROJECT"

CLOUD_RUN_URL="${CLOUD_RUN_URL:-$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --format='value(status.url)')}"

TOKEN=$(gcloud secrets versions access latest --secret=daily30-cloud-run-token --project="$PROJECT")
ID_TOKEN=$(gcloud auth print-identity-token)

HTTP_CODE=$(curl -sS -o /tmp/daily30-dry-run.json -w "%{http_code}" -X POST \
  "${CLOUD_RUN_URL}/api/cloud/daily30/auto-fetch" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -H "x-growly-daily30-token: ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"force":false}')

unset TOKEN

echo "HTTP $HTTP_CODE"
cat /tmp/daily30-dry-run.json
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  exit 1
fi

grep -q '"mode":"dry_run"' /tmp/daily30-dry-run.json || grep -q '"mode": "dry_run"' /tmp/daily30-dry-run.json

echo "Dry-run OK"
