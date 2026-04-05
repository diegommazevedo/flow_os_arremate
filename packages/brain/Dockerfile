FROM node:20-slim

# Playwright deps (para PDF + RPA headless)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Instalar dependências
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/brain/package.json  ./packages/brain/
COPY packages/core/package.json   ./packages/core/
COPY packages/db/package.json     ./packages/db/

RUN corepack enable && pnpm install --frozen-lockfile --filter @flow-os/brain...

# Copiar código
COPY packages/ ./packages/

# Gerar Prisma client
RUN pnpm --filter @flow-os/db exec prisma generate

CMD ["node", "--loader", "tsx/esm", "packages/brain/src/worker-entrypoint.ts"]
