import { db } from "@/lib/db/database";
import { seedDatabase } from "@/lib/db/seed";
import { OFFLINE_USER_ID } from "./constants";

export const GUEST_MODE_STORAGE_KEY = "dezu-offline-guest";
export const GUEST_MODE_COOKIE = "dezu_guest_mode";
export const OFFLINE_SYNC_PENDING_KEY = "dezu-offline-sync-pending";
export { OFFLINE_USER_ID };

const cookieMaxAge = 60 * 60 * 24 * 365;

function setGuestCookie(enabled: boolean) {
  if (typeof document === "undefined") return;

  document.cookie = enabled
    ? `${GUEST_MODE_COOKIE}=1; Max-Age=${cookieMaxAge}; Path=/; SameSite=Lax`
    : `${GUEST_MODE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function isGuestModeEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "1";
}

export async function enableGuestMode() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "1");
  setGuestCookie(true);
  await seedDatabase(OFFLINE_USER_ID);
}

export function disableGuestMode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
  setGuestCookie(false);
}

export async function hasOfflineData(userId = OFFLINE_USER_ID) {
  if (typeof window === "undefined") return false;
  const [wallets, transactions, budgets, recurring, goals, bills, syncQueue] = await Promise.all([
    db.wallets.where("userId").equals(userId).count(),
    db.transactions.where("userId").equals(userId).count(),
    db.budgets.where("userId").equals(userId).count(),
    db.recurringTransactions.where("userId").equals(userId).count(),
    db.goals.where("userId").equals(userId).count(),
    db.bills.where("userId").equals(userId).count(),
    db.syncQueue.where("userId").equals(userId).count(),
  ]);

  return wallets + transactions + budgets + recurring + goals + bills + syncQueue > 0;
}

export async function markOfflineSyncPendingIfNeeded() {
  if (typeof window === "undefined") return;
  if (await hasOfflineData()) {
    window.localStorage.setItem(OFFLINE_SYNC_PENDING_KEY, "1");
  }
}

export function isOfflineSyncPending() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OFFLINE_SYNC_PENDING_KEY) === "1";
}

export function clearOfflineSyncPending() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OFFLINE_SYNC_PENDING_KEY);
}
