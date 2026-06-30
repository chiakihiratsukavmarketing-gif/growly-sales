# Growly Sales — Cloud Run Daily 30 API server (Phase 28)
# Secrets (.env, credentials, tokens) are NOT included — inject via Cloud Run env / Secret Manager.

FROM node:20-slim

WORKDIR /app

# Install dependencies (includes tsx for runtime)
COPY package.json package-lock.json* ./
RUN npm ci

# Application source (excludes secrets via .dockerignore)
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY config ./config

# Build UI static assets for uiServer
RUN npm run growly-sales:ui:build

ENV NODE_ENV=production
# Cloud Run sets PORT; uiServer reads PORT then GROWLY_UI_PORT
ENV GROWLY_STORAGE_BACKEND=gcs

EXPOSE 8080

CMD ["npx", "tsx", "src/growly-sales/scripts/run-growly-sales-ui.ts"]
