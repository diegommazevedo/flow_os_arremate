import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "FlowOS Vistoria",
  description: "Formulário de vistoria de campo",
  manifest: "/vistoria/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vistoria",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0d0e11",
};

export default function VistoriaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#0d0e11",
          color: "#F0F0F5",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          minHeight: "100dvh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
