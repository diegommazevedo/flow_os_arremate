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
RUN cp -r /app/apps/web/.next/static /app/apps/web/.next/standalone/apps/web/.next/static
RUN cp -r /app/apps/web/public /app/apps/web/.next/standalone/apps/web/public
RUN mkdir -p /app/apps/web/.next/standalone/apps/web/.next/server/.prisma/client && \
    cp -r /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/. \
    /app/apps/web/.next/standalone/apps/web/.next/server/.prisma/client/ && \
    mkdir -p /app/apps/web/.next/standalone/apps/web/.prisma/client && \
    cp -r /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/. \
    /app/apps/web/.next/standalone/apps/web/.prisma/client/
EXPOSE 3000
CMD ["node", "/app/apps/web/.next/standalone/apps/web/server.js"]