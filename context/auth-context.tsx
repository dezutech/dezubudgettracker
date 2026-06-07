"use client";

import React, {
  createContext, useContext, useEffect,
  useState, useCallback, useMemo,
} from "react";
import type {
  User, Session, AuthChangeEvent,
  UserResponse,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { loggedSupabase } from "@/lib/supabase/query";
import type { Profile } from "@/lib/supabase/types";
import {
  disableGuestMode,
  enableGuestMode,
  isGuestModeEnabled,
} from "@/lib/offline/guest-mode";
import { getOfflineProfile } from "@/lib/offline/profile";

// ─── Context shape ────────────────────────────────────────────────────────────

type AuthContextType = {
  user:           User    | null;
  profile:        Profile | null;
  loading:        boolean;
  isLoggingOut:   boolean;
  isGuest:        boolean;
  continueOffline: () => Promise<void>;
  signOut:        () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user:           null,
  profile:        null,
  loading:        true,
  isLoggingOut:   false,
  isGuest:        false,
  continueOffline: async () => {},
  signOut:        async () => {},
  refreshProfile: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  const fetchProfile = useCallback(
    async (userId: string) => {
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        console.info("[supabase:profile] started");
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const durationMs = Math.round(endedAt - startedAt);

        if (error) {
          console.warn(`[supabase:profile] warning in ${durationMs}ms`, error.message);
          setProfile(null);
          return;
        }

        if (durationMs > 2000) {
          console.warn(`[supabase:profile] slow query in ${durationMs}ms`);
        } else {
          console.info(`[supabase:profile] done in ${durationMs}ms`);
        }
        setProfile((data as Profile | null) ?? null);
      } catch (error) {
        const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const durationMs = Math.round(endedAt - startedAt);
        console.warn(`[supabase:profile] warning in ${durationMs}ms`, error);
        setProfile(null);
      }
    },
    [supabase]
  );

  useEffect(() => {
    // 1. Hydrate from current session
    let mounted = true;

    loggedSupabase("auth user", supabase.auth.getUser(), 5000)
      .then((result: UserResponse) => {
        if (!mounted) return;
        const u: User | null = result.data.user ?? null;
        setUser(u);
        if (u) {
          disableGuestMode();
          setIsGuest(false);
          setLoading(false);
          fetchProfile(u.id)
            .catch((error) => console.warn("[auth] profile load warning", error))
            .then(() => {
              if (!mounted) return;
            });
        } else {
          const guestMode = isGuestModeEnabled();
          setIsGuest(guestMode);
          setProfile(guestMode ? getOfflineProfile() : null);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.warn("[auth] initial user load warning", error);
        if (!mounted) return;
        setUser(null);
        const guestMode = isGuestModeEnabled();
        setIsGuest(guestMode);
        setProfile(guestMode ? getOfflineProfile() : null);
        setLoading(false);
      });

    // 2. Keep state in sync with auth changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        setIsLoggingOut(false);
        disableGuestMode();
        setIsGuest(false);
        void fetchProfile(currentUser.id).catch((error) =>
          console.warn("[auth] profile refresh warning", error)
        );
      } else {
        const guestMode = isGuestModeEnabled();
        setIsGuest(guestMode);
        setProfile(guestMode ? getOfflineProfile() : null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const continueOffline = useCallback(async () => {
    await supabase.auth.signOut();
    await enableGuestMode();
    setIsLoggingOut(false);
    setUser(null);
    setProfile(getOfflineProfile());
    setIsGuest(true);
    setLoading(false);
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("dezu:clear-app-errors"));
    }
    setIsLoggingOut(true);
    setUser(null);
    setProfile(null);
    setIsGuest(false);
    try {
      await supabase.auth.signOut();
      disableGuestMode();
    } catch (error) {
      setIsLoggingOut(false);
      throw error;
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (isGuest) {
      setProfile(getOfflineProfile());
      return;
    }
    if (user) {
      await fetchProfile(user.id).catch((error) =>
        console.warn("[auth] profile refresh warning", error)
      );
    }
  }, [isGuest, user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isLoggingOut, isGuest, continueOffline, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
