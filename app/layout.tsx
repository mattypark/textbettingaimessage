import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/* Inter is only the last fallback in --font-round (system rounded faces come first). */
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  applicationName: "Mushy",
  title: { default: "Mushy — bets in your group chat", template: "%s · Mushy" },
  description: "Add one number to your group chat. Text it a bet, everyone 👍 to lock it, send proof in the thread, it calls it. Points, not money.",
  openGraph: { type: "website", siteName: "Mushy" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#04a6e8" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
