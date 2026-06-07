"use client";

import { useRouter } from "next/navigation";
import { LogIn, WifiOff } from "lucide-react";
import { useAuth } from "@/context/auth-context";

export function OfflineModeCard() {
  const router = useRouter();
  const { isGuest } = useAuth();

  if (!isGuest) return null;

  return (
    <div className="dezu-card mx-auto max-w-6xl rounded-[1.15rem] bg-card/90 p-4 text-card-foreground sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
            <WifiOff size={18} strokeWidth={1.9} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Offline Mode</h2>
              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold leading-none text-amber-300">
                Offline Mode
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Start tracking your finances right away. Your data will be saved on this device, and you can sign in later to back it up and access it from other devices.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          <LogIn size={14} strokeWidth={2.2} />
          Sign in
        </button>
      </div>
    </div>
  );
}
