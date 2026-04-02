import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// DM Sans is Bond's single typeface — used for everything:
// display headings, body text, labels, and eyebrows.
// Loaded once here via Next.js font optimiser (self-hosted, no Google Fonts request at runtime).
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Bond",
  description: "A private space for two people to communicate better.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${dmSans.variable}`}
    >
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
