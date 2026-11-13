import type { Metadata } from "next";
import { LegacyCoachBoundary } from "../providers/LegacyCoachBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echo Coach",
  description: "Live interview expression coach for spoken grammar, phrasing, and professional answers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <LegacyCoachBoundary>{children}</LegacyCoachBoundary>
      </body>
    </html>
  );
}
