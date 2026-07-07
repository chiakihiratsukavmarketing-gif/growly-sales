#!/usr/bin/env bash
# Growly Sales mail-ops — prepare (DRY-RUN / design only)
# Does NOT create IAM, secrets, or Cloud Run resources.
set -euo pipefail

if [[ "${GROWLY_MAIL_OPS_CONFIRM:-}" != "1" ]]; then
  echo "DRY-RUN: set GROWLY_MAIL_OPS_CONFIRM=1 to run prepare steps."
  echo "Planned: enable APIs (run, artifactregistry, secretmanager, storage) in project <GCP_PROJECT>"
  exit 0
fi

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
SA_ID="${MAIL_OPS_SA_ID:-growly-mail-ops-runner}"

echo "Would prepare mail-ops in project=${PROJECT} region=${REGION} sa=${SA_ID}"
echo "No IAM or Secret changes are performed by this draft script."
