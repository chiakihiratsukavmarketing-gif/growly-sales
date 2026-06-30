#!/usr/bin/env bash
# Growly Sales Daily 30 — Artifact Registry repository
set -euo pipefail

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
REPO="${ARTIFACT_REPO:-growly-sales}"

gcloud config set project "$PROJECT"

if gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$PROJECT" 2>/dev/null; then
  echo "Repository $REPO already exists"
else
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Growly Sales Daily 30 images" \
    --project="$PROJECT"
fi

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "Image URI: ${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/growly-sales-daily30:latest"
