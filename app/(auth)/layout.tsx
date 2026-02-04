"use client";

import { RequireAuth } from "@/app/contexts/UserAccessContext";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
