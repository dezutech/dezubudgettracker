"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import {
  isGuestModeEnabled,
  markOfflineSyncPendingIfNeeded,
} from "@/lib/offline/guest-mode";

const DASHBOARD_PATH = "/dashboard";

async function waitForSession(supabase: ReturnType<typeof createClient>) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();

    if (data.session || error) return { session: data.session, error };
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { session: null, error: null };
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { continueOffline } = useAuth();

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [remember,   setRemember]   = useState(true);
  const [showPw,     setShowPw]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error,      setError]      = useState("");
  const [message,    setMessage]    = useState("");

  const paramError = searchParams.get("error") === "auth_callback_failed"
    ? "Authentication failed. Please try again."
    : "";
  const paramMessage = searchParams.get("message") === "check_email"
    ? "Check your email to confirm your account."
    : searchParams.get("message") === "password_updated"
    ? "Password updated successfully. Please sign in."
    : "";
  const visibleError = error || paramError;
  const visibleMessage = message || paramMessage;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMessage("");

    if (!email.trim()) { setError("Email is required."); return; }
    if (!password)      { setError("Password is required."); return; }

    setLoading(true);
    try {
      const wasGuest = isGuestModeEnabled();
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError("Invalid email or password.");
        return;
      }

      const { session, error: sessionError } = await waitForSession(supabase);

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      if (!session) {
        setError("Login succeeded, but the browser did not persist the session. Check mobile storage/cookie settings and service worker cache.");
        return;
      }

      if (wasGuest) {
        await markOfflineSyncPendingIfNeeded();
      }

      router.refresh();
      router.replace(DASHBOARD_PATH);
      return;
    } finally {
      setLoading(false);
    }
  }

  async function handleContinueOffline() {
    setGuestLoading(true);
    setError("");
    setMessage("");
    try {
      await continueOffline();
      router.refresh();
      router.replace(DASHBOARD_PATH);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offline mode could not start on this device.");
    } finally {
      setGuestLoading(false);
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
          <h1 className="text-xl font-bold text-zinc-50 tracking-tight">Welcome back</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Sign in to Dezu Budget</p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-zinc-900 ring-1 ring-zinc-800 rounded-2xl p-6 flex flex-col gap-5">
        {visibleMessage && (
          <p className="text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2.5 leading-relaxed">
            {visibleMessage}
          </p>
        )}
        {visibleError && (
          <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2.5 leading-relaxed">
            {visibleError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              className={cn(
                "h-10 w-full rounded-lg border bg-zinc-800 px-3 text-sm text-zinc-100",
                "placeholder:text-zinc-500 focus:outline-none transition-colors",
                "focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60",
                error ? "border-rose-500/50" : "border-zinc-700"
              )}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={cn(
                  "h-10 w-full rounded-lg border bg-zinc-800 pl-3 pr-10 text-sm text-zinc-100",
                  "placeholder:text-zinc-500 focus:outline-none transition-colors",
                  "focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60",
                  error ? "border-rose-500/50" : "border-zinc-700"
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

          {/* Remember me */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 accent-emerald-500 cursor-pointer"
            />
            <span className="text-sm text-zinc-400">Remember me</span>
          </label>

          <button
            type="submit"
            disabled={loading || guestLoading}
            className="h-10 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Sign in
          </button>
        </form>

        <div className="grid gap-2">
          <Link
            href="/register"
            className="theme-hover flex h-10 w-full items-center justify-center rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] text-sm font-semibold text-foreground transition-colors"
          >
            Create account
          </Link>
          <button
            type="button"
            onClick={handleContinueOffline}
            disabled={loading || guestLoading}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 text-sm font-semibold text-foreground transition-colors hover:border-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)] disabled:pointer-events-none disabled:bg-[var(--theme-muted)] disabled:text-[var(--theme-muted-foreground)]"
          >
            {guestLoading ? <Loader2 size={14} className="animate-spin" /> : <WifiOff size={14} />}
            Continue offline
          </button>
          <p className="text-center text-[11px] leading-relaxed text-zinc-500">
            Start tracking your finances right away. Your data will be saved on this device, and you can sign in later to back it up and access it from other devices.
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-zinc-500">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm flex items-center justify-center p-6">
          <Loader2 size={18} className="animate-spin text-emerald-400" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
