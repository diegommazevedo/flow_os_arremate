import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest:    "public",
  disable: process.env["NODE_ENV"] === "development",
  cacheOnFrontEndNav: true,
  cacheStartUrl:      true,
});

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icons/icon.svg", permanent: false }];
  },
  transpilePackages: [
    "@flow-os/core",
    "@flow-os/db",
    "@flow-os/templates",
  ],
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