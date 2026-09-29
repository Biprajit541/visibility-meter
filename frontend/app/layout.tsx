import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Fail-Closed AI Visibility Meter",
  description: "LLM as witness, code as judge.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
