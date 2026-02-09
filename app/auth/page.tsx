"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, getAuthRedirectUrl } from "../lib/supabase";
import { getSafeRedirectFrom, getAuthUrl } from "../lib/authRedirect";
import Icon from "../components/Icon";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

function AuthPageFallback() {
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[#ECEEE4] p-8 animate-pulse" style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
        <div className="h-8 w-8 rounded-full bg-[#ECEEE4] ml-auto mb-6" />
        <div className="h-6 bg-[#ECEEE4] rounded w-32 mb-2" />
        <div className="h-4 bg-[#ECEEE4] rounded w-48 mb-6" />
        <div className="h-11 bg-[#ECEEE4] rounded-full mb-4" />
        <div className="h-11 bg-[#ECEEE4] rounded-xl mb-4" />
      </div>
    </main>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const originalOriginRef = useRef<string | null>(null);
  const redirectBack = getSafeRedirectFrom(searchParams.get("from"));

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  // Store original origin on mount to prevent redirects to production
  useEffect(() => {
    if (typeof window !== 'undefined' && !originalOriginRef.current) {
      originalOriginRef.current = window.location.origin;
      console.log('[Auth] Stored original origin:', originalOriginRef.current);
      
      // Intercept any navigation attempts that might redirect to production
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        const target = (e.target as Window)?.location?.href;
        if (target && !target.startsWith(originalOriginRef.current || '')) {
          console.warn('[Auth] Intercepted navigation to different origin:', target);
        }
      };
      
      // Monitor for any redirects
      const checkOrigin = () => {
        if (window.location.origin !== originalOriginRef.current) {
          console.warn('[Auth] Origin changed! Redirecting back to:', originalOriginRef.current);
          window.location.replace(originalOriginRef.current + window.location.pathname + window.location.search + window.location.hash);
        }
      };
      
      // Check immediately and periodically
      checkOrigin();
      const interval = setInterval(checkOrigin, 100);
      
      return () => {
        clearInterval(interval);
      };
    }
  }, []);

  useEffect(() => {
    // CRITICAL: Use stored original origin to prevent redirects to production
    const currentOrigin = originalOriginRef.current || window.location.origin;
    const currentPath = window.location.pathname;
    
    // IMMEDIATE CHECK: If we're on a different host, redirect immediately
    if (window.location.origin !== currentOrigin) {
      console.warn('[Auth] IMMEDIATE: Detected redirect to different origin:', window.location.origin, 'expected:', currentOrigin);
      // Force redirect back to original host IMMEDIATELY
      const targetPath = window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(currentOrigin + targetPath);
      return;
    }
    
    // Handle auth callback - check for hash fragment or query params (OAuth/magic link)
    const handleAuthCallback = async () => {
      // Check if we have a hash fragment (OAuth callback)
      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const error = hashParams.get('error');
        const type = hashParams.get('type');
        
        if (error) {
          setError(`Authentication error: ${error}`);
          // Clean up URL - stay on current host
          window.history.replaceState({}, '', currentPath);
          return;
        }
        
        if (accessToken || type === 'recovery' || type === 'magiclink') {
          // Session will be set by Supabase automatically
          // Clean up URL to remove hash - stay on current host
          window.history.replaceState({}, '', currentPath);
        }
      }
      
      // Check for query params (magic link callback)
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      const type = urlParams.get('type');
      
      if (token && (type === 'recovery' || type === 'magiclink')) {
        // Magic link callback - clean up URL and stay on current host
        window.history.replaceState({}, '', currentPath);
      }
      
      // Check if already logged in
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setIsAuthed(true);
        const target = getSafeRedirectFrom(new URLSearchParams(window.location.search).get("from")) || "/";
        router.replace(target);
      }
    };

    handleAuthCallback();

    // Listen for auth state changes (when clicked magic link or OAuth completes)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] onAuthStateChange:', event, 'session:', session?.user?.id);
      
      if (session?.user) {
        setIsAuthed(true);
        
        // CRITICAL: Always use relative path to stay on current host
        // This ensures we stay on localhost if logging in from localhost
        // or on production if logging in from production
        const currentPath = window.location.pathname;
        const currentHost = window.location.origin;
        
        // Double-check we're still on the same host (prevent production redirect)
        if (currentHost !== currentOrigin) {
          console.warn('[Auth] onAuthStateChange: Host changed from', currentOrigin, 'to', currentHost, '- forcing redirect back');
          // Force redirect back to original host IMMEDIATELY
          window.location.replace(currentOrigin + currentPath);
          return;
        }
        
        // Small delay to ensure session is fully set
        setTimeout(() => {
          if (currentPath === '/auth' || currentPath.startsWith('/auth')) {
            const fromParam = new URLSearchParams(window.location.search).get("from");
            const target = getSafeRedirectFrom(fromParam) || "/";
            router.replace(target);
          } else {
            router.refresh();
          }
        }, 100);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function signInWithEmail() {
    setError(null);
    setLoading(true);
    const authReturnPath = getAuthUrl(redirectBack ?? undefined);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthRedirectUrl(authReturnPath),
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setGoogleLoading(true);
    const authReturnPath = getAuthUrl(redirectBack ?? undefined);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(authReturnPath),
      },
    });

    if (error) {
      // Показываем более понятное сообщение об ошибке
      if (error.message.includes("provider is not enabled") || error.message.includes("Unsupported provider")) {
        setError("Google authentication is not enabled. Please contact support or use email login.");
      } else {
        setError(error.message);
      }
      setGoogleLoading(false);
    }
    // Если ошибки нет, пользователь будет перенаправлен на Google, поэтому не сбрасываем loading
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[#ECEEE4] p-8 relative"
           style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
        {/* Close Button — go back to previous page, or fallback to redirectBack / home */}
        <button
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.replace(redirectBack || "/");
            }
          }}
          className="absolute top-4 right-4 h-8 w-8 rounded-full flex items-center justify-center text-[#A8B096] hover:bg-[#FAFAF7] hover:text-[#8F9E4F] transition-colors"
          aria-label="Close"
        >
          <Icon name="close" size={20} />
        </button>

        {/* Logo */}
        <div className="flex justify-start mb-6">
          <div className="h-10 flex items-center justify-center">
            <img src="/Logo_maporia1.svg" alt="Maporia" className="h-8 w-auto" />
          </div>
        </div>

        {/* Title */}
        <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
          Welcome back
        </h2>
        <p className="text-sm text-[#6F7A5A] mb-6">
          Sign in to save hidden places and explore local gems
        </p>

        {/* Email Input */}
        <input
          type="email"
          className="w-full h-11 rounded-full border border-[#E5E8DB] bg-white px-5 text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] transition-colors mb-4"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading && !sent && email) {
              signInWithEmail();
            }
          }}
          disabled={loading || googleLoading || sent || isAuthed}
        />

        {error && (
          <div className="mb-4 text-sm text-[#C96A5B] bg-[#FAFAF7] border border-[#ECEEE4] rounded-xl px-4 py-2">
            {error}
          </div>
        )}

        {sent ? (
          <div className="mb-4 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-4 text-sm text-[#8F9E4F] text-center">
            ✅ Magic link sent! Check your inbox (and spam folder).
          </div>
        ) : (
          <>
            {/* Continue Button */}
            <button
              className="w-full h-11 rounded-xl bg-[#8F9E4F] text-white py-3 font-medium hover:brightness-110 active:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[#DADDD0] mb-4"
              onClick={signInWithEmail}
              disabled={!email || loading || googleLoading}
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>

            {/* Divider */}
            <div className="flex items-center mb-4">
              <div className="flex-1 border-t border-[#ECEEE4]"></div>
              <span className="px-3 text-xs text-[#A8B096]">or</span>
              <div className="flex-1 border-t border-[#ECEEE4]"></div>
            </div>

            {/* Google Button */}
            <button
              className="w-full h-11 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] py-3 font-medium hover:bg-[#FAFAF7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              onClick={signInWithGoogle}
              disabled={loading || googleLoading}
            >
              {googleLoading ? (
                "Connecting..."
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <g fill="none" fillRule="evenodd">
                      <path
                        d="M17.64 9.2045c0-.6371-.0573-1.2516-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7955 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6149z"
                        fill="#4285F4"
                      />
                      <path
                        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.482 18 9 18z"
                        fill="#34A853"
                      />
                      <path
                        d="M3.9636 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3482 6.1732 0 7.5477 0 9s.3482 2.8268.9573 4.0418L3.9636 10.71z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.3459l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.482 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6714 5.1627 6.6556 3.5795 9 3.5795z"
                        fill="#EA4335"
                      />
                    </g>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <AuthPageContent />
    </Suspense>
  );
}