"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { TopBar } from "./top-bar";
import { OfflineModeBanner } from "./offline-mode-banner";
import { AuthModeBoundary } from "./auth-mode-boundary";
import { useAuth } from "@/context/auth-context";

function FullScreenStatus({ text }: { text: string }) {
  return (
    <div className="min-h-screen bg-[var(--app-surface)] text-foreground transition-colors flex items-center justify-center px-6">
      <p className="text-sm font-medium text-zinc-500">{text}</p>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isLoggingOut, isGuest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || isLoggingOut || isGuest || user) return;
    router.replace("/login");
  }, [isGuest, isLoggingOut, loading, router, user]);

  if (isLoggingOut) {
    return <FullScreenStatus text="Signing out..." />;
  }

  if (loading) {
    return <FullScreenStatus text="Loading..." />;
  }

  if (!user && !isGuest) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--app-surface)] text-foreground transition-colors">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile top bar */}
      <TopBar />

      {/* Main content area */}
      <main
        className="
          md:pl-60
          pt-14 md:pt-0
          pb-24 md:pb-0
          min-h-screen
          bg-[var(--app-surface)]
          transition-colors
        "
      >
        <AuthModeBoundary>
          <OfflineModeBanner />
          {children}
        </AuthModeBoundary>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  );
}
