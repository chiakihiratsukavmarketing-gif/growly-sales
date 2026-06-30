#!/usr/bin/env bash
# Growly Sales Daily 30 — service account & IAM (no Gmail permissions)
set -euo pipefail

PROJECT="${GCP_PROJECT:-growly-scheduler}"
SA_ID="${SA_ID:-growly-daily30-runner}"
SA_EMAIL="${SA_ID}@${PROJECT}.iam.gserviceaccount.com"
BUCKET="${GCS_BUCKET:-growly-sales-daily30}"

gcloud config set project "$PROJECT"

if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" 2>/dev/null; then
  echo "Service account $SA_EMAIL already exists"
else
  gcloud iam service-accounts create "$SA_ID" \
    --display-name="Growly Daily 30 Cloud Run runner" \
    --project="$PROJECT"
fi

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectUser" \
  --project="$PROJECT"

for SEC in daily30-cloud-run-token google-places-api-key; do
  if gcloud secrets describe "$SEC" --project="$PROJECT" 2>/dev/null; then
    gcloud secrets add-iam-policy-binding "$SEC" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$PROJECT"
  else
    echo "WARN: Secret $SEC not found — create manually before deploy"
  fi
done

echo "Service account ready: $SA_EMAIL"
