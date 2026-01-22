"use client";

import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error | null }>;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development, silent in production
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error} />;
      }
      return <DefaultErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

function DefaultErrorFallback({ error }: { error: Error | null }) {
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-2xl font-semibold text-[#1F2A1F] mb-2">
          Something went wrong
        </div>
        <div className="text-sm text-[#6F7A5A] mb-4">
          {error?.message || "An unexpected error occurred"}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-[#8F9E4F] text-white rounded-lg hover:bg-[#7A8A3F] transition"
        >
          Reload page
        </button>
      </div>
    </main>
  );
}
