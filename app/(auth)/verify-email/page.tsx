"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function VerifyEmailResult() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSuccess = searchParams.get("status") === "success";

  async function goToLogin() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="w-full max-w-sm flex flex-col gap-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-2xl font-black text-zinc-950">
          D
        </div>
      </div>

      <div className="bg-zinc-900 ring-1 ring-zinc-800 rounded-2xl p-6 flex flex-col items-center gap-5 text-center">
        <div className={
          isSuccess
            ? "w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center"
            : "w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center"
        }>
          {isSuccess ? (
            <CheckCircle2 size={30} className="text-emerald-400" strokeWidth={1.75} />
          ) : (
            <XCircle size={30} className="text-rose-400" strokeWidth={1.75} />
          )}
        </div>

        <div>
          <h1 className="text-lg font-semibold text-zinc-50">
            {isSuccess ? "Email verified" : "Verification failed"}
          </h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            {isSuccess
              ? "Your email has been verified successfully."
              : "We could not verify your email. The link may have expired or already been used."}
          </p>
        </div>

        <button
          type="button"
          onClick={goToLogin}
          className="h-10 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors flex items-center justify-center"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailResult />
    </Suspense>
  );
}
