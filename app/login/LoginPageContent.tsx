"use client";

import { useSearchParams } from "next/navigation";
import AuthForm from "@/app/components/auth/AuthForm";
import { getSafeRedirectFrom } from "@/app/lib/authRedirect";

export default function LoginPageContent() {
  const searchParams = useSearchParams();
  const from = getSafeRedirectFrom(searchParams.get("from")) ?? "/";
  const method = searchParams.get("method") === "password" ? "password" : "passwordless";
  return <AuthForm mode="login" redirectAfter={from} initialMethod={method} />;
}
