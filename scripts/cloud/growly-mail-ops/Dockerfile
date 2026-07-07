# Growly Sales mail-ops — slim Cloud Run image (Phase 44.1)
# Build context: repository root (see scripts/cloud/growly-mail-ops/02-build.sh)
# Secrets are NOT baked in — inject via Cloud Run env / Secret Manager.

FROM node:20-slim

RUN groupadd --gid 1001 growly \
  && useradd --uid 1001 --gid growly --shell /usr/sbin/nologin --create-home growly

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/growly-sales ./src/growly-sales
COPY config ./config

ENV NODE_ENV=production
ENV PORT=8080

USER growly
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npx", "tsx", "src/growly-sales/scripts/run-growly-sales-mail-ops.ts"]
