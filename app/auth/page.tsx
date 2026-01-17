"use client";
console.log(
  "URL", process.env.NEXT_PUBLIC_SUPABASE_URL,
  "KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    // если уже залогинен — сразу в профиль
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setIsAuthed(true);
        router.replace("/profile");
      }
    })();

    // слушаем изменения сессии (когда кликнул magic link)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthed(true);
        router.replace("/profile");
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function signIn() {
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/profile`,
      },
    });

    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function logout() {
    await supabase.auth.signOut();
    setIsAuthed(false);
    setSent(false);
    setEmail("");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 shadow-xl">
        <div className="text-sm text-white/60">Maporia</div>
        <h1 className="mt-1 text-2xl font-semibold">Login</h1>
        <p className="mt-2 text-sm text-white/60">
          Enter your email — we’ll send a magic link.
        </p>

        <label className="mt-5 block text-sm text-white/70">Email</label>
        <input
          className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:bg-white/15"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || isAuthed}
        />

        {error && <div className="mt-3 text-sm text-red-300">{error}</div>}

        {isAuthed ? (
          <div className="mt-4 space-y-2">
            <button
              className="w-full rounded-xl bg-white text-black py-3 font-medium hover:bg-white/90"
              onClick={() => router.push("/profile")}
            >
              Continue to Profile
            </button>
            <button
              className="w-full rounded-xl border border-white/15 bg-white/10 py-3 text-sm hover:bg-white/15"
              onClick={logout}
            >
              Log out
            </button>
          </div>
        ) : sent ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
            ✅ Link sent. Check your inbox (and spam).
          </div>
        ) : (
          <button
            className="mt-4 w-full rounded-xl bg-white text-black py-3 font-medium hover:bg-white/90 disabled:opacity-50"
            onClick={signIn}
            disabled={!email || loading}
          >
            {loading ? "Sending..." : "Send magic link"}
          </button>
        )}

        <div className="mt-4 text-xs text-white/40">
          Tip: open the magic link in the same browser.
        </div>
      </div>
    </main>
  );
}