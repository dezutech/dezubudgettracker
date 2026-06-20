"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, Trophy,
  Target, Home, Car, Plane, Laptop, GraduationCap,
  Briefcase, Globe, PiggyBank, Gift, Building2,
  Smartphone, Shield, Rocket, Dumbbell, Music,
  TrendingUp, Heart, Coffee, Camera,
  CheckCircle2, ChevronDown, ChevronUp, Search, SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencyInputPrefix } from "@/components/ui/currency-input-prefix";
import { DetailRow, DetailRows, DetailsModalShell } from "@/components/ui/details-modal";
import { createClient } from "@/lib/supabase/client";
import { loggedSupabase, settledError } from "@/lib/supabase/query";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addContribution,
  contributeToGoal,
  createGoal,
  deleteGoal,
  getGoals,
  getWallets,
  updateGoal,
  type DbGoal,
} from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

type GoalStatus = "active" | "completed" | "paused" | "cancelled";

type AppGoal = {
  id: string;
  user_id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  status: GoalStatus;
  icon?: string;
  color?: string;
  notes?: string;
  walletId?: string | null;
};

type GoalWallet = {
  id: string;
  name: string;
  balance: number;
};

type SupabaseGoalRow = {
  id: string;
  user_id: string;
  name: string;
  target_amount: number | string;
  current_amount: number | string;
  wallet_id?: string | null;
  target_date: string | null;
  status: GoalStatus;
  icon?: string | null;
  color?: string | null;
  notes?: string | null;
};

function mapGoal(row: SupabaseGoalRow): AppGoal {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    currentAmount: Number(row.current_amount),
    walletId: row.wallet_id ?? null,
    targetDate: row.target_date ?? todayIso(),
    status: row.status,
    icon: row.icon ?? "Target",
    color: row.color ?? "emerald",
    notes: row.notes ?? undefined,
  };
}

function localGoalToApp(goal: DbGoal): AppGoal {
  return {
    id: String(goal.id),
    user_id: goal.userId,
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    walletId: goal.walletId != null ? String(goal.walletId) : null,
    targetDate: goal.targetDate,
    status: goal.status,
    icon: goal.icon ?? "Target",
    color: goal.color ?? "emerald",
    notes: goal.notes,
  };
}

// ─── Goal icon registry ───────────────────────────────────────────────────────

type IconEntry = { name: string; icon: LucideIcon };

const GOAL_ICONS: IconEntry[] = [
  { name: "Target",        icon: Target        },
  { name: "PiggyBank",     icon: PiggyBank     },
  { name: "Shield",        icon: Shield        },
  { name: "Home",          icon: Home          },
  { name: "Car",           icon: Car           },
  { name: "Plane",         icon: Plane         },
  { name: "Laptop",        icon: Laptop        },
  { name: "Smartphone",    icon: Smartphone    },
  { name: "GraduationCap", icon: GraduationCap },
  { name: "Briefcase",     icon: Briefcase     },
  { name: "Building2",     icon: Building2     },
  { name: "Globe",         icon: Globe         },
  { name: "Heart",         icon: Heart         },
  { name: "Dumbbell",      icon: Dumbbell      },
  { name: "Music",         icon: Music         },
  { name: "Gift",          icon: Gift          },
  { name: "Rocket",        icon: Rocket        },
  { name: "TrendingUp",    icon: TrendingUp    },
  { name: "Coffee",        icon: Coffee        },
  { name: "Camera",        icon: Camera        },
];

const ICON_MAP = new Map<string, LucideIcon>(
  GOAL_ICONS.map(({ name, icon }) => [name, icon])
);
function getIcon(name?: string): LucideIcon {
  return (name ? ICON_MAP.get(name) : undefined) ?? Target;
}

// ─── Color registry ───────────────────────────────────────────────────────────

type ColorEntry = { name: string; dot: string; text: string; bg: string; bar: string };

