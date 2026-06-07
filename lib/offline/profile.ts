import { OFFLINE_USER_ID } from "./constants";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type { Profile } from "@/lib/supabase/types";

const OFFLINE_PROFILE_KEY = "dezu-offline-profile";

type OfflineProfileStorage = {
  displayName?: string;
  avatarUrl?: string | null;
  updatedAt?: string;
};

function offlineProfileFromStorage(value: OfflineProfileStorage): Profile {
  const now = value.updatedAt ?? new Date().toISOString();
  return {
    id: OFFLINE_USER_ID,
    display_name: value.displayName ?? "Offline User",
    avatar_url: value.avatarUrl ?? null,
    base_currency: DEFAULT_CURRENCY,
    created_at: now,
    updated_at: now,
    synced_at: null,
    is_deleted: false,
  };
}

export function getOfflineProfile(): Profile {
  if (typeof window === "undefined") return offlineProfileFromStorage({});
  try {
    const raw = window.localStorage.getItem(OFFLINE_PROFILE_KEY);
    return offlineProfileFromStorage(raw ? JSON.parse(raw) as OfflineProfileStorage : {});
  } catch {
    return offlineProfileFromStorage({});
  }
}

export function saveOfflineProfile(input: { displayName?: string; avatarUrl?: string | null }): Profile {
  const next: OfflineProfileStorage = {
    displayName: input.displayName,
    avatarUrl: input.avatarUrl ?? null,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(next));
  }
  return offlineProfileFromStorage(next);
}
