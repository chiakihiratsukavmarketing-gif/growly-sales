#!/usr/bin/env bash
# Growly Sales Daily 30 — enable required GCP APIs
set -euo pipefail

PROJECT="${GCP_PROJECT:-growly-scheduler}"

gcloud config set project "$PROJECT"

gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT"

echo "APIs enabled for project: $PROJECT"
