FROM node:22-alpine
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9.12.0
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/core/package.json ./packages/core/
COPY packages/brain/package.json ./packages/brain/
COPY packages/templates/package.json ./packages/templates/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN ./packages/db/node_modules/.bin/prisma generate --schema=./packages/db/prisma/schema.prisma
WORKDIR /app/apps/web
RUN pnpm build

# Invalidar cache a partir daqui: sem isto, alterações só nos RUN cp abaixo podem não correr
# se o Railway/Docker reutilizar a layer do `pnpm build`. No Railway: Build → variável de build
# `CACHE_BUST` (ex. 2) ou "Clear Build Cache" antes do deploy.
ARG CACHE_BUST=1
RUN echo "standalone-copy-cache-bust=${CACHE_BUST}"

# Standalone não rastreia @flow-os/brain (webpackIgnore no instrumentation) — copiar
# o pacote fonte + Playwright para node_modules do output, e arrancar o servidor com
# `tsx` para resolver .ts em runtime (até existir build dist dedicado do brain).
ENV STANDALONE_ROOT=/app/apps/web/.next/standalone
RUN mkdir -p "${STANDALONE_ROOT}/node_modules/@flow-os" && \
    rm -rf "${STANDALONE_ROOT}/node_modules/@flow-os/brain" && \
    cp -a /app/packages/brain "${STANDALONE_ROOT}/node_modules/@flow-os/brain"
# O NFT (outputFileTracingIncludes) pode deixar `standalone/packages/brain` parcial; o runtime/tsx
# resolve `./workers/email-sync` a partir desse prefixo → Cannot find module …/packages/brain/…
# Sobrescrever com a árvore fonte completa + pacotes workspace que os workers importam por nome.
RUN mkdir -p "${STANDALONE_ROOT}/packages" && \
    rm -rf "${STANDALONE_ROOT}/packages/brain" \
           "${STANDALONE_ROOT}/packages/core" \
           "${STANDALONE_ROOT}/packages/db" \
           "${STANDALONE_ROOT}/packages/templates" && \
    cp -a /app/packages/brain "${STANDALONE_ROOT}/packages/brain" && \
    cp -a /app/packages/core "${STANDALONE_ROOT}/packages/core" && \
    cp -a /app/packages/db "${STANDALONE_ROOT}/packages/db" && \
    cp -a /app/packages/templates "${STANDALONE_ROOT}/packages/templates"
# Playwright: em pnpm, entradas em /app/node_modules são symlinks — copiar só a árvore real em .pnpm
RUN mkdir -p "${STANDALONE_ROOT}/node_modules" && \
    for d in /app/node_modules/.pnpm/playwright@*/node_modules/playwright; do \
      [ -d "$d" ] && cp -a "$d" "${STANDALONE_ROOT}/node_modules/" && break; \
    done && \
    for d in /app/node_modules/.pnpm/playwright-core@*/node_modules/playwright-core; do \
      [ -d "$d" ] && cp -a "$d" "${STANDALONE_ROOT}/node_modules/" && break; \
    done || true

RUN cp -r /app/apps/web/.next/static /app/apps/web/.next/standalone/apps/web/.next/static
RUN cp -r /app/apps/web/public /app/apps/web/.next/standalone/apps/web/public
RUN mkdir -p /app/apps/web/.next/standalone/apps/web/.next/server/.prisma/client && \
    cp -r /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/. \
    /app/apps/web/.next/standalone/apps/web/.next/server/.prisma/client/ && \
    mkdir -p /app/apps/web/.next/standalone/apps/web/.prisma/client && \
    cp -r /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/. \
    /app/apps/web/.next/standalone/apps/web/.prisma/client/
EXPOSE 3000
ENV NODE_OPTIONS="--import tsx"
CMD ["node", "/app/apps/web/.next/standalone/apps/web/server.js"]
