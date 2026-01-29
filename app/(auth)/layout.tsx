"use client";

import { UserAccessProvider } from "@/app/contexts/UserAccessContext";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserAccessProvider requireAuth={true}>
      {children}
    </UserAccessProvider>
  );
}
