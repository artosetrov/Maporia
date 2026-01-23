"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, getAuthRedirectUrl } from "../lib/supabase";
import Icon from "./Icon";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  redirectPath?: string;
};

/**
 * Modal component for authentication (sign up / login)
 * Opens when guests try to perform restricted actions
 */
export default function AuthModal({ isOpen, onClose, redirectPath }: AuthModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setEmail("");
      setSent(false);
      setError(null);
    }
  }, [isOpen]);

  // Listen for auth state changes
  useEffect(() => {
    if (!isOpen) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // User authenticated, close modal and redirect if needed
        onClose();
        if (redirectPath) {
          router.push(redirectPath);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isOpen, onClose, redirectPath, router]);

  async function signInWithEmail() {
    setError(null);
    setLoading(true);

    const redirectTo = redirectPath || "/";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthRedirectUrl(redirectTo),
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

    const redirectTo = redirectPath || "/";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(redirectTo),
      },
    });

    setGoogleLoading(false);
    if (error) {
      setError(error.message);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[#ECEEE4] p-8 relative"
           style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 rounded-full flex items-center justify-center text-[#A8B096] hover:bg-[#FAFAF7] hover:text-[#8F9E4F] transition-colors"
          aria-label="Close"
        >
          <Icon name="close" size={20} />
        </button>

        {/* Logo */}
        <div className="flex justify-start mb-6">
          <div className="h-10 flex items-center justify-center">
            <svg width="159" height="36" viewBox="0 0 159 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-auto">
              <g clipPath="url(#clip0_288_14)">
                <mask id="mask0_288_14" style={{ maskType: "luminance" }} maskUnits="userSpaceOnUse" x="0" y="0" width="159" height="36">
                  <path d="M0 0H159V36H0V0Z" fill="white"/>
                </mask>
                <g mask="url(#mask0_288_14)">
                  <path d="M8.5 8.5H150.5V27.5H8.5V8.5Z" fill="#1F2A1F"/>
                </g>
              </g>
              <defs>
                <clipPath id="clip0_288_14">
                  <rect width="159" height="36" fill="white"/>
                </clipPath>
              </defs>
            </svg>
          </div>
        </div>

        {/* Content */}
        {sent ? (
          <div className="text-center">
            <div className="mb-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#ECEEE4] flex items-center justify-center mb-4">
                <Icon name="mail" size={32} className="text-[#8F9E4F]" />
              </div>
              <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-2">Check your email</h2>
              <p className="text-[#A8B096] text-sm">
                We sent a magic link to <strong>{email}</strong>
              </p>
              <p className="text-[#A8B096] text-sm mt-2">
                Click the link in the email to sign in.
              </p>
            </div>
            <button
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="text-[#8F9E4F] text-sm font-medium hover:text-[#556036] transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-2">Sign in to Maporia</h2>
            <p className="text-[#A8B096] text-sm mb-6">
              Sign in to like, comment, and save your favorite places
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                signInWithEmail();
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#1F2A1F] mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] placeholder-[#A8B096] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[#8F9E4F] text-white font-semibold text-sm hover:brightness-110 active:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send magic link"}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#ECEEE4]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-[#A8B096]">Or</span>
              </div>
            </div>

            <button
              onClick={signInWithGoogle}
              disabled={googleLoading}
              className="w-full py-3 px-4 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] font-semibold text-sm hover:bg-[#FAFAF7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {googleLoading ? (
                "Connecting..."
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
