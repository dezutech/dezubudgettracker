"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email is required."); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/auth/callback?type=recovery` }
      );
      if (authError) { setError(authError.message); return; }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm flex flex-col gap-8">
      {/* Brand */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-2xl font-black text-zinc-950">
          D
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-zinc-50 tracking-tight">Forgot password?</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {sent ? "Check your inbox" : "We'll send you a reset link"}
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 ring-1 ring-zinc-800 rounded-2xl p-6 flex flex-col gap-5">
        {sent ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-2xl">
              📬
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Reset link sent</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                We sent a password reset link to{" "}
                <span className="text-zinc-300">{email}</span>.
                Check your inbox and spam folder.
              </p>
            </div>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Try a different email
            </button>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2.5">
                {error}
              </p>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Email address
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-10 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Send reset link
              </button>
            </form>
          </>
        )}
      </div>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to sign in
      </Link>
    </div>
  );
}
