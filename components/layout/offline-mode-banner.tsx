"use client";

import { WifiOff } from "lucide-react";
import { useAuth } from "@/context/auth-context";

export function OfflineModeBanner() {
  const { isGuest } = useAuth();

  if (!isGuest) return null;

  return (
    <div className="px-4 pt-3 md:px-5 md:pt-4">
      <div className="mx-auto flex max-w-6xl items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200">
        <WifiOff size={14} strokeWidth={2} className="shrink-0" />
        <span className="min-w-0">
          Offline Mode: Start tracking now. Your data is saved on this device, and you can sign in later to back it up.
        </span>
      </div>
    </div>
  );
}
