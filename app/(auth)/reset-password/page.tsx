"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!password)            { setError("Password is required."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm)  { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) { setError(authError.message); return; }

      // Sign out then redirect to login so the user re-authenticates with the new password.
      await supabase.auth.signOut();
      router.push("/login?message=password_updated");
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
          <h1 className="text-xl font-bold text-zinc-50 tracking-tight">Set new password</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Enter your new password below</p>
        </div>
      </div>

      <div className="bg-zinc-900 ring-1 ring-zinc-800 rounded-2xl p-6 flex flex-col gap-5">
        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2.5">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* New password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              New Password
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

          {/* Confirm */}
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
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
