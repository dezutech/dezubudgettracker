"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CloudUpload, Loader2, X } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  clearOfflineSyncPending,
  isOfflineSyncPending,
} from "@/lib/offline/guest-mode";
import { cn } from "@/lib/utils";
import {
  EMPTY_SYNC_COUNTS,
  SYNC_COUNT_KEYS,
  backupOfflineData,
  countCloudData,
  getCloudSyncData,
  getOfflineSyncCounts,
  markOfflineDataIgnored,
  syncOfflineDataToCloud,
  totalSyncCount,
  type SyncAction,
  type SyncCountKey,
  type SyncCounts,
  type SyncTableStatus,
} from "@/lib/offline/cloud-sync";

type DialogMode = "conflict" | "offline-only";

const COUNT_LABELS: Record<SyncCountKey, string> = {
  wallets: "Wallets",
  transactions: "Transactions",
  budgets: "Budgets",
  bills: "Bills",
  goals: "Goals",
  recurring: "Recurring",
  transfers: "Transfers",
};

async function getCloudCounts(userId: string): Promise<{ counts: SyncCounts; errors: Partial<Record<SyncCountKey, string>> }> {
  try {
    return { counts: countCloudData(await getCloudSyncData(createClient(), userId)), errors: {} };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not count cloud data.";
    return {
      counts: { ...EMPTY_SYNC_COUNTS },
      errors: Object.fromEntries(SYNC_COUNT_KEYS.map((key) => [key, message])) as Partial<Record<SyncCountKey, string>>,
    };
  }
}

