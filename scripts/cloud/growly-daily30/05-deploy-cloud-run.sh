#!/usr/bin/env bash
# Growly Sales Daily 30 — docker build, push, Cloud Run deploy
set -euo pipefail

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE="${CLOUD_RUN_SERVICE:-growly-sales-daily30}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/growly-sales/growly-sales-daily30:latest"
SA="growly-daily30-runner@${PROJECT}.iam.gserviceaccount.com"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

gcloud config set project "$PROJECT"

cd "$REPO_ROOT"
docker build -t "$IMAGE" .
docker push "$IMAGE"

gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --service-account="$SA" \
  --port=8080 \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=1 \
  --timeout=900 \
  --no-allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,API_PRODUCTION_ENABLED=true,GROWLY_STORAGE_BACKEND=gcs,GROWLY_GCS_BUCKET=growly-sales-daily30,GROWLY_GCS_PREFIX=prod/growly-sales,GROWLY_CLOUD_SCHEDULER_CONFIGURED=true" \
  --set-secrets="DAILY30_CLOUD_RUN_TOKEN=daily30-cloud-run-token:latest,GOOGLE_PLACES_API_KEY=google-places-api-key:latest"

CLOUD_RUN_URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --format='value(status.url)')

echo "Deployed: $CLOUD_RUN_URL"
echo "Export: CLOUD_RUN_URL=$CLOUD_RUN_URL"
