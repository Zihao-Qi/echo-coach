import type { Metadata } from "next";
import { Inter, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", adjustFontFallback: false, variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], display: "swap", adjustFontFallback: false, variable: "--font-outfit" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", adjustFontFallback: false, variable: "--font-plus-jakarta-sans" });

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
    <html lang="en" className={`${outfit.variable} ${jakarta.variable} ${inter.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