const COLORS: ColorEntry[] = [
  { name: "orange",  dot: "bg-orange-400",  text: "text-orange-400",  bg: "bg-orange-500/10",  bar: "bg-orange-400"  },
  { name: "amber",   dot: "bg-amber-400",   text: "text-amber-400",   bg: "bg-amber-500/10",   bar: "bg-amber-400"   },
  { name: "yellow",  dot: "bg-yellow-400",  text: "text-yellow-400",  bg: "bg-yellow-500/10",  bar: "bg-yellow-400"  },
  { name: "lime",    dot: "bg-lime-400",    text: "text-lime-400",    bg: "bg-lime-500/10",    bar: "bg-lime-400"    },
  { name: "emerald", dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10", bar: "bg-emerald-400" },
  { name: "teal",    dot: "bg-teal-400",    text: "text-teal-400",    bg: "bg-teal-500/10",    bar: "bg-teal-400"    },
  { name: "sky",     dot: "bg-sky-400",     text: "text-sky-400",     bg: "bg-sky-500/10",     bar: "bg-sky-400"     },
  { name: "blue",    dot: "bg-blue-400",    text: "text-blue-400",    bg: "bg-blue-500/10",    bar: "bg-blue-400"    },
  { name: "violet",  dot: "bg-violet-400",  text: "text-violet-400",  bg: "bg-violet-500/10",  bar: "bg-violet-400"  },
  { name: "purple",  dot: "bg-purple-400",  text: "text-purple-400",  bg: "bg-purple-500/10",  bar: "bg-purple-400"  },
  { name: "pink",    dot: "bg-pink-400",    text: "text-pink-400",    bg: "bg-pink-500/10",    bar: "bg-pink-400"    },
  { name: "rose",    dot: "bg-rose-400",    text: "text-rose-400",    bg: "bg-rose-500/10",    bar: "bg-rose-400"    },
];

const COLOR_MAP = new Map<string, ColorEntry>(COLORS.map((c) => [c.name, c]));
function getColorEntry(name?: string): ColorEntry {
  return (name ? COLOR_MAP.get(name) : undefined) ?? COLORS[4]; // default emerald
}

// ─── Date / progress helpers ──────────────────────────────────────────────────

function toIsoDate(d: Date) { return d.toISOString().split("T")[0]; }
function todayIso()         { return toIsoDate(new Date()); }

type DateBadge = { label: string; textClass: string; bgClass: string };

function getDateBadge(targetDate: string, status: GoalStatus): DateBadge {
  if (status === "completed") {
    return { label: "Completed!", textClass: "text-emerald-400", bgClass: "bg-emerald-500/10" };
  }
  if (status === "paused") {
    return { label: "Paused", textClass: "text-zinc-400", bgClass: "bg-zinc-800" };
  }
  const today  = todayIso();
  if (targetDate < today) {
    return { label: "Overdue", textClass: "text-rose-400", bgClass: "bg-rose-500/10" };
  }
  const msDay = 86400000;
  const diff  = Math.round(
    (new Date(targetDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / msDay
  );
  if (diff === 0) return { label: "Due Today", textClass: "text-amber-400", bgClass: "bg-amber-500/10" };
  if (diff <= 30) return { label: `${diff} days left`, textClass: "text-amber-400", bgClass: "bg-amber-500/10" };
  return {
    label: `${diff} days left`,
    textClass: "text-zinc-400",
    bgClass: "bg-zinc-800",
  };
}

function getProgressBarColor(pct: number, status: GoalStatus, colorEntry: ColorEntry): string {
  if (status === "paused")    return "bg-zinc-600";
  if (status === "completed") return "bg-emerald-500";
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 75)  return colorEntry.bar;
  if (pct >= 50)  return "bg-violet-500";
  if (pct >= 25)  return "bg-sky-500";
  return "bg-zinc-600";
}

function formatTargetDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent, className }: {
  label: string; value: string; sub?: string; accent?: string; className?: string;
}) {
  return (
    <div className={cn("dezu-card flex flex-col gap-0.5 rounded-[1.15rem] bg-card/90 p-3 sm:gap-1 sm:p-4", className)}>
      <p className="truncate text-[11px] font-medium text-zinc-500 sm:text-xs">{label}</p>
      <p className={cn("truncate text-base font-bold tabular-nums tracking-tight sm:text-xl", accent ?? "text-zinc-50")}>{value}</p>
      {sub && <p className="truncate text-[11px] text-zinc-600 sm:text-xs">{sub}</p>}
    </div>
  );
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal, onOpen, onEdit, onDelete, onContribute,
}: {
  goal: AppGoal;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onContribute: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const Icon       = getIcon(goal.icon);
  const colorEntry = getColorEntry(goal.color);
  const percentage = goal.targetAmount > 0
    ? (goal.currentAmount / goal.targetAmount) * 100
    : 0;
  const barWidth   = Math.min(percentage, 100);
  const remaining  = goal.targetAmount - goal.currentAmount;
  const dateBadge  = getDateBadge(goal.targetDate, goal.status);
  const barColor   = getProgressBarColor(percentage, goal.status, colorEntry);
  const isDone     = goal.status === "completed";
  const isPaused   = goal.status === "paused";

  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }} className={cn(
      "dezu-card group flex flex-col gap-2 rounded-xl bg-card/90 p-2.5 transition-all hover:ring-1 hover:ring-[var(--theme-primary)]/30 sm:gap-3 sm:rounded-[1.15rem] sm:p-4",
      isDone   ? "ring-emerald-500/30" :
      isPaused ? "ring-zinc-800/50 opacity-70" :
                 "ring-zinc-800 hover:ring-zinc-700"
    )}>
      {/* top row */}
      <div className="flex items-start gap-3">
        <div className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11",
          colorEntry.bg
        )}>
          <Icon size={18} className={colorEntry.text} strokeWidth={1.75} />
          {isDone && (
            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900">
              <CheckCircle2 size={14} className="text-emerald-400" strokeWidth={2} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="text-sm font-semibold text-zinc-100 leading-snug flex-1 min-w-0">{goal.name}</h3>
            <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none sm:inline-flex", dateBadge.bgClass, dateBadge.textClass)}>
              {dateBadge.label}
            </span>
          </div>

          {/* amounts */}
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={cn("text-sm font-bold tabular-nums sm:text-lg", isDone ? "text-emerald-400" : "text-zinc-100")}>
              {formatCurrency(goal.currentAmount)}
            </span>
            <span className="text-xs text-zinc-500">of {formatCurrency(goal.targetAmount)}</span>
          </div>
        </div>
      </div>

      {/* progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="hidden items-center justify-between text-xs sm:flex">
          <span className={cn("font-semibold tabular-nums", isDone ? "text-emerald-400" : "text-zinc-300")}>
            {percentage.toFixed(1)}%
          </span>
          {!isDone && remaining > 0 && (
            <span className="text-zinc-500">{formatCurrency(remaining)} remaining</span>
          )}
          {isDone && (
            <span className="text-emerald-400 font-medium">Goal reached!</span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800 sm:h-2.5">
          <div
            className={cn("h-full rounded-full transition-all duration-700", barColor)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      {/* meta row */}
      <div className="hidden items-center gap-2 text-xs text-zinc-500 flex-wrap sm:flex">
        <span>📅 {formatTargetDate(goal.targetDate)}</span>
        {goal.notes && (
          <span className="truncate max-w-[140px]">· {goal.notes}</span>
        )}
      </div>

      {/* actions row */}
      <div className="hidden items-center gap-2 border-t border-zinc-800 pt-1 sm:flex">
        {!isDone && (
          <button
            onClick={(event) => { event.stopPropagation(); onContribute(); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              colorEntry.bg, colorEntry.text, "hover:opacity-80"
            )}
          >
            <Plus size={12} strokeWidth={2.5} />
            Contribute
          </button>
        )}
        {isDone && (
          <button
            onClick={(event) => { event.stopPropagation(); onContribute(); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
          >
            <ChevronDown size={12} strokeWidth={2} />
            Adjust
          </button>
        )}
        <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={(event) => { event.stopPropagation(); onEdit(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
            title="Edit"
          >
            <Pencil size={13} strokeWidth={2} />
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); onDelete(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ContributeModal ──────────────────────────────────────────────────────────

function GoalDetailsModal({
  goal,
  wallet,
  onClose,
  onContribute,
  onEdit,
  onDelete,
}: {
  goal: AppGoal | null;
  wallet?: GoalWallet;
  onClose: () => void;
  onContribute: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { formatCurrency } = useCurrency();
  if (!goal) return null;

  const percentage = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
  const barWidth = Math.min(percentage, 100);
  const colorEntry = getColorEntry(goal.color);
  const barColor = getProgressBarColor(percentage, goal.status, colorEntry);
  const notes = (goal.notes ?? "").trim();

  return (
    <DetailsModalShell
      open={Boolean(goal)}
      eyebrow="Goal Details"
      title={goal.name}
      onClose={onClose}
      footer={
        <>
          <button onClick={onContribute} className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <Plus size={14} />
            Contribute
          </button>
          <button onClick={onEdit} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            <Pencil size={14} />
            Edit
          </button>
          <button onClick={onDelete} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-rose-400 transition-colors hover:bg-rose-500/10">
            <Trash2 size={14} />
            Delete
          </button>
        </>
      }
    >
          <div className="mb-3 rounded-xl bg-card/80 px-3 py-3 ring-1 ring-border">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-card-foreground">{percentage.toFixed(1)}%</span>
              <span className="text-muted-foreground">{formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${barWidth}%` }} />
            </div>
          </div>

      <DetailRows>
        <DetailRow label="Saved" value={formatCurrency(goal.currentAmount)} accent="font-bold tabular-nums" />
        <DetailRow label="Target" value={formatCurrency(goal.targetAmount)} accent="font-bold tabular-nums" />
        <DetailRow label="Progress" value={`${percentage.toFixed(1)}%`} />
        <DetailRow label="Wallet" value={wallet?.name ?? "No wallet"} />
        <DetailRow label="Target Date" value={formatTargetDate(goal.targetDate)} />
        <DetailRow label="Notes" value={notes || "No notes added"} multiline />
      </DetailRows>
    </DetailsModalShell>
  );
}

const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

function ContributeModal({
  goal,
  wallets,
  userId,
  isOffline,
  onClose,
  onSaved,
}: {
  goal: AppGoal | null;
  wallets: GoalWallet[];
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { formatCurrency } = useCurrency();
  const [mode,    setMode]    = useState<"contribute" | "withdraw">("contribute");
  const [amount,  setAmount]  = useState("");
  const [fromWalletId, setFromWalletId] = useState("");
  const [note, setNote] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (goal) {
      setAmount("");
      setFromWalletId(wallets.find((wallet) => wallet.id !== goal.walletId)?.id ?? wallets[0]?.id ?? "");
      setNote("");
      setError("");
      setMode("contribute");
    }
  }, [goal, wallets]);

  if (!goal) return null;

  const Icon       = getIcon(goal.icon);
  const colorEntry = getColorEntry(goal.color);
  const percentage = goal.targetAmount > 0
    ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
    : 0;
  const linkedWallet = goal.walletId ? wallets.find((wallet) => wallet.id === goal.walletId) : undefined;
  const fromWallet = wallets.find((wallet) => wallet.id === fromWalletId);

  async function handleSubmit() {
    const parsed = Number(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid amount."); return;
    }
    if (!goal) return;
    if (mode === "contribute" && !fromWallet) {
      setError("Select a From Wallet.");
      return;
    }
    if (mode === "contribute" && fromWallet && fromWallet.balance < parsed) {
      setError("Insufficient balance in the selected wallet.");
      return;
    }
    if (
      mode === "contribute" &&
      linkedWallet &&
      fromWallet?.id === linkedWallet.id &&
      !window.confirm("From Wallet is the same as the linked wallet. Continue anyway?")
    ) {
      return;
    }
    setSaving(true); setError("");
    try {
      if (isOffline) {
        if (mode === "contribute") {
          await contributeToGoal({
            goalId: Number(goal.id),
            fromWalletId: Number(fromWallet?.id),
            amount: parsed,
            note,
          });
        } else {
          await addContribution(Number(goal.id), -parsed);
        }
        await onSaved();
        onClose();
        return;
      }

      if (!userId) {
        setError("Please sign in to save a contribution.");
        return;
      }

      const supabase = createClient();
      const nextAmount = Math.max(
        0,
        goal.currentAmount + (mode === "contribute" ? parsed : -parsed)
      );
      const nextStatus = nextAmount >= goal.targetAmount ? "completed" : goal.status === "completed" ? "active" : goal.status;

      if (mode === "withdraw") {
        const { error } = await supabase
          .from("goals")
          .update({
            current_amount: nextAmount,
            status: nextStatus,
          })
          .eq("id", goal.id)
          .eq("user_id", goal.user_id);

        if (error) {
          setError(error.message);
          return;
        }

        await onSaved();
        onClose();
        return;
      }

      const sourceWallet = fromWallet;
      if (!sourceWallet) {
        setError("Select a From Wallet.");
        return;
      }
      const sameWallet = linkedWallet?.id === sourceWallet.id;
      const originalGoalAmount = goal.currentAmount;
      const originalGoalStatus = goal.status;
      let sourceUpdated = false;
      let destinationUpdated = false;
      let goalUpdated = false;

      try {
        if (!sameWallet) {
          const { error: sourceError } = await supabase
            .from("wallets")
            .update({ balance: sourceWallet.balance - parsed })
            .eq("id", sourceWallet.id)
            .eq("user_id", userId);
          if (sourceError) throw sourceError;
          sourceUpdated = true;
        }

        if (linkedWallet && !sameWallet) {
          const { error: destinationError } = await supabase
            .from("wallets")
            .update({ balance: linkedWallet.balance + parsed })
            .eq("id", linkedWallet.id)
            .eq("user_id", userId);
          if (destinationError) throw destinationError;
          destinationUpdated = true;
        }

        const { error: goalError } = await supabase
          .from("goals")
          .update({
            current_amount: nextAmount,
            status: nextStatus,
          })
          .eq("id", goal.id)
          .eq("user_id", userId);
        if (goalError) throw goalError;
        goalUpdated = true;

        const { error: transactionError } = await supabase.from("transactions").insert({
          user_id: userId,
          wallet_id: sourceWallet.id,
          destination_wallet_id: linkedWallet?.id ?? null,
          goal_id: goal.id,
          category_id: null,
          amount: parsed,
          transaction_type: "transfer",
          description: `Goal contribution: ${goal.name}`,
          notes: note.trim() || null,
          transaction_date: todayIso(),
        });
        if (transactionError) throw transactionError;
      } catch (operationError) {
        await Promise.all([
          sourceUpdated
            ? supabase.from("wallets").update({ balance: sourceWallet.balance }).eq("id", sourceWallet.id).eq("user_id", userId)
            : Promise.resolve({ error: null }),
          destinationUpdated && linkedWallet
            ? supabase.from("wallets").update({ balance: linkedWallet.balance }).eq("id", linkedWallet.id).eq("user_id", userId)
            : Promise.resolve({ error: null }),
          goalUpdated
            ? supabase.from("goals").update({ current_amount: originalGoalAmount, status: originalGoalStatus }).eq("id", goal.id).eq("user_id", userId)
            : Promise.resolve({ error: null }),
        ]);
        throw operationError;
      }

      await onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save contribution.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />

      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-sm sm:rounded-2xl">
        {/* header */}
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colorEntry.bg)}>
              <Icon size={15} className={colorEntry.text} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-50">{goal.name}</h2>
              <p className="text-xs text-zinc-500">{formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          {/* mini progress bar */}
          <div className="flex flex-col gap-1.5">
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", colorEntry.bar)}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 text-right">{percentage.toFixed(1)}% complete</p>
          </div>

          {/* mode toggle */}
          <div className="flex items-center gap-0 p-1 bg-zinc-800 rounded-lg w-fit">
            {(["contribute", "withdraw"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
                  mode === m
                    ? m === "contribute"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/20 text-rose-300"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {m === "contribute"
                  ? <><ChevronUp size={13} strokeWidth={2} /> Add</>
                  : <><ChevronDown size={13} strokeWidth={2} /> Withdraw</>}
              </button>
            ))}
          </div>

          {mode === "contribute" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">From Wallet</label>
                <select
                  value={fromWalletId}
                  onChange={(event) => setFromWalletId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors appearance-none"
                >
                  <option value="">Select wallet</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} - {formatCurrency(wallet.balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-xs leading-relaxed text-zinc-400">
                {linkedWallet
                  ? `Linked Wallet: ${linkedWallet.name}. This wallet will receive the contribution.`
                  : "No linked wallet selected. This will only update goal progress."}
              </div>
            </>
          )}

          {/* amount input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Amount</label>
            <div className="relative">
              <CurrencyInputPrefix className="text-zinc-400" />
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
                autoFocus
              />
            </div>

            {/* quick amounts */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  className="theme-hover px-3 py-1 rounded-lg text-xs font-medium bg-[var(--theme-card)] text-muted-foreground transition-colors ring-1 ring-border"
                >
                  +{formatCurrency(q)}
                </button>
              ))}
            </div>
          </div>

          {mode === "contribute" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Note <span className="normal-case text-zinc-600">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Add a note"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors resize-none"
              />
            </div>
          )}

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:pointer-events-none",
              mode === "contribute"
                ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                : "bg-rose-500 hover:bg-rose-400 text-[var(--theme-danger-foreground)]"
            )}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {mode === "contribute" ? "Add Contribution" : "Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── AddEditModal ─────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; goal: AppGoal };

function IconPicker({ selected, selectedColor, onChange }: {
  selected: string; selectedColor: string; onChange: (name: string) => void;
}) {
  const activeDot = getColorEntry(selectedColor).dot;
  return (
    <div className="grid grid-cols-10 gap-1 py-0.5">
      {GOAL_ICONS.map(({ name, icon: Icon }) => {
        const isActive = selected === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            title={name}
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0",
              isActive
                ? `${activeDot} text-zinc-950 ring-2 ring-offset-1 ring-offset-zinc-900 ring-white/30`
                : "bg-zinc-800 text-zinc-400 hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
            )}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

function ColorPicker({ selected, onChange }: { selected: string; onChange: (name: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => onChange(c.name)}
          title={c.name}
          className={cn(
            "w-7 h-7 rounded-full transition-all", c.dot,
            selected === c.name
              ? "ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110"
              : "opacity-60 hover:opacity-100 hover:scale-105"
          )}
        />
      ))}
    </div>
  );
}

function AddEditModal({
  state, wallets, userId, isOffline, onClose, onSaved,
}: {
  state: ModalState;
  wallets: GoalWallet[];
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onSaved: (goal?: AppGoal) => void;
}) {
  const isEdit = state.mode === "edit";

  const [name,          setName]          = useState("");
  const [targetAmount,  setTargetAmount]  = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [targetDate,    setTargetDate]    = useState("");
  const [walletId,      setWalletId]      = useState("");
  const [status,        setStatus]        = useState<GoalStatus>("active");
  const [icon,          setIcon]          = useState("Target");
  const [color,         setColor]         = useState("emerald");
  const [notes,         setNotes]         = useState("");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");

  useEffect(() => {
    if (state.mode === "edit") {
      const g = state.goal;
      setName(g.name);
      setTargetAmount(String(g.targetAmount));
      setCurrentAmount(String(g.currentAmount));
      setTargetDate(g.targetDate);
      setWalletId(g.walletId ?? "");
      setStatus(g.status);
      setIcon(g.icon ?? "Target");
      setColor(g.color ?? "emerald");
      setNotes(g.notes ?? "");
    } else {
      // default targetDate = 6 months from today
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      setName(""); setTargetAmount(""); setCurrentAmount("0");
      setTargetDate(toIsoDate(d));
      setWalletId(""); setStatus("active");
      setIcon("Target"); setColor("emerald"); setNotes("");
    }
    setError("");
  }, [state]);

  async function handleSave() {
    if (state.mode === "closed") return;
    const target  = Number(targetAmount);
    const current = Number(currentAmount);
    if (!name.trim())                              { setError("Name is required.");           return; }
    if (!targetAmount || isNaN(target) || target <= 0) { setError("Enter a valid target amount."); return; }
    if (isNaN(current) || current < 0)             { setError("Current amount cannot be negative."); return; }
    if (!targetDate)                               { setError("Target date is required.");    return; }

    setSaving(true); setError("");
    try {
      if (isOffline) {
        if (state.mode === "add") {
          await createGoal({
            userId: OFFLINE_USER_ID,
            name: name.trim(),
            targetAmount: target,
            currentAmount: current,
            targetDate,
            walletId: walletId ? Number(walletId) : undefined,
            status: status === "cancelled" ? "paused" : status,
            icon,
            color,
            notes: notes.trim() || undefined,
          });
        } else if (state.mode === "edit") {
          await updateGoal(Number(state.goal.id), {
            name: name.trim(),
            targetAmount: target,
            currentAmount: current,
            targetDate,
            walletId: walletId ? Number(walletId) : undefined,
            status: status === "cancelled" ? "paused" : status,
            icon,
            color,
            notes: notes.trim() || undefined,
          });
        }
        onSaved();
        onClose();
        return;
      }

      if (!userId) {
        setError("Please sign in to save a goal.");
        return;
      }

      const supabase = createClient();
      if (state.mode === "add") {
        const { error: insertError } = await loggedSupabase(
          "goals insert",
          supabase.from("goals").insert({
          user_id: userId,
          name: name.trim(),
          target_amount: target,
          current_amount: current,
          wallet_id: walletId || null,
          target_date: targetDate,
          status,
          icon,
          color,
          notes: notes.trim() || null,
          })
        );

        if (insertError) {
          setError(insertError.message);
          return;
        }
      } else if (state.mode === "edit") {
        if (!state.goal.id) {
          setError("Missing goal id. Close and reopen this goal, then try again.");
          return;
        }

        const payload = {
          name: name.trim(),
          target_amount: target,
          current_amount: current,
          wallet_id: walletId || null,
          target_date: targetDate,
          status,
          icon,
          color,
          notes: notes.trim() || null,
        };
        const { data: updatedRows, error: updateError } = await loggedSupabase(
          "goals update",
          supabase
            .from("goals")
            .update(payload)
            .eq("id", state.goal.id)
            .eq("user_id", userId)
            .select("id,user_id,name,target_amount,current_amount,wallet_id,target_date,status,icon,color,notes")
        );

        if (updateError) {
          setError(updateError.message);
          return;
        }

        const updatedGoal = ((updatedRows ?? []) as SupabaseGoalRow[])[0]
          ? mapGoal(((updatedRows ?? []) as SupabaseGoalRow[])[0])
          : {
              ...state.goal,
              name: payload.name,
              targetAmount: target,
              currentAmount: current,
              walletId: walletId || null,
              targetDate,
              status,
              icon,
              color,
              notes,
            };
        onSaved(updatedGoal);
        onClose();
        return;
      }
      onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save goal.");
    } finally {
      setSaving(false);
    }
  }

  if (state.mode === "closed") return null;

  const colorEntry = getColorEntry(color);
  const IconPreview = getIcon(icon);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />

      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl">
        {/* header */}
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colorEntry.bg)}>
              <IconPreview size={15} className={colorEntry.text} strokeWidth={1.75} />
            </div>
            <h2 className="text-base font-semibold text-zinc-50">
              {isEdit ? "Edit Goal" : "New Goal"}
            </h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* scrollable body */}
        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          {/* name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Goal Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency Fund"
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
            />
          </div>

          {/* amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Target Amount</label>
              <div className="relative">
                <CurrencyInputPrefix className="text-zinc-400" />
                <input
                  type="number" min="1" step="1"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="0"
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Current Amount</label>
              <div className="relative">
                <CurrencyInputPrefix className="text-zinc-400" />
                <input
                  type="number" min="0" step="1"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  placeholder="0"
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* target date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Target Date</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors [color-scheme:dark]"
            />
          </div>

          {/* wallet (optional) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Linked Wallet <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <select
              value={walletId || ""}
              onChange={(e) => setWalletId(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors appearance-none"
            >
              <option value="">No wallet linked</option>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          {/* status */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</label>
            <div className="flex items-center gap-0 p-1 bg-zinc-800 rounded-lg w-fit">
              {(["active", "paused", "completed"] as GoalStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
                    status === s
                      ? s === "active"    ? "bg-emerald-500/20 text-emerald-300"
                      : s === "completed" ? "bg-sky-500/20 text-sky-300"
                      :                    "bg-zinc-700 text-zinc-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* icon picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Icon</label>
            <IconPicker selected={icon} selectedColor={color} onChange={setIcon} />
          </div>

          {/* color picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Color</label>
            <ColorPicker selected={color} onChange={setColor} />
          </div>

          {/* notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Notes <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What is this goal for?"
              rows={2}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors resize-none"
            />
          </div>

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* footer */}
        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Create Goal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({
  goal, deleting, error, onConfirm, onClose,
}: {
  goal: AppGoal | null; deleting: boolean; error: string; onConfirm: () => void; onClose: () => void;
}) {
  const { formatCurrency } = useCurrency();
  if (!goal) return null;
  const Icon       = getIcon(goal.icon);
  const colorEntry = getColorEntry(goal.color);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden">
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <Trash2 size={24} className="text-rose-400" strokeWidth={1.75} />
            </div>
          </div>
          <div className="text-center flex flex-col gap-2">
            <h3 className="text-base font-semibold text-zinc-50">Delete goal?</h3>
            <div className="flex items-center justify-center gap-2">
              <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", colorEntry.bg)}>
                <Icon size={12} className={colorEntry.text} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium text-zinc-200">{goal.name}</span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Saved amount of <span className="text-zinc-300 font-medium">{formatCurrency(goal.currentAmount)}</span> and
              all goal data will be permanently removed.
            </p>
            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-rose-500 hover:bg-rose-400 text-[var(--theme-danger-foreground)] transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {deleting && <Loader2 size={13} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── GoalsView (main) ─────────────────────────────────────────────────────────

type FilterTab = "all" | "active" | "completed" | "paused";

function GoalsFilterModal({
  open,
  tabs,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  tabs: Array<{ key: FilterTab; label: string; count: number }>;
  value: FilterTab;
  onChange: (value: FilterTab) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="theme-surface relative w-full rounded-t-2xl shadow-2xl ring-1 ring-border sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-50">Filters</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            <X size={15} />
          </button>
        </div>
        <div className="grid gap-2 px-5 py-5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                onChange(tab.key);
                onClose();
              }}
              className={cn(
                "flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-medium transition-colors",
                value === tab.key ? "theme-selected" : "theme-hover bg-[var(--theme-card)] text-muted-foreground ring-1 ring-border"
              )}
            >
              <span>{tab.label}</span>
              <span className="rounded px-1.5 text-xs font-semibold tabular-nums opacity-75">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GoalsView() {
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const { formatCurrency } = useCurrency();
  const [filter,            setFilter]           = useState<FilterTab>("all");
  const [search,            setSearch]           = useState("");
  const [filterOpen,        setFilterOpen]       = useState(false);
  const [modal,             setModal]            = useState<ModalState>({ mode: "closed" });
  const [detailsTarget,     setDetailsTarget]    = useState<AppGoal | null>(null);
  const [contributeTarget,  setContributeTarget] = useState<AppGoal | null>(null);
  const [deleteTarget,      setDeleteTarget]     = useState<AppGoal | null>(null);
  const [deleting,          setDeleting]         = useState(false);
  const [deleteError,       setDeleteError]      = useState("");
  const [goals,             setGoals]            = useState<AppGoal[]>([]);
  const [wallets,           setWallets]          = useState<GoalWallet[]>([]);
  const [loading,           setLoading]          = useState(true);
  const [loadError,         setLoadError]        = useState("");
  const loadRequestId = useRef(0);

  const loadGoals = useCallback(async (
    isMounted?: () => boolean,
    options?: { silent?: boolean }
  ) => {
    const requestId = ++loadRequestId.current;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setLoadError("");
    const isCurrent = () => requestId === loadRequestId.current && (!isMounted || isMounted());
    try {
      if (authLoading || isLoggingOut) return;
      if (isGuest) {
        const [localGoals, localWallets] = await Promise.all([
          getGoals(OFFLINE_USER_ID),
          getWallets(OFFLINE_USER_ID),
        ]);
        if (!isCurrent()) return;
        setGoals(localGoals.map(localGoalToApp));
        setWallets(localWallets.map((wallet) => ({ id: String(wallet.id), name: wallet.name, balance: Number(wallet.balance) })));
        return;
      }

      if (!user?.id) {
        if (!isCurrent()) return;
        setGoals([]);
        setWallets([]);
        return;
      }

      const supabase = createClient();
      const [goalSettled, walletSettled] = await Promise.allSettled([
        loggedSupabase(
          "goals",
          supabase
            .from("goals")
            .select("id,user_id,name,target_amount,current_amount,wallet_id,target_date,status,icon,color,notes")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("target_date", { ascending: true })
        ),
        loggedSupabase(
          "wallets",
          supabase
            .from("wallets")
            .select("id,name,balance")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("created_at", { ascending: true })
        ),
      ]);

      if (!isCurrent()) return;

      const errors = [goalSettled, walletSettled].map(settledError).filter(Boolean);
      if (errors.length > 0) setLoadError(errors.join(" | "));

      const goalResult = goalSettled.status === "fulfilled" ? goalSettled.value : { data: [] };
      const walletResult = walletSettled.status === "fulfilled" ? walletSettled.value : { data: [] };
      setGoals(((goalResult.data ?? []) as SupabaseGoalRow[]).map(mapGoal));
      setWallets((walletResult.data ?? []) as GoalWallet[]);
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load goals.");
      setGoals([]);
      setWallets([]);
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, user?.id]);

  useEffect(() => {
    let mounted = true;
    loadGoals(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadGoals]);

  const counts = useMemo(() => ({
    all:       goals.length,
    active:    goals.filter((g) => g.status === "active").length,
    completed: goals.filter((g) => g.status === "completed").length,
    paused:    goals.filter((g) => g.status === "paused").length,
  }), [goals]);

  const tabs: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "paused", label: "Paused", count: counts.paused },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return goals.filter((goal) => {
      if (filter !== "all" && goal.status !== filter) return false;
      if (!q) return true;
      return [goal.name, goal.status, goal.targetDate ?? ""].some((value) =>
        value.toLowerCase().includes(q)
      );
    });
  }, [goals, filter, search]);

  const totalSaved  = useMemo(() => goals.filter(g => g.status === "active").reduce((s, g) => s + g.currentAmount, 0), [goals]);
  const totalTarget = useMemo(() => goals.filter(g => g.status === "active").reduce((s, g) => s + g.targetAmount, 0), [goals]);
  const avgProgress = useMemo(() => {
    const active = goals.filter((g) => g.status === "active");
    if (active.length === 0) return 0;
    const sum = active.reduce((s, g) => s + Math.min((g.currentAmount / Math.max(g.targetAmount, 1)) * 100, 100), 0);
    return sum / active.length;
  }, [goals]);

  function handleGoalSaved(updatedGoal?: AppGoal) {
    if (updatedGoal) {
      setGoals((current) =>
        current.map((goal) => goal.id === updatedGoal.id ? updatedGoal : goal)
      );
    }

    void loadGoals(undefined, { silent: true });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (isGuest) {
        await deleteGoal(Number(deleteTarget.id));
        setDeleteTarget(null);
        void loadGoals(undefined, { silent: true });
        return;
      }

      const supabase = createClient();
      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("user_id", deleteTarget.user_id);

      if (error) {
        setDeleteError(error.message);
        return;
      }

      setDeleteTarget(null);
      void loadGoals(undefined, { silent: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete goal.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:space-y-6 sm:px-5 sm:py-7">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-zinc-50 tracking-tight">Goals</h1>
            <p className="mt-0.5 truncate text-sm text-zinc-500">
              {loading ? "Loading…" : `${counts.active} active · ${counts.completed} completed`}
            </p>
          </div>
          <button
            aria-label="Add Goal"
            onClick={() => setModal({ mode: "add" })}
            className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 sm:h-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden min-[390px]:inline sm:inline">Add Goal</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            {loadError && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {loadError}
              </div>
            )}

            {/* summary cards */}
            {goals.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                <SummaryCard
                  label="Active Goals"
                  value={String(counts.active)}
                  sub={`${counts.completed} completed`}
                />
                <SummaryCard
                  label="Total Saved"
                  value={formatCurrency(totalSaved)}
                  sub={`of ${formatCurrency(totalTarget)} target`}
                  accent="text-emerald-400"
                />
                <SummaryCard
                  label="Avg Progress"
                  value={`${avgProgress.toFixed(1)}%`}
                  sub="active goals"
                  accent={avgProgress >= 75 ? "text-emerald-400" : avgProgress >= 50 ? "text-violet-400" : "text-zinc-50"}
                  className="col-span-2 sm:col-span-1"
                />
              </div>
            )}

            {/* toolbar */}
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search goals..." className="h-9 border-zinc-700 bg-zinc-900 pl-9 text-sm" />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
                title="Filters"
                aria-label="Open goal filters"
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>

            {/* goals grid */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
                  <Trophy size={28} className="text-zinc-500" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-300">
                    {filter === "all" ? "No goals yet" : `No ${filter} goals`}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                    {filter === "all"
                      ? "Set a savings goal and track your progress towards it."
                      : `You don't have any ${filter} goals right now.`}
                  </p>
                </div>
                {filter === "all" && (
                  <button
                    onClick={() => setModal({ mode: "add" })}
                    className="theme-hover flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--theme-card)] font-medium text-sm transition-colors ring-1 ring-border"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    Create your first goal
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-4">
                {filtered.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onOpen={() => setDetailsTarget(goal)}
                    onEdit={() => setModal({ mode: "edit", goal })}
                    onDelete={() => setDeleteTarget(goal)}
                    onContribute={() => setContributeTarget(goal)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <AddEditModal
        state={modal}
        wallets={wallets}
        userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
        isOffline={isGuest}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={handleGoalSaved}
      />
      <ContributeModal
        goal={contributeTarget}
        wallets={wallets}
        userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
        isOffline={isGuest}
        onClose={() => setContributeTarget(null)}
        onSaved={loadGoals}
      />
      <GoalDetailsModal
        goal={detailsTarget}
        wallet={detailsTarget?.walletId ? wallets.find((wallet) => wallet.id === detailsTarget.walletId) : undefined}
        onClose={() => setDetailsTarget(null)}
        onContribute={() => {
          if (!detailsTarget) return;
          setContributeTarget(detailsTarget);
          setDetailsTarget(null);
        }}
        onEdit={() => {
          if (!detailsTarget) return;
          setModal({ mode: "edit", goal: detailsTarget });
          setDetailsTarget(null);
        }}
        onDelete={() => {
          if (!detailsTarget) return;
          setDeleteTarget(detailsTarget);
          setDetailsTarget(null);
        }}
      />
      <GoalsFilterModal
        open={filterOpen}
        tabs={tabs}
        value={filter}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />
      <DeleteConfirmModal
        goal={deleteTarget}
        deleting={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onClose={() => {
          setDeleteError("");
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

