#!/usr/bin/env bash
# Growly Sales mail-ops — HTTPS Load Balancer (DRY-RUN / design reference)
# Human Approval: global external ALB + serverless NEG + Google-managed cert.
# Does NOT modify mixhost DNS. Applied 2026-07-08 — see §7.22 LIVE_READINESS.
set -euo pipefail

if [[ "${GROWLY_MAIL_OPS_CONFIRM:-}" != "1" ]]; then
  echo "DRY-RUN: set GROWLY_MAIL_OPS_CONFIRM=1 to apply LB resources."
  echo "Resources: growly-mail-ops-{ip,neg,backend,url-map,cert,https-proxy,forwarding-rule}"
  echo "Domain: mailops.wantreach.jp (DNS is human-only on mixhost)"
  exit 0
fi

PROJECT="${GCP_PROJECT:-growly-scheduler}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE="growly-sales-mail-ops"

gcloud config set project "$PROJECT"

# 1) Global static IP
gcloud compute addresses create growly-mail-ops-ip --global \
  --description="Growly mail-ops HTTPS LB static IP" || true

# 2) Serverless NEG
gcloud compute network-endpoint-groups create growly-mail-ops-neg \
  --region="$REGION" \
  --network-endpoint-type=serverless \
  --cloud-run-service="$SERVICE" || true

# 3) Backend service (external managed, no CDN, no Armor)
gcloud compute backend-services create growly-mail-ops-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --protocol=HTTP \
  --timeout=30 || true

gcloud compute backend-services add-backend growly-mail-ops-backend \
  --global \
  --network-endpoint-group=growly-mail-ops-neg \
  --network-endpoint-group-region="$REGION" || true

# 4) URL map — host mailops.wantreach.jp only
gcloud compute url-maps create growly-mail-ops-url-map \
  --global \
  --default-service=growly-mail-ops-backend || true

gcloud compute url-maps add-path-matcher growly-mail-ops-url-map \
  --global \
  --path-matcher-name=mail-ops-matcher \
  --default-service=growly-mail-ops-backend || true

gcloud compute url-maps add-host-rule growly-mail-ops-url-map \
  --global \
  --hosts=mailops.wantreach.jp \
  --path-matcher-name=mail-ops-matcher || true

# 5) Google-managed SSL certificate
gcloud compute ssl-certificates create growly-mail-ops-cert \
  --global \
  --domains=mailops.wantreach.jp || true

# 6) HTTPS proxy + forwarding rule (443 only)
gcloud compute target-https-proxies create growly-mail-ops-https-proxy \
  --global \
  --url-map=growly-mail-ops-url-map \
  --ssl-certificates=growly-mail-ops-cert || true

gcloud compute forwarding-rules create growly-mail-ops-forwarding-rule \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --network-tier=PREMIUM \
  --address=growly-mail-ops-ip \
  --target-https-proxy=growly-mail-ops-https-proxy \
  --ports=443 || true

IP=$(gcloud compute addresses describe growly-mail-ops-ip --global --format='value(address)')
echo "Reserved IP: $IP"
echo "Next: human adds mixhost A record mailops -> $IP (do not auto-run DNS)"
