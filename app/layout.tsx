import type { Metadata, Viewport } from "next";
import "./globals.css";
import GoogleMapsProvider from "./providers/GoogleMapsProvider";
import { ProductionDiagnostics } from "./components/ProductionDiagnostics";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PremiumModalProvider } from "./contexts/PremiumModalContext";

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
      <body className="antialiased">
        <ErrorBoundary>
          {process.env.NODE_ENV === "production" && (
            <ProductionDiagnostics />
          )}
          <PremiumModalProvider>
            <GoogleMapsProvider>
              {children}
            </GoogleMapsProvider>
          </PremiumModalProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
