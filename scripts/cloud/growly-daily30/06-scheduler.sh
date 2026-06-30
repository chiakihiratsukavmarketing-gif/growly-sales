#!/usr/bin/env bash
# Growly Sales Daily 30 — Cloud Scheduler job (9:00 JST)
set -euo pipefail

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE="${CLOUD_RUN_SERVICE:-growly-sales-daily30}"
JOB="${SCHEDULER_JOB:-growly-daily30-auto-fetch-9am}"
SA="growly-daily30-runner@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT"

CLOUD_RUN_URL="${CLOUD_RUN_URL:-$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --format='value(status.url)')}"

gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="serviceAccount:${SA}" \
  --role="roles/run.invoker" \
  --project="$PROJECT" \
  --quiet

TOKEN=$(gcloud secrets versions access latest --secret=daily30-cloud-run-token --project="$PROJECT")

if gcloud scheduler jobs describe "$JOB" --location="$REGION" --project="$PROJECT" 2>/dev/null; then
  gcloud scheduler jobs update http "$JOB" \
    --location="$REGION" \
    --schedule="0 9 * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="${CLOUD_RUN_URL}/api/cloud/daily30/auto-fetch" \
    --http-method=POST \
    --headers="Content-Type=application/json,x-growly-daily30-token=${TOKEN}" \
    --message-body='{"dryRun":false,"force":false}' \
    --oidc-service-account-email="$SA" \
    --oidc-token-audience="${CLOUD_RUN_URL}" \
    --project="$PROJECT"
else
  gcloud scheduler jobs create http "$JOB" \
    --location="$REGION" \
    --schedule="0 9 * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="${CLOUD_RUN_URL}/api/cloud/daily30/auto-fetch" \
    --http-method=POST \
    --headers="Content-Type=application/json,x-growly-daily30-token=${TOKEN}" \
    --message-body='{"dryRun":false,"force":false}' \
    --oidc-service-account-email="$SA" \
    --oidc-token-audience="${CLOUD_RUN_URL}" \
    --project="$PROJECT"
fi

unset TOKEN

echo "Scheduler job $JOB configured for ${CLOUD_RUN_URL}/api/cloud/daily30/auto-fetch"
echo "Manual test: gcloud scheduler jobs run $JOB --location=$REGION --project=$PROJECT"
