#!/usr/bin/env bash
# Growly Sales mail-ops — build image (DRY-RUN / design only)
set -euo pipefail

if [[ "${GROWLY_MAIL_OPS_CONFIRM:-}" != "1" ]]; then
  echo "DRY-RUN: set GROWLY_MAIL_OPS_CONFIRM=1 to build and push."
  echo "Image tag placeholder: <REGION>-docker.pkg.dev/<GCP_PROJECT>/growly-sales/growly-sales-mail-ops:latest"
  exit 0
fi

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/growly-sales/growly-sales-mail-ops:latest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"
docker build -f scripts/cloud/growly-mail-ops/Dockerfile -t "$IMAGE" .
echo "Built: $IMAGE (push not performed unless 03-deploy.sh with CONFIRM)"
