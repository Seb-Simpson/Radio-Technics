import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: { default: "Radio Technics", template: "%s · Radio Technics" },
  description: "Studio explorer and troubleshooting assistant for radio presenters (prototype).",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Radio Technics", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Use the full screen on notched phones; safe-area insets are applied in the layout.
  viewportFit: "cover",
  // Resize the layout (not just overlay it) when the on-screen keyboard opens, where supported.
  interactiveWidget: "resizes-content",
  themeColor: "#0b0e10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
