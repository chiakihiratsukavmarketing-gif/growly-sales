@echo off
setlocal
for /f "delims=" %%p in ('gcloud secrets versions access latest --secret=unsubscribe-token-pepper --project=growly-scheduler') do set "UNSUBSCRIBE_TOKEN_PEPPER=%%p"
if "%STEP15_TEST_EMAIL%"=="" (
  echo STEP15_TEST_EMAIL is required
  exit /b 1
)
set "GROWLY_STORAGE_BACKEND=gcs"
set "GROWLY_GCS_BUCKET=growly-sales-daily30"
set "GROWLY_GCS_PREFIX=prod/growly-sales"
set "PUBLIC_BASE_URL=https://mailops.wantreach.jp"
cd /d "C:\Users\chiak\AI_\Growly Sales"
npx tsx src/growly-sales/scripts/run-growly-sales-mail-ops-step15-dry-run.ts %1
