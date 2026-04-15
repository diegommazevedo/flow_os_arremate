import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest:    "public",
  // Desligado também em produção: SW + cacheOnFrontEndNav serviam chunks de build antigo na navegação por <Link>.
  disable: true,
  cacheOnFrontEndNav: true,
  cacheStartUrl:      true,
});

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config, { isServer }) => {
    if (isServer) {
      const ext = config.externals;
      config.externals = [
        ...(Array.isArray(ext) ? ext : ext != null ? [ext] : []),
        "playwright",
        "playwright-core",
        "electron",
        /^chromium-bidi(\/.*)?$/,
      ];
    }
    return config;
  },
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
    "electron",
    "otplib",
    "bullmq",
    "ioredis",
  ],
};

export default withPWA(nextConfig);