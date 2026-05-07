"use client";

import { useSearchParams } from "next/navigation";
import AuthForm from "@/app/components/auth/AuthForm";
import { getSafeRedirectFrom } from "@/app/lib/authRedirect";

export default function SignupPageContent() {
  const searchParams = useSearchParams();
  const from = getSafeRedirectFrom(searchParams.get("from")) ?? "/";
  return <AuthForm mode="signup" redirectAfter={from} />;
}