function CountGrid({ offline, cloud }: { offline: SyncCounts; cloud: SyncCounts }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {SYNC_COUNT_KEYS.map((key) => (
        <div key={key} className="rounded-xl bg-muted/45 px-3 py-2 ring-1 ring-border/70">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{COUNT_LABELS[key]}</span>
            <span className="text-xs font-semibold text-foreground">{offline[key]} local / {cloud[key]} cloud</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusList({ statuses }: { statuses: SyncTableStatus }) {
  const hasStatuses = SYNC_COUNT_KEYS.some((key) => statuses[key]);
  if (!hasStatuses) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold text-foreground">Sync status</p>
      <div className="mt-2 space-y-1.5">
        {SYNC_COUNT_KEYS.map((key) => {
          const status = statuses[key] ?? { state: "idle" as const };
          const Icon = status.state === "done" ? CheckCircle2 : status.state === "pending" ? Loader2 : AlertTriangle;
          return (
            <div key={key} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{COUNT_LABELS[key]}</span>
              <span className={cn(
                "inline-flex items-center gap-1.5 font-medium",
                status.state === "error" ? "text-rose-300" : status.state === "done" ? "text-emerald-300" : "text-muted-foreground"
              )}>
                {status.state !== "idle" && <Icon size={12} className={status.state === "pending" ? "animate-spin" : ""} />}
                {status.message ?? status.state}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OfflineSyncPrompt() {
  const router = useRouter();
  const { user, isGuest, loading, isLoggingOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [mode, setMode] = useState<DialogMode>("offline-only");
  const [offlineCounts, setOfflineCounts] = useState<SyncCounts>(EMPTY_SYNC_COUNTS);
  const [cloudCounts, setCloudCounts] = useState<SyncCounts>(EMPTY_SYNC_COUNTS);
  const [tableErrors, setTableErrors] = useState<SyncTableStatus>({});
  const [message, setMessage] = useState("");
  const [replaceConfirm, setReplaceConfirm] = useState("");
  const [busyAction, setBusyAction] = useState<SyncAction | null>(null);

  useEffect(() => {
    let active = true;
    async function checkMigrationState() {
      if (loading || isLoggingOut || isGuest || !user || !isOfflineSyncPending()) return;

      setChecking(true);
      try {
        const [local, cloud] = await Promise.all([
          getOfflineSyncCounts(),
          getCloudCounts(user.id),
        ]);
        if (!active) return;

        const offlineTotal = totalSyncCount(local);
        const cloudTotal = totalSyncCount(cloud.counts);
        const hasCloudCountErrors = Object.keys(cloud.errors).length > 0;
        setOfflineCounts(local);
        setCloudCounts(cloud.counts);
        setTableErrors(Object.fromEntries(
          Object.entries(cloud.errors).map(([key, error]) => [key, { state: "error", message: error }])
        ) as SyncTableStatus);

        if (offlineTotal === 0) {
          clearOfflineSyncPending();
          setOpen(false);
          return;
        }

        if (cloudTotal > 0 || hasCloudCountErrors) {
          setMode("conflict");
          if (hasCloudCountErrors) {
            setMessage("Some cloud tables could not be counted, so Dezu will not assume your cloud account is empty.");
          }
          setOpen(true);
          return;
        }

        setMode("offline-only");
        setOpen(true);
      } finally {
        if (active) setChecking(false);
      }
    }

    void checkMigrationState();
    return () => {
      active = false;
    };
  }, [isGuest, isLoggingOut, loading, user]);

  const title = mode === "conflict" ? "You have data in both places" : "Sync your offline data to cloud?";
  const description = mode === "conflict"
    ? "This device has offline data, and your account already has cloud data. Choose what to do."
    : "This device has offline data and your cloud account looks empty. Choose whether to upload it now.";

  const preparedMessage = useMemo(
    () => "Sync failed. Your offline data is still intact on this device, and the modal will stay open until you choose a successful action.",
    []
  );

  if (!open) return null;

  async function keepCloudData() {
    await backupOfflineData("keep-cloud");
    markOfflineDataIgnored();
    clearOfflineSyncPending();
    setOpen(false);
  }

  function notNow() {
    setOpen(false);
  }

  async function runSyncAction(action: SyncAction) {
    if (!user) return;
    setBusyAction(action);
    setMessage("");
    setReplaceConfirm("");
    setTableErrors(Object.fromEntries(
      SYNC_COUNT_KEYS.map((key) => [key, { state: offlineCounts[key] > 0 ? "pending" : "idle", message: offlineCounts[key] > 0 ? "waiting" : "nothing to back up" }])
    ) as SyncTableStatus);

    try {
      const result = await syncOfflineDataToCloud({
        supabase: createClient(),
        userId: user.id,
        action,
        onStatus: (key, state, statusMessage) => {
          setTableErrors((current) => ({
            ...current,
            [key]: { state, message: statusMessage },
          }));
        },
      });

      setOfflineCounts(result.counts);
      setCloudCounts(countCloudData(result.cloud));
      clearOfflineSyncPending();
      setMessage(`Sync complete. Local backup saved as ${result.backupKey}.`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(preparedMessage);
      setTableErrors((current) => {
        const next = { ...current };
        for (const key of SYNC_COUNT_KEYS) {
          if (next[key]?.state !== "done") next[key] = { state: "error", message: "not completed" };
        }
        return next;
      });
      setMessage(error instanceof Error ? `${preparedMessage} ${error.message}` : preparedMessage);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={notNow} />
      <div className="dezu-modal-panel relative w-full max-w-[520px] rounded-2xl bg-card text-card-foreground shadow-2xl ring-1 ring-border">
        <div className="dezu-modal-header flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              {checking ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} strokeWidth={2} />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={notNow}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close migration dialog"
          >
            <X size={15} />
          </button>
        </div>

        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          <CountGrid offline={offlineCounts} cloud={cloudCounts} />

          {message && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
              {message}
            </p>
          )}

          <StatusList statuses={tableErrors} />

        </div>

        <div className="dezu-modal-footer flex flex-col gap-3 border-t border-border px-5 py-4">
          {mode === "conflict" ? (
            <>
              <div className="flex flex-col gap-3">
                <button type="button" onClick={() => void keepCloudData()} disabled={busyAction !== null} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-muted px-4 text-sm font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-muted/80 disabled:opacity-60">
                  Keep Cloud Data
                </button>
                <button type="button" onClick={() => void runSyncAction("add")} disabled={busyAction !== null} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:opacity-60">
                  {busyAction === "add" ? "Syncing..." : "Add Offline Data to Cloud"}
                </button>
                <button type="button" onClick={() => void runSyncAction("merge")} disabled={busyAction !== null} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-sky-400 disabled:opacity-60">
                  {busyAction === "merge" ? "Syncing..." : "Merge Data"}
                </button>
              </div>

              <div className="mt-1 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Danger Zone</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Replace Cloud Data will delete existing cloud data before upload. Type CONFIRM to enable it.
                    </p>
                  </div>
                  <input
                    value={replaceConfirm}
                    onChange={(event) => setReplaceConfirm(event.target.value)}
                    placeholder="Type CONFIRM"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-rose-500/30"
                  />
                  <button type="button" onClick={() => void runSyncAction("replace")} disabled={replaceConfirm !== "CONFIRM" || busyAction !== null} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-rose-500 px-4 text-sm font-semibold text-[var(--theme-danger-foreground)] transition-colors hover:bg-rose-400 disabled:pointer-events-none disabled:opacity-50">
                    {busyAction === "replace" ? "Syncing..." : "Replace Cloud Data"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={notNow} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-muted px-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                Not Now
              </button>
              <button type="button" onClick={() => void runSyncAction("sync")} disabled={busyAction !== null} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:opacity-60">
                {busyAction === "sync" ? "Syncing..." : "Sync Now"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
