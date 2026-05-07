import type { Metadata } from "next";
import { Suspense } from "react";
import ResetPageContent from "./ResetPageContent";

export const metadata: Metadata = {
  title: "Reset password — Maporia",
  description: "Request a password reset email.",
};

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetPageContent />
    </Suspense>
  );
}
