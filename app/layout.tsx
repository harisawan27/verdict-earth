import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verdict Earth | Sindh Temperature Trends",
  applicationName: "Verdict Earth",
  description: "Investigate temperature trends across Sindh and test how the estimates change with method and period.",
  openGraph: {
    type: "website",
    title: "Verdict Earth | Sindh Temperature Trends",
    description: "Investigate real NASA temperature series across Sindh and test how the trend changes with the analysis period and assumptions.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
