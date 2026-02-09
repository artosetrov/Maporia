"use client";

import React from "react";

interface SectionErrorBoundaryState {
  hasError: boolean;
}

/**
 * Lightweight error boundary for individual page sections.
 * When a section crashes, it renders nothing instead of breaking the entire page.
 */
export class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode },
  SectionErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      console.error("[SectionErrorBoundary]", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // Silently hide crashed section
      return null;
    }
    return this.props.children;
  }
}
