"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const DASHBOARD_PATH = "/dashboard";

export default function RegisterPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!displayName.trim()) { setError("Display name is required."); return; }
    if (!email.trim())        { setError("Email is required."); return; }
    if (!password)            { setError("Password is required."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm)  { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;

      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });

      if (authError) { setError(authError.message); return; }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      // If email confirmations are disabled in Supabase, sign-up logs in automatically.
      if (sessionData.session) {
        router.refresh();
        router.replace(DASHBOARD_PATH);
        return;
      }

      // Email confirmation is enabled: Supabase created the user but did not issue a session yet.
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-2xl font-black text-zinc-950">
            D
          </div>
        </div>
        <div className="bg-zinc-900 ring-1 ring-zinc-800 rounded-2xl p-6 flex flex-col gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <span className="text-2xl">📬</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Check your email</h2>
            <p className="text-sm text-zinc-500 mt-1 leading-relaxed">
              We sent a confirmation link to <span className="text-zinc-300">{email}</span>.
              Click it to activate your account.
            </p>
          </div>
          <Link
            href="/login"
            className="text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm flex flex-col gap-8">
      {/* Brand */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-2xl font-black text-zinc-950">
          D
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-zinc-50 tracking-tight">Create account</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Start tracking your finances</p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-zinc-900 ring-1 ring-zinc-800 rounded-2xl p-6 flex flex-col gap-5">
        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2.5 leading-relaxed">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Display name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Display Name
            </label>
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Email
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

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={cn(
                  "h-10 w-full rounded-lg border bg-zinc-800 pl-3 pr-10 text-sm text-zinc-100",
                  "placeholder:text-zinc-500 focus:outline-none transition-colors",
                  "focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60",
                  password && password.length < 8 ? "border-rose-500/50" : "border-zinc-700"
                )}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Confirm Password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className={cn(
                "h-10 w-full rounded-lg border bg-zinc-800 px-3 text-sm text-zinc-100",
                "placeholder:text-zinc-500 focus:outline-none transition-colors",
                "focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60",
                confirm && confirm !== password ? "border-rose-500/50" : "border-zinc-700"
              )}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-10 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2 mt-1"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create account
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
