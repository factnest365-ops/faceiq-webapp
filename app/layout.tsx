import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "FaceIQ Labs - web app",
  description: "FaceIQ Labs-style measurement-based facial analysis and scoring. On-device, evidence-sourced (v1).",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

export const dynamic = "force-dynamic";
