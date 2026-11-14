import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1420" };

export const metadata: Metadata = {
  title: "Verdict Earth | The Planet Under Investigation",
  applicationName: "Verdict Earth",
  description: "Investigate NASA temperature records from six continents and test how the estimates change with method and period.",
  openGraph: {
    type: "website",
    title: "Verdict Earth | The Planet Under Investigation",
    description: "Investigate real NASA temperature series across six continents and test how the trend changes with the analysis period and assumptions.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
