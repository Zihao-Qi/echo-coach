import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echo Coach",
  description: "Practice behavioral, software engineering, and AI/ML interview answers, get specific feedback, and try again.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
