"use client";

import { useAuth } from "@/context/auth-context";

export function AuthModeBoundary({ children }: { children: React.ReactNode }) {
  const { user, isGuest, loading, isLoggingOut } = useAuth();
  const modeKey = loading
    ? "loading"
    : isLoggingOut
    ? "logging-out"
    : isGuest
    ? "offline"
    : user?.id
    ? `cloud:${user.id}`
    : "anonymous";

  return <div key={modeKey}>{children}</div>;
}
