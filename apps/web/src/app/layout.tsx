import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "FlowOS v4",
    template: "%s — FlowOS",
  },
  description: "O sistema operacional para o seu negócio. Núcleo imutável, templates infinitos.",
  manifest: "/manifest.json",
  icons: {
    icon:     "/icons/icon.svg",
    shortcut: "/icons/icon.svg",
    apple:    "/icons/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
