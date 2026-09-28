import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ermes",
  description: "Self-hosted email marketing and automation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
