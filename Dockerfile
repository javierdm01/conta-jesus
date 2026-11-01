FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost/build BETTER_AUTH_URL=http://localhost:3000 BETTER_AUTH_SECRET=build-only-secret-not-used-at-runtime-123456 NEXT_TELEMETRY_DISABLED=1 npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng poppler-utils python3-opencv && rm -rf /var/lib/apt/lists/*
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --chown=node:node package*.json next.config.ts tsconfig.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node src ./src
COPY --chown=node:node worker ./worker
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node tests ./tests
RUN mkdir -p /app/data/documents && chown -R node:node /app/data
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DOCUMENT_DIR=/app/data/documents
EXPOSE 3000
CMD ["node","node_modules/next/dist/bin/next","start","--hostname","0.0.0.0"]
