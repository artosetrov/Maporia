import type { Metadata } from "next";
import { Suspense } from "react";
import LoginPageContent from "./LoginPageContent";
import { ErrorBoundary } from "../components/ErrorBoundary";

export const metadata: Metadata = {
  title: "Log in or sign up — Maporia",
  description: "Log in or sign up for Maporia.",
};

export default function LoginPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<AuthSkeleton />}>
        <LoginPageContent />
      </Suspense>
    </ErrorBoundary>
  );
}

function AuthSkeleton() {
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-3xl bg-white border border-[#ECEEE4] p-8 animate-pulse"
        style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
      >
        <div className="h-8 w-32 bg-[#ECEEE4] rounded mb-6" />
        <div className="h-6 w-40 bg-[#ECEEE4] rounded mb-2" />
        <div className="h-4 w-56 bg-[#ECEEE4] rounded mb-6" />
        <div className="h-11 bg-[#ECEEE4] rounded-xl mb-3" />
        <div className="h-11 bg-[#ECEEE4] rounded-xl" />
      </div>
    </main>
  );
}
