import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest:    "public",
  disable: process.env["NODE_ENV"] === "development",
  // Cacheia rotas do portal do cliente offline
  cacheOnFrontEndNav: true,
  cacheStartUrl:      true,
});

const nextConfig: NextConfig = {
  // @flow-os/brain usa Playwright — NÃO pode ser transpilado pelo Webpack.
  // Os outros pacotes precisam de transpile para funcionar no App Router.
  transpilePackages: [
    "@flow-os/core",
    "@flow-os/db",
    "@flow-os/templates",
  ],
  // Pacotes que usam binários nativos ou módulos Node.js incompatíveis com Webpack.
  // Next.js os carrega via require() em runtime, sem bundlear.
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "@flow-os/brain",
    "playwright",
    "playwright-core",
    "chromium-bidi",
    "@playwright/test",
    "otplib",
    "bullmq",
    "ioredis",
  ],
};

export default withPWA(nextConfig);
