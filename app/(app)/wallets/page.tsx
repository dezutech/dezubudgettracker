"use client";

import { WalletsView } from "@/components/wallets/wallets-view";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WalletsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (authLoading || isLoggingOut || isGuest || userId) return;
    router.replace("/login");
  }, [authLoading, isGuest, isLoggingOut, router, userId]);

  if (authLoading || isLoggingOut) return null;
  if (!isGuest && !userId) return null;

  return <WalletsView />;
}
