import type { Metadata } from "next";
import { Suspense } from "react";
import UpdatePasswordPageContent from "./UpdatePasswordPageContent";

export const metadata: Metadata = {
  title: "Set new password — Maporia",
  description: "Choose a new password for your account.",
};

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordPageContent />
    </Suspense>
  );
}
