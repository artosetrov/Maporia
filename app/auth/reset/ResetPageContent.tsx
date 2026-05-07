"use client";

import { useSearchParams } from "next/navigation";
import AuthForm from "@/app/components/auth/AuthForm";
import { getSafeRedirectFrom } from "@/app/lib/authRedirect";

export default function ResetPageContent() {
  const searchParams = useSearchParams();
  const from = getSafeRedirectFrom(searchParams.get("from")) ?? "/";
  return <AuthForm mode="reset" redirectAfter={from} />;
}
