#!/usr/bin/env bash
# Growly Sales Daily 30 — GCS bucket (private, versioning recommended)
set -euo pipefail

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
BUCKET="${GCS_BUCKET:-growly-sales-daily30}"

gcloud config set project "$PROJECT"

if gcloud storage buckets describe "gs://${BUCKET}" --project="$PROJECT" 2>/dev/null; then
  echo "Bucket gs://${BUCKET} already exists"
else
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="$PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

gcloud storage buckets update "gs://${BUCKET}" --versioning --project="$PROJECT"

echo "Objects:"
echo "  gs://${BUCKET}/prod/growly-sales/external-candidates.json"
echo "  gs://${BUCKET}/prod/growly-sales/daily30-cloud-run-state.json"
