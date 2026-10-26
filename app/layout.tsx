import type { Metadata, Viewport } from "next";
import { Roboto_Flex } from "next/font/google";
import "./globals.css";

/* Google's variable UI font, self-hosted at build time (Google Sans itself is not publicly licensed). */
const robotoFlex = Roboto_Flex({ subsets: ["latin", "latin-ext"], variable: "--font-roboto-flex", display: "swap" });

export const metadata: Metadata = { title: "Q7 Chat", description: "Private messaging with 72-hour message expiry.", icons: { icon: "/logo.svg" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${robotoFlex.variable} font-sans`}>{children}</body>
    </html>
  );
}
