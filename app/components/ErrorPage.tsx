"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";
import ErrorIllustration from "./ErrorIllustration";

interface ErrorPageProps {
  error?: Error | null;
  statusCode?: number;
  title?: string;
  message?: string;
}

/**
 * Beautiful error page component in Maporia branding style
 * Supports both error boundaries and 404 pages
 */
export default function ErrorPage({
  error,
  statusCode = 500,
  title,
  message,
}: ErrorPageProps) {
  const router = useRouter();
  const is404 = statusCode === 404;
  const displayTitle = title || (is404 ? "Page not found" : "Something went wrong");
  const displayMessage =
    message ||
    error?.message ||
    (is404
      ? "The page you're looking for doesn't exist or has been moved."
      : "An unexpected error occurred. Please try again.");

  const illustrationVariant = is404 ? "404" : statusCode;

  return (
    <main className="min-h-screen bg-[var(--warm-white)] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8 flex justify-center">
          <ErrorIllustration
            variant={illustrationVariant}
            size={220}
            className="text-[var(--olive-primary)]"
          />
        </div>

        <h1 className="font-fraunces text-4xl lg:text-5xl font-semibold text-[var(--text-primary)] mb-4">
          {displayTitle}
        </h1>

        <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
          {displayMessage}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-white border-2 border-[var(--border-light)] text-[var(--text-primary)] rounded-full hover:border-[var(--olive-primary)] transition-all duration-200 flex items-center gap-2 font-medium"
          >
            <Icon name="back" size={20} className="text-[var(--olive-primary)]" />
            Go back
          </button>

          <Link
            href="/"
            className="px-6 py-3 bg-[var(--olive-primary)] text-white rounded-full hover:opacity-90 transition-all duration-200 flex items-center gap-2 font-medium"
          >
            <Icon name="map" size={20} className="text-white" />
            Go home
          </Link>

          {!is404 && (
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white border-2 border-[var(--border-light)] text-[var(--text-primary)] rounded-full hover:border-[var(--olive-primary)] transition-all duration-200 flex items-center gap-2 font-medium"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--olive-primary)]"
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Reload page
            </button>
          )}
        </div>

        <p className="mt-8 text-sm text-[var(--text-muted)]">
          If this problem persists, please{" "}
          <a
            href="mailto:support@maporia.com"
            className="text-[var(--olive-primary)] hover:underline"
          >
            contact support
          </a>
        </p>
      </div>
    </main>
  );
}
