import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import GoogleMapsProvider from "./providers/GoogleMapsProvider";
import { ProductionDiagnostics } from "./components/ProductionDiagnostics";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PremiumModalProvider } from "./contexts/PremiumModalContext";
import { UserAccessProvider } from "./contexts/UserAccessContext";
import GlobalModals from "./components/GlobalModals";
import ImpersonationBanner from "./components/ImpersonationBanner";
import AnalyticsTracker from "./components/AnalyticsTracker";

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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ErrorBoundary>
          {process.env.NODE_ENV === "production" && (
            <ProductionDiagnostics />
          )}
          {/* Impersonation banner — показывается серверно, только когда есть cookie. */}
          <ImpersonationBanner />
          <PremiumModalProvider>
            <UserAccessProvider requireAuth={false}>
              <GoogleMapsProvider>
                {children}
              </GoogleMapsProvider>
              <GlobalModals />
              {/* Page-view tracker. Suspense нужен из-за useSearchParams. */}
              <Suspense fallback={null}>
                <AnalyticsTracker />
              </Suspense>
            </UserAccessProvider>
          </PremiumModalProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
