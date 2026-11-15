import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1420" };

export const metadata: Metadata = {
  title: "Verdict Earth | The Planet Under Investigation",
  applicationName: "Verdict Earth",
  description: "Explore NASA surface temperature anomalies and local air temperature. Compare records and test how the evidence changes with the analysis period.",
  openGraph: {
    type: "website",
    title: "Verdict Earth | The Planet Under Investigation",
    description: "Explore NASA GISTEMP anomalies, NASA POWER air temperature, and the evidence behind fitted temperature trends.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
