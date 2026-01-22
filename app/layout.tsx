import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import GoogleMapsProvider from "./providers/GoogleMapsProvider";
import { ProductionDiagnostics } from "./components/ProductionDiagnostics";
import { ErrorBoundary } from "./components/ErrorBoundary";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Maporia",
  description: "Places locals love",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover", // Enables safe-area-inset support
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${fraunces.variable} ${manrope.variable} antialiased`}
      >
        <ErrorBoundary>
          <ProductionDiagnostics />
          <GoogleMapsProvider>
            {children}
          </GoogleMapsProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
