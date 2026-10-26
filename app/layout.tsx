import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Q7 Chat", description: "Private messaging with 72-hour message expiry.", icons: { icon: "/logo.svg" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="font-sans">{children}</body>
    </html>
  );
}
