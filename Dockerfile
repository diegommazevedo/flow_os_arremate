FROM node:22-alpine

RUN npm install -g pnpm@9.12.0

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY apps/web/ ./apps/web/

RUN pnpm --filter @flow-os/web exec prisma generate --schema=./prisma/schema.prisma

WORKDIR /app/apps/web

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]