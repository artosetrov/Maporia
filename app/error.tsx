"use client";

import { useEffect } from "react";
import ErrorIllustration from "./components/ErrorIllustration";

/**
 * Next.js error.tsx - Global error handler for the app router
 * Beautiful error page in Maporia branding style
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Global error:", error);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--warm-white)] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8 flex justify-center">
          <ErrorIllustration variant="error" size={220} className="text-[var(--olive-primary)]" />
        </div>

        {/* Title */}
        <h1 className="font-fraunces text-4xl lg:text-5xl font-semibold text-[var(--text-primary)] mb-4">
          Something went wrong
        </h1>

        <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-[var(--olive-primary)] text-white rounded-full hover:opacity-90 transition-all duration-200 font-medium"
          >
            Try again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="px-6 py-3 bg-white border-2 border-[var(--border-light)] text-[var(--text-primary)] rounded-full hover:border-[var(--olive-primary)] transition-all duration-200 font-medium"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
