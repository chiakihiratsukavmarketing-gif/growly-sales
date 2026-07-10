#!/usr/bin/env bash
# Growly Sales mail-ops — Cloud Armor (DRY-RUN / design reference)
# Human Approval A1 (2026-07-10): preview-only rate limit on /u/* via HTTPS LB backend.
# Does NOT enforce rules, change Cloud Run env, or touch GCS suppressions.
set -euo pipefail

if [[ "${GROWLY_MAIL_OPS_CONFIRM:-}" != "1" ]]; then
  echo "DRY-RUN: set GROWLY_MAIL_OPS_CONFIRM=1 to apply Cloud Armor resources."
  echo "Policy: growly-mail-ops-armor"
  echo "Backend: growly-mail-ops-backend (global EXTERNAL_MANAGED)"
  echo "Rules: priority 100 /health allow; 1000 /u/* throttle 60 req/60s/IP preview deny-429; default allow"
  echo "Initial mode: preview on rate-limit rule only (NOT enforce)"
  exit 0
fi

PROJECT="${GCP_PROJECT:-growly-scheduler}"
POLICY="growly-mail-ops-armor"
BACKEND="growly-mail-ops-backend"

gcloud config set project "$PROJECT"

gcloud compute security-policies create "$POLICY" \
  --description="Growly mail-ops rate limit for /u/* (preview)" || true

gcloud compute security-policies rules create 100 \
  --security-policy="$POLICY" \
  --expression="request.path == '/health'" \
  --action=allow \
  --description="Allow health checks without rate limit" || true

gcloud compute security-policies rules create 1000 \
  --security-policy="$POLICY" \
  --expression="request.path.startsWith('/u/')" \
  --action=throttle \
  --rate-limit-threshold-count=60 \
  --rate-limit-threshold-interval-sec=60 \
  --conform-action=allow \
  --exceed-action=deny-429 \
  --enforce-on-key=IP \
  --preview \
  --description="Rate limit /u/* 60 req per min per IP (preview)" || true

gcloud compute backend-services update "$BACKEND" \
  --global \
  --security-policy="$POLICY"

echo "Attached $POLICY to $BACKEND"
echo "Verify: gcloud compute security-policies describe $POLICY"
echo "Smoke: curl -s -o /dev/null -w '%{http_code}' https://mailops.wantreach.jp/health"
