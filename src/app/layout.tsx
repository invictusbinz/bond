import type { Metadata } from "next";
import "./globals.css";

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
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
