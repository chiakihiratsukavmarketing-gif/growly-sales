#!/usr/bin/env bash
# Growly Sales mail-ops — deploy (DRY-RUN / design only)
# Does NOT grant public access, create secrets, or deploy without explicit confirm.
set -euo pipefail

if [[ "${GROWLY_MAIL_OPS_CONFIRM:-}" != "1" ]]; then
  echo "DRY-RUN: set GROWLY_MAIL_OPS_CONFIRM=1 to deploy growly-sales-mail-ops."
  echo "Service: growly-sales-mail-ops"
  echo "SA placeholder: growly-mail-ops-runner@<GCP_PROJECT>.iam.gserviceaccount.com"
  echo "Env names only: MAIL_OPS_MODE, GROWLY_STORAGE_BACKEND, GROWLY_GCS_BUCKET, GROWLY_GCS_PREFIX"
  echo "Secret names only: unsubscribe-token-pepper"
  exit 0
fi

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE="${MAIL_OPS_CLOUD_RUN_SERVICE:-growly-sales-mail-ops}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/growly-sales/growly-sales-mail-ops:latest"
SA="growly-mail-ops-runner@${PROJECT}.iam.gserviceaccount.com"

echo "Would deploy service=${SERVICE} image=${IMAGE} sa=${SA} region=${REGION}"
echo "min-instances=0 max-instances=2 concurrency=5 timeout=30"
echo "Aborting: Human Approval required before real deploy."
