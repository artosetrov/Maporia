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
  metadataBase: new URL("https://www.maporia.co"),
  applicationName: "Maporia",
  title: {
    default: "Maporia",
    template: "%s | Maporia",
  },
  description: "Places locals love",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Maporia",
    title: "Maporia",
    description: "Places locals love",
    images: [
      {
        url: "/maporia-social-preview.jpg",
        width: 2571,
        height: 1350,
        alt: "Maporia - Places locals love",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Maporia",
    description: "Places locals love",
    images: ["/maporia-social-preview.jpg"],
  },
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
