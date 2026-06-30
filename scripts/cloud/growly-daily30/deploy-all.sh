#!/usr/bin/env bash
# Growly Sales Daily 30 — full Cloud deploy pipeline (run in Cloud Shell)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Phase 29: Growly Daily 30 Cloud deploy ==="
echo "Project: ${GCP_PROJECT:-growly-scheduler}"
echo ""
echo "Prerequisites:"
echo "  1. Secrets daily30-cloud-run-token and google-places-api-key must exist"
echo "  2. Docker must be available (Cloud Shell OK)"
echo ""

bash "$SCRIPT_DIR/01-enable-apis.sh"
bash "$SCRIPT_DIR/02-artifact-registry.sh"
bash "$SCRIPT_DIR/03-gcs-bucket.sh"
bash "$SCRIPT_DIR/04-service-account.sh"
bash "$SCRIPT_DIR/05-deploy-cloud-run.sh"
bash "$SCRIPT_DIR/06-scheduler.sh"
bash "$SCRIPT_DIR/07-dry-run-test.sh"

echo ""
echo "=== Deploy complete ==="
echo "Next: gcloud scheduler jobs run growly-daily30-auto-fetch-9am --location=asia-northeast1"
