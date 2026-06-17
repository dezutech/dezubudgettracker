"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, Repeat,
  Calendar, Tag, Pause, Play, MoreVertical,
  CheckCircle2, RefreshCw, Hash, Clock,
  Search, SlidersHorizontal,
  Utensils, ShoppingCart, Car, Zap, Tv, ShoppingBag,
  Heart, BookOpen, Home, Briefcase, Laptop,
  TrendingUp, Gift, CirclePlus, Music, Film, Coffee,
  Plane, Coins, PiggyBank, Wallet, CreditCard, Banknote,
  Dumbbell, Pizza, Bus, Smartphone, Globe, Package,
  GraduationCap, Stethoscope, Fuel, Building2, Store,
  UtensilsCrossed, Bike,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ensureSupabaseDefaultCategories,
  type SupabaseCategory,
} from "@/lib/supabase/categories";
import { loggedSupabase, settledError } from "@/lib/supabase/query";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import { CurrencyInputPrefix } from "@/components/ui/currency-input-prefix";
import { DetailRow, DetailRows, DetailsModalShell } from "@/components/ui/details-modal";
import { Input } from "@/components/ui/input";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createRecurring,
  deleteRecurring,
  getBills,
  getCategories,
  getRecurringTransactions,
  getWallets,
  setRecurringStatus,
  updateRecurring,
  type DbCategory,
  type DbBill,
  type DbRecurringTransaction,
  type DbWallet,
} from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

// ─── Local types ──────────────────────────────────────────────────────────────

type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
type RecurringType = "income" | "expense";
type RecurringStatus = "active" | "paused" | "completed";
type RecurringEndCondition = "forever" | "end_date" | "occurrences";
type GeneratedBillStatus = "unpaid" | "paid" | "overdue" | "scheduled";

type LinkedGeneratedBill = {
  id: string;
  recurringId: string;
  occurrenceDate: string;
  dueDate: string;
  status: GeneratedBillStatus;
};

type SupabaseWallet = {
  id: string;
  name: string;
};

type SupabaseRecurringRow = {
  id: string;
  user_id: string;
  wallet_id: string | null;
  category_id: string | null;
  title: string;
  amount: number | string;
  transaction_type: RecurringType;
  frequency: RecurringFrequency;
  next_run_date: string;
  is_active: boolean;
  status: RecurringStatus | null;
  end_condition: RecurringEndCondition | null;
  end_date: string | null;
  max_occurrences: number | null;
  occurrences_count: number | null;
};

type SupabaseGeneratedBillRow = {
  id: string;
  recurring_id: string | null;
  generated_occurrence_date?: string | null;
  due_date: string;
  status: GeneratedBillStatus;
};

type AppRecurring = {
  id: string;
  user_id: string;
  walletId: string;
  categoryId: string;
  title: string;
  amount: number;
  type: RecurringType;
  frequency: RecurringFrequency;
  nextRunDate: string;
  isActive: boolean;
  status: RecurringStatus;
  endCondition: RecurringEndCondition;
  endDate?: string;
  maxOccurrences?: number;
  occurrencesCount: number;
  notes?: string;
};

function mapRecurring(row: SupabaseRecurringRow): AppRecurring {
  const status: RecurringStatus = row.status ?? (row.is_active ? "active" : "paused");
  return {
    id: row.id,
    user_id: row.user_id,
    walletId: row.wallet_id ?? "",
    categoryId: row.category_id ?? "",
    title: row.title,
    amount: Number(row.amount),
    type: row.transaction_type,
    frequency: row.frequency,
    nextRunDate: row.next_run_date,
    isActive: status === "active",
    status,
    endCondition: row.end_condition ?? "forever",
    endDate: row.end_date ?? undefined,
    maxOccurrences: row.max_occurrences ?? undefined,
    occurrencesCount: row.occurrences_count ?? 0,
  };
}

function localRecurringToApp(item: DbRecurringTransaction): AppRecurring {
  const status: RecurringStatus = (item.status as RecurringStatus | undefined) ?? (item.isActive ? "active" : "paused");
  return {
    id: String(item.id),
    user_id: item.userId,
    walletId: String(item.walletId),
    categoryId: String(item.categoryId),
    title: item.title,
    amount: item.amount,
    type: item.type === "transfer" ? "expense" : item.type,
    frequency: item.frequency,
    nextRunDate: item.nextRunDate,
    isActive: status === "active",
    status,
    endCondition: (item.endCondition as RecurringEndCondition | undefined) ?? "forever",
    endDate: item.endDate,
    maxOccurrences: item.maxOccurrences,
    occurrencesCount: item.occurrencesCount ?? 0,
    notes: item.notes,
  };
}

function localBillToLinkedGeneratedBill(bill: DbBill): LinkedGeneratedBill | null {
  if (!bill.isRecurring || bill.recurringId == null) return null;
  return {
    id: String(bill.billId ?? bill.id),
    recurringId: String(bill.recurringId),
    occurrenceDate: bill.generatedOccurrenceDate ?? bill.dueDate,
    dueDate: bill.dueDate,
    status: bill.status,
  };
}

function localCategoryToSupabase(category: DbCategory): SupabaseCategory {
  return {
    id: String(category.id),
    user_id: category.userId,
    name: category.name,
    type: category.type === "both" ? "expense" : category.type,
    icon: category.icon,
    color: category.color,
    is_default: category.isDefault,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
    synced_at: null,
    is_deleted: false,
  };
}

function localWalletToSupabase(wallet: DbWallet): SupabaseWallet {
  return { id: String(wallet.id), name: wallet.name };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FREQUENCY_CONFIG: Record<RecurringFrequency, { label: string; color: string; bg: string }> = {
  daily:   { label: "Daily",   color: "text-sky-400",    bg: "bg-sky-500/10"    },
  weekly:  { label: "Weekly",  color: "text-emerald-400",bg: "bg-emerald-500/10"},
  monthly: { label: "Monthly", color: "text-violet-400", bg: "bg-violet-500/10" },
  yearly:  { label: "Yearly",  color: "text-amber-400",  bg: "bg-amber-500/10"  },
};

const STATUS_CONFIG: Record<RecurringStatus, { label: string; color: string; bg: string }> = {
  active:    { label: "Active",    color: "text-emerald-400", bg: "bg-emerald-500/10" },
  paused:    { label: "Paused",    color: "text-zinc-400",    bg: "bg-zinc-800"        },
  completed: { label: "Completed", color: "text-violet-400",  bg: "bg-violet-500/10"  },
};

const ICON_MAP = new Map<string, LucideIcon>([
  ["Utensils", Utensils], ["UtensilsCrossed", UtensilsCrossed], ["Pizza", Pizza],
  ["Coffee", Coffee], ["Store", Store], ["ShoppingCart", ShoppingCart],
  ["ShoppingBag", ShoppingBag], ["Package", Package], ["Car", Car],
  ["Bus", Bus], ["Bike", Bike], ["Plane", Plane], ["Fuel", Fuel],
  ["Zap", Zap], ["Globe", Globe], ["Smartphone", Smartphone], ["Home", Home],
  ["Tv", Tv], ["Film", Film], ["Music", Music],
  ["Heart", Heart], ["Dumbbell", Dumbbell], ["Stethoscope", Stethoscope],
  ["BookOpen", BookOpen], ["GraduationCap", GraduationCap],
  ["Briefcase", Briefcase], ["Building2", Building2], ["Laptop", Laptop],
  ["TrendingUp", TrendingUp], ["Coins", Coins], ["PiggyBank", PiggyBank],
  ["Wallet", Wallet], ["CreditCard", CreditCard], ["Banknote", Banknote],
  ["Gift", Gift], ["CirclePlus", CirclePlus],
]);

const COLOR_MAP = new Map<string, { text: string; bg: string }>([
  ["orange",  { text: "text-orange-400",  bg: "bg-orange-500/10"  }],
  ["amber",   { text: "text-amber-400",   bg: "bg-amber-500/10"   }],
  ["yellow",  { text: "text-yellow-400",  bg: "bg-yellow-500/10"  }],
  ["lime",    { text: "text-lime-400",    bg: "bg-lime-500/10"    }],
  ["emerald", { text: "text-emerald-400", bg: "bg-emerald-500/10" }],
  ["teal",    { text: "text-teal-400",    bg: "bg-teal-500/10"    }],
  ["sky",     { text: "text-sky-400",     bg: "bg-sky-500/10"     }],
  ["blue",    { text: "text-blue-400",    bg: "bg-blue-500/10"    }],
  ["indigo",  { text: "text-indigo-400",  bg: "bg-indigo-500/10"  }],
  ["violet",  { text: "text-violet-400",  bg: "bg-violet-500/10"  }],
  ["purple",  { text: "text-purple-400",  bg: "bg-purple-500/10"  }],
  ["pink",    { text: "text-pink-400",    bg: "bg-pink-500/10"    }],
  ["rose",    { text: "text-rose-400",    bg: "bg-rose-500/10"    }],
  ["zinc",    { text: "text-zinc-400",    bg: "bg-zinc-500/10"    }],
]);

function getIcon(name: string): LucideIcon { return ICON_MAP.get(name) ?? Tag; }
function getColor(name: string) { return COLOR_MAP.get(name) ?? { text: "text-zinc-400", bg: "bg-zinc-500/10" }; }

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string { return d.toISOString().split("T")[0]; }
function todayIso(): string { return toIsoDate(new Date()); }

function nextOccurrence(date: string, frequency: RecurringFrequency): string {
  const d = new Date(date + "T00:00:00");
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  return toIsoDate(d);
}

function formatEndDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type DueBadge = { label: string; textClass: string; bgClass: string };
type PaymentInfo = {
  statusLabel: string;
  statusClass: string;
  dateLabel: string;
  date: string;
  isActionable: boolean;
  isPaidCurrentPeriod: boolean;
};

function getDueBadge(nextRunDate: string): DueBadge {
  const today = todayIso();
  if (nextRunDate < today) {
    return { label: "Overdue", textClass: "text-rose-400", bgClass: "bg-rose-500/10" };
  }
  if (nextRunDate === today) {
    return { label: "Due Today", textClass: "text-amber-400", bgClass: "bg-amber-500/10" };
  }
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = Math.round(
    (new Date(nextRunDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / msPerDay
  );
  if (diff <= 3) {
    return { label: `In ${diff} day${diff !== 1 ? "s" : ""}`, textClass: "text-amber-400", bgClass: "bg-amber-500/10" };
  }
  if (diff <= 7) {
    return { label: `In ${diff} days`, textClass: "text-zinc-400", bgClass: "bg-zinc-800" };
  }
  const d = new Date(nextRunDate + "T00:00:00");
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label, textClass: "text-zinc-400", bgClass: "bg-zinc-800" };
}

function getLinkedGeneratedBill(
  item: AppRecurring,
  billMap: Map<string, LinkedGeneratedBill>
): LinkedGeneratedBill | undefined {
  return billMap.get(`${item.id}:${item.nextRunDate}`);
}

function getPaymentInfo(item: AppRecurring, linkedBill?: LinkedGeneratedBill): PaymentInfo {
  if (linkedBill?.status === "paid") {
    const nextDueDate = nextOccurrence(item.nextRunDate, item.frequency);
    return {
      statusLabel: "Paid this month",
      statusClass: "bg-emerald-500/10 text-emerald-300",
      dateLabel: "Next due",
      date: nextDueDate,
      isActionable: false,
      isPaidCurrentPeriod: true,
    };
  }

  const dueDate = linkedBill?.dueDate ?? item.nextRunDate;
  const today = todayIso();
  if (linkedBill && dueDate < today) {
    return {
      statusLabel: "Overdue",
      statusClass: "bg-rose-500/10 text-rose-300",
      dateLabel: "Due",
      date: dueDate,
      isActionable: true,
      isPaidCurrentPeriod: false,
    };
  }
  if (linkedBill && dueDate === today) {
    return {
      statusLabel: "Due Today",
      statusClass: "bg-amber-500/10 text-amber-300",
      dateLabel: "Due",
      date: dueDate,
      isActionable: true,
      isPaidCurrentPeriod: false,
    };
  }

  const badge = getDueBadge(dueDate);
  return {
    statusLabel: linkedBill ? (linkedBill.status === "scheduled" ? "Scheduled" : badge.label) : "Not generated yet",
    statusClass: linkedBill ? "bg-sky-500/10 text-sky-300" : "bg-zinc-800 text-zinc-400",
    dateLabel: "Next due",
    date: dueDate,
    isActionable: false,
    isPaidCurrentPeriod: false,
  };
}

function recurringPaymentTextClass(payment: PaymentInfo) {
  if (payment.statusClass.includes("text-emerald")) return "text-emerald-300";
  if (payment.statusClass.includes("text-rose")) return "text-rose-300";
  if (payment.statusClass.includes("text-amber")) return "text-amber-300";
  if (payment.statusClass.includes("text-sky")) return "text-sky-300";
  return "text-zinc-500";
}

// ─── ProgressBadge ────────────────────────────────────────────────────────────

function ProgressBadge({ item }: { item: AppRecurring }) {
  if (item.endCondition === "occurrences" && item.maxOccurrences) {
    const pct = Math.min(100, Math.round((item.occurrencesCount / item.maxOccurrences) * 100));
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
          <Hash size={9} strokeWidth={2.5} />
          <span className="font-medium text-zinc-400">{item.occurrencesCount}</span>
          <span>of {item.maxOccurrences}</span>
        </div>
        <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }
  if (item.endCondition === "end_date" && item.endDate) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-zinc-500">
        <Clock size={9} strokeWidth={2.5} />
        <span>Ends {formatEndDate(item.endDate)}</span>
      </div>
    );
  }
  return null;
}

// ─── UpcomingCard ─────────────────────────────────────────────────────────────

function UpcomingCard({
  items,
  catMap,
  billMap,
}: {
  items: AppRecurring[];
  catMap: Map<string, SupabaseCategory>;
  billMap: Map<string, LinkedGeneratedBill>;
}) {
  const { formatCurrency } = useCurrency();
  const dueToday  = items.filter((r) => r.nextRunDate === todayIso());
  const dueSoon   = items.filter((r) => r.nextRunDate !== todayIso());

  if (items.length === 0) return null;

  return (
    <div className="dezu-card flex flex-col gap-3 rounded-[1.15rem] bg-card/90 p-4">
      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-violet-400" strokeWidth={2} />
        <span className="text-sm font-semibold text-zinc-100">Upcoming</span>
        <span className="text-xs font-medium text-zinc-500">next 7 days</span>
        <span className="ml-auto text-xs font-semibold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {dueToday.length > 0 && (
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Due Today</p>
        )}
        {[...dueToday, ...dueSoon].slice(0, 5).map((r) => {
          const cat       = catMap.get(r.categoryId);
          const Icon      = getIcon(cat?.icon ?? "Tag");
          const colorInfo = getColor(cat?.color ?? "zinc");
          const payment   = getPaymentInfo(r, getLinkedGeneratedBill(r, billMap));
          const freqCfg   = FREQUENCY_CONFIG[r.frequency];

          return (
            <div key={r.id} className="flex items-center gap-3 py-2 px-1">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", colorInfo.bg)}>
                <Icon size={14} className={colorInfo.text} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{r.title}</p>
                <p className="text-[11px] text-zinc-500">{freqCfg.label} · {cat?.name ?? "—"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${r.type === "income" ? "text-emerald-400" : "text-zinc-100"}`}>
                  {r.type === "income" ? "+" : "-"}{formatCurrency(r.amount)}
                </p>
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", payment.statusClass)}>
                  {payment.statusLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MobileActionMenu ─────────────────────────────────────────────────────────

function MobileActionMenu({
  item,
  onPause,
  onResume,
  onReactivate,
  onEdit,
  onDelete,
}: {
  item: AppRecurring;
  onPause: () => void;
  onResume: () => void;
  onReactivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const menuItemClass = "flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700/60 transition-colors text-left";

  return (
    <div className="relative sm:hidden" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        aria-label="More actions"
      >
        <MoreVertical size={15} strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-30 min-w-[148px] rounded-xl bg-zinc-800 ring-1 ring-white/10 shadow-xl py-1 overflow-hidden">
          {item.status === "active" && (
            <button className={menuItemClass} onClick={() => { onPause(); setOpen(false); }}>
              <Pause size={13} strokeWidth={2} className="text-amber-400" /> Pause
            </button>
          )}
          {item.status === "paused" && (
            <button className={menuItemClass} onClick={() => { onResume(); setOpen(false); }}>
              <Play size={13} strokeWidth={2} className="text-emerald-400" /> Resume
            </button>
          )}
          {item.status === "completed" && (
            <button className={menuItemClass} onClick={() => { onReactivate(); setOpen(false); }}>
              <RefreshCw size={13} strokeWidth={2} className="text-violet-400" /> Reactivate
            </button>
          )}
          <button className={menuItemClass} onClick={() => { onEdit(); setOpen(false); }}>
            <Pencil size={13} strokeWidth={2} className="text-zinc-400" /> Edit
          </button>
          <div className="my-1 border-t border-zinc-700/60" />
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
            onClick={() => { onDelete(); setOpen(false); }}
          >
            <Trash2 size={13} strokeWidth={2} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── RecurringCard ────────────────────────────────────────────────────────────

function RecurringCard({
  item,
  linkedBill,
  catMap,
  walMap,
  onOpen,
  onEdit,
  onDelete,
  onPause,
  onResume,
  onReactivate,
}: {
  item: AppRecurring;
  linkedBill?: LinkedGeneratedBill;
  catMap: Map<string, SupabaseCategory>;
  walMap: Map<string, SupabaseWallet>;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPause: () => void;
  onResume: () => void;
  onReactivate: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const cat       = catMap.get(item.categoryId);
  const wallet    = walMap.get(item.walletId);
  const Icon      = getIcon(cat?.icon ?? "Tag");
  const colorInfo = getColor(cat?.color ?? "zinc");
  const freqCfg   = FREQUENCY_CONFIG[item.frequency];
  const statusCfg = STATUS_CONFIG[item.status];
  const payment   = getPaymentInfo(item, linkedBill);
  const isCompleted = item.status === "completed";
  const isActive    = item.status === "active";

  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }} className={cn(
      "dezu-card group flex flex-col gap-2 rounded-xl bg-card/90 p-3 transition-all hover:ring-1 hover:ring-[var(--theme-primary)]/30 sm:gap-3 sm:rounded-[1.15rem] sm:p-4",
      isCompleted ? "ring-zinc-800/40 opacity-50" :
      !isActive   ? "ring-zinc-800/50 opacity-65" :
                    "ring-zinc-800 hover:ring-zinc-700"
    )}>
      {/* top row */}
      <div className="flex items-start gap-3">
        <div className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex", colorInfo.bg)}>
          <Icon size={18} className={colorInfo.text} strokeWidth={1.75} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100 truncate">{item.title}</span>
            <span className={cn("hidden rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none sm:inline-flex", freqCfg.bg, freqCfg.color)}>
              {freqCfg.label}
            </span>
            {item.status !== "active" && (
              <span className={cn("hidden rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none sm:inline-flex", statusCfg.bg, statusCfg.color)}>
                {statusCfg.label}
              </span>
            )}
          </div>
          <p className={`mt-0.5 text-sm font-bold tabular-nums sm:text-base ${item.type === "income" ? "text-emerald-400" : "text-zinc-100"}`}>
            {item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}
            <span className={cn("font-medium", recurringPaymentTextClass(payment))}> · {payment.statusLabel}</span>
          </p>
        </div>

        {/* mobile 3-dot menu */}
        <div onClick={(event) => event.stopPropagation()} className="hidden">
          <MobileActionMenu
            item={item}
            onPause={onPause}
            onResume={onResume}
            onReactivate={onReactivate}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* detail row */}
      <div className="hidden items-center gap-2 text-xs text-zinc-500 flex-wrap sm:flex">
        {!isCompleted && (
          <div className="flex items-center gap-1">
            <Calendar size={11} strokeWidth={2} />
            <span className={cn("font-medium px-1.5 py-0.5 rounded", payment.statusClass)}>
              {payment.statusLabel}
            </span>
            <span>{payment.dateLabel}: {formatEndDate(payment.date)}</span>
          </div>
        )}
        {isCompleted && (
          <div className="flex items-center gap-1 text-violet-400">
            <CheckCircle2 size={11} strokeWidth={2} />
            <span className="text-[11px] font-medium">Schedule complete</span>
          </div>
        )}
        {cat && <span>· {cat.name}</span>}
        {wallet && <span>· {wallet.name}</span>}
      </div>

      {/* progress row */}
      <div className="hidden sm:block">
        <ProgressBadge item={item} />
      </div>

      {/* desktop action buttons */}
      <div className="hidden sm:flex items-center gap-1 pt-1 border-t border-zinc-800 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {isActive && (
          <button
            onClick={(event) => { event.stopPropagation(); onPause(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <Pause size={12} strokeWidth={2} /> Pause
          </button>
        )}
        {item.status === "paused" && (
          <button
            onClick={(event) => { event.stopPropagation(); onResume(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <Play size={12} strokeWidth={2} /> Resume
          </button>
        )}
        {isCompleted && (
          <button
            onClick={(event) => { event.stopPropagation(); onReactivate(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            <RefreshCw size={12} strokeWidth={2} /> Reactivate
          </button>
        )}
        {!isCompleted && (
          <button
            onClick={(event) => { event.stopPropagation(); onEdit(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
          >
            <Pencil size={12} strokeWidth={2} /> Edit
          </button>
        )}
        <button
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-auto"
        >
          <Trash2 size={12} strokeWidth={2} /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── AddEditModal ─────────────────────────────────────────────────────────────

function RecurringDetailsModal({
  item,
  linkedBill,
  catMap,
  walMap,
  onClose,
  onEdit,
  onDelete,
  onPause,
  onResume,
  onReactivate,
}: {
  item: AppRecurring | null;
  linkedBill?: LinkedGeneratedBill;
  catMap: Map<string, SupabaseCategory>;
  walMap: Map<string, SupabaseWallet>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPause: () => void;
  onResume: () => void;
  onReactivate: () => void;
}) {
  const { formatCurrency } = useCurrency();
  if (!item) return null;

  const cat = catMap.get(item.categoryId);
  const wallet = walMap.get(item.walletId);
  const payment = getPaymentInfo(item, linkedBill);
  const statusCfg = STATUS_CONFIG[item.status];
  const freqCfg = FREQUENCY_CONFIG[item.frequency];
  const notes = (item.notes ?? "").trim();
  const isCompleted = item.status === "completed";
  const isPaused = item.status === "paused";

  return (
    <DetailsModalShell
      open={Boolean(item)}
      eyebrow="Recurring Details"
      title={item.title}
      onClose={onClose}
      footer={
        <>
          {item.status === "active" && (
            <button onClick={onPause} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/10">
              <Pause size={14} />
              Pause
            </button>
          )}
          {isPaused && (
            <button onClick={onResume} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10">
              <Play size={14} />
              Resume
            </button>
          )}
          {isCompleted && (
            <button onClick={onReactivate} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-violet-400 transition-colors hover:bg-violet-500/10">
              <RefreshCw size={14} />
              Reactivate
            </button>
          )}
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
      <DetailRows>
        <DetailRow label="Amount" value={`${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}`} accent={cn("font-bold tabular-nums", item.type === "income" ? "text-emerald-400" : "text-rose-300")} />
        <DetailRow label="Status" value={payment.statusLabel} accent={recurringPaymentTextClass(payment)} />
        <DetailRow label="Frequency" value={freqCfg.label} accent={freqCfg.color} />
        <DetailRow label="Wallet" value={wallet?.name ?? "No wallet"} />
        <DetailRow label="Category" value={cat?.name ?? "No category"} />
        <DetailRow label={payment.dateLabel} value={formatEndDate(payment.date)} />
        <DetailRow label="End" value={item.endCondition === "forever" ? "No end date" : item.endCondition === "end_date" && item.endDate ? formatEndDate(item.endDate) : `${item.occurrencesCount} of ${item.maxOccurrences ?? 0} occurrences`} />
        <DetailRow label="Notes" value={notes || "No notes added"} multiline />
      </DetailRows>
    </DetailsModalShell>
  );
}

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; item: AppRecurring };

function AddEditModal({
  state,
  categories,
  wallets,
  userId,
  isOffline,
  onClose,
  onSaved,
}: {
  state: ModalState;
  categories: SupabaseCategory[];
  wallets: SupabaseWallet[];
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onSaved: (item?: AppRecurring) => void;
}) {
  const isEdit = state.mode === "edit";

  const [title,          setTitle]          = useState("");
  const [type,           setType]           = useState<"income" | "expense">("expense");
  const [amount,         setAmount]         = useState("");
  const [categoryId,     setCategoryId]     = useState("");
  const [walletId,       setWalletId]       = useState("");
  const [frequency,      setFrequency]      = useState<RecurringFrequency>("monthly");
  const [nextRunDate,    setNextRunDate]     = useState(todayIso());
  const [endCondition,   setEndCondition]   = useState<RecurringEndCondition>("forever");
  const [endDate,        setEndDate]        = useState("");
  const [maxOccurrences, setMaxOccurrences] = useState("");
  const [notes,          setNotes]          = useState("");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");

  useEffect(() => {
    if (state.mode === "edit") {
      const it = state.item;
      setTitle(it.title);
      setType(it.type as "income" | "expense");
      setAmount(String(it.amount));
      setCategoryId(it.categoryId);
      setWalletId(it.walletId);
      setFrequency(it.frequency);
      setNextRunDate(it.nextRunDate);
      setEndCondition(it.endCondition);
      setEndDate(it.endDate ?? "");
      setMaxOccurrences(it.maxOccurrences ? String(it.maxOccurrences) : "");
      setNotes(it.notes ?? "");
    } else {
      setTitle(""); setType("expense"); setAmount("");
      setCategoryId(""); setWalletId("");
      setFrequency("monthly"); setNextRunDate(todayIso());
      setEndCondition("forever"); setEndDate(""); setMaxOccurrences("");
      setNotes("");
    }
    setError("");
  }, [state]);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type]
  );

  function validateEndCondition(): string | null {
    if (endCondition === "end_date") {
      if (!endDate) return "Select an end date.";
      if (endDate <= nextRunDate) return "End date must be after the start date.";
    }
    if (endCondition === "occurrences") {
      const n = Number(maxOccurrences);
      if (!maxOccurrences || isNaN(n) || n < 1) return "Enter a valid number of occurrences (minimum 1).";
    }
    return null;
  }

  async function handleSave() {
    if (state.mode === "closed") return;
    const parsed = Number(amount);
    if (!title.trim()) { setError("Title is required."); return; }
    if (!amount || isNaN(parsed) || parsed <= 0) { setError("Enter a valid amount."); return; }
    if (!categoryId) { setError("Select a category."); return; }
    if (!walletId)   { setError("Select a wallet.");   return; }
    const endErr = validateEndCondition();
    if (endErr) { setError(endErr); return; }

    setSaving(true); setError("");
    try {
      const endConditionPayload = endCondition;
      const endDatePayload = endCondition === "end_date" ? endDate : undefined;
      const maxOccPayload  = endCondition === "occurrences" ? Number(maxOccurrences) : undefined;

      if (isOffline) {
        const payload = {
          userId: OFFLINE_USER_ID,
          title: title.trim(),
          amount: parsed,
          type,
          categoryId: Number(categoryId),
          walletId: Number(walletId),
          frequency,
          nextRunDate,
          isActive: state.mode === "edit" ? state.item.isActive : true,
          status: state.mode === "edit" ? state.item.status : ("active" as RecurringStatus),
          endCondition: endConditionPayload,
          endDate: endDatePayload,
          maxOccurrences: maxOccPayload,
          occurrencesCount: state.mode === "edit" ? state.item.occurrencesCount : 0,
          notes: notes.trim() || undefined,
        };
        if (state.mode === "add") {
          await createRecurring(payload as Parameters<typeof createRecurring>[0]);
        } else if (state.mode === "edit") {
          await updateRecurring(Number(state.item.id), payload);
        }
        onSaved();
        onClose();
        return;
      }

      if (!userId) {
        setError("Please sign in to save a recurring transaction.");
        return;
      }

      const supabase = createClient();
      const payload = {
        user_id: userId,
        title: title.trim(),
        amount: parsed,
        transaction_type: type,
        category_id: categoryId,
        wallet_id: walletId,
        frequency,
        next_run_date: nextRunDate,
        end_condition: endConditionPayload,
        end_date: endDatePayload ?? null,
        max_occurrences: maxOccPayload ?? null,
      };

      if (state.mode === "add") {
        const { error: insertError } = await loggedSupabase(
          "recurring insert",
          supabase.from("recurring_transactions").insert({
            ...payload,
            is_active: true,
            status: "active",
            occurrences_count: 0,
          })
        );
        if (insertError) { setError(insertError.message); return; }
      } else if (state.mode === "edit") {
        if (!state.item.id) {
          setError("Missing recurring transaction id. Close and reopen this item, then try again.");
          return;
        }

        const { data: updatedRows, error: updateError } = await loggedSupabase(
          "recurring update",
          supabase
            .from("recurring_transactions")
            .update(payload)
            .eq("id", state.item.id)
            .eq("user_id", userId)
            .select("id,user_id,wallet_id,category_id,title,amount,transaction_type,frequency,next_run_date,is_active,status,end_condition,end_date,max_occurrences,occurrences_count")
        );

        if (updateError) { setError(updateError.message); return; }

        const updatedItem = ((updatedRows ?? []) as SupabaseRecurringRow[])[0]
          ? mapRecurring(((updatedRows ?? []) as SupabaseRecurringRow[])[0])
          : ({
              ...state.item,
              title: payload.title,
              amount: payload.amount,
              type: payload.transaction_type,
              categoryId: payload.category_id,
              walletId: payload.wallet_id,
              frequency: payload.frequency,
              nextRunDate: payload.next_run_date,
              endCondition: endConditionPayload,
              endDate: endDatePayload,
              maxOccurrences: maxOccPayload,
            } as AppRecurring);
        onSaved(updatedItem);
        onClose();
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recurring transaction.");
    } finally {
      setSaving(false);
    }
  }

  if (state.mode === "closed") return null;

  const selectedCat = categories.find((c) => c.id === categoryId);
  const IconPreview = getIcon(selectedCat?.icon ?? "Repeat");
  const colorInfo   = getColor(selectedCat?.color ?? "zinc");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />

      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl">
        {/* header */}
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colorInfo.bg)}>
              <IconPreview size={15} className={colorInfo.text} strokeWidth={1.75} />
            </div>
            <h2 className="text-base font-semibold text-zinc-50">
              {isEdit ? "Edit Recurring" : "New Recurring"}
            </h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* scrollable body */}
        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          {/* title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Monthly Salary"
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
            />
          </div>

          {/* type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Type</label>
            <div className="flex items-center gap-0 p-1 bg-zinc-800 rounded-lg w-fit">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setCategoryId(""); }}
                  className={cn(
                    "px-5 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
                    type === t
                      ? t === "expense" ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* amount */}
          <div className="flex flex-col gap-1.5">
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
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
              />
            </div>
          </div>

          {/* category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Category</label>
            <select
              value={categoryId || ""}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors appearance-none"
            >
              <option value="">Select category…</option>
              {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* wallet */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Wallet</label>
            <select
              value={walletId || ""}
              onChange={(e) => setWalletId(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors appearance-none"
            >
              <option value="">Select wallet…</option>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          {/* frequency */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Frequency</label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-800 rounded-lg">
              {(["daily", "weekly", "monthly", "yearly"] as RecurringFrequency[]).map((f) => {
                const cfg = FREQUENCY_CONFIG[f];
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFrequency(f)}
                    className={cn(
                      "py-1.5 rounded-md text-xs font-medium transition-colors",
                      frequency === f ? `${cfg.bg} ${cfg.color}` : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* start/next run date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {isEdit ? "Next Run Date" : "Start Date"}
            </label>
            <input
              type="date"
              value={nextRunDate}
              onChange={(e) => setNextRunDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors [color-scheme:dark]"
            />
            {frequency !== "daily" && nextRunDate && (
              <p className="text-xs text-zinc-500">
                Next after that: <span className="text-zinc-400">{nextOccurrence(nextRunDate, frequency)}</span>
              </p>
            )}
          </div>

          {/* end condition */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ends</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-800 rounded-lg">
              {([
                { key: "forever",     label: "Forever"  },
                { key: "end_date",    label: "On Date"  },
                { key: "occurrences", label: "# Times"  },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEndCondition(key)}
                  className={cn(
                    "py-1.5 rounded-md text-xs font-medium transition-colors",
                    endCondition === key
                      ? "bg-violet-500/15 text-violet-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {endCondition === "end_date" && (
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={nextRunDate}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 transition-colors [color-scheme:dark]"
                />
                <p className="text-[11px] text-zinc-500">No transactions will be created after this date.</p>
              </div>
            )}

            {endCondition === "occurrences" && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={maxOccurrences}
                    onChange={(e) => setMaxOccurrences(e.target.value)}
                    placeholder="12"
                    className="h-9 w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 transition-colors"
                  />
                  <span className="text-sm text-zinc-400">occurrences</span>
                </div>
                {isEdit && state.mode === "edit" && maxOccurrences && (
                  <p className="text-[11px] text-zinc-500">
                    {state.item.occurrencesCount ?? 0} of {maxOccurrences} generated so far.
                  </p>
                )}
                <p className="text-[11px] text-zinc-500">Automatically completes after this many transactions.</p>
              </div>
            )}
          </div>

          {/* notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Notes <span className="normal-case text-zinc-600">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note…"
              rows={2}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
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
            {isEdit ? "Save Changes" : "Add Recurring"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({
  item,
  catMap,
  deleting,
  error,
  onConfirm,
  onClose,
}: {
  item: AppRecurring | null;
  catMap: Map<string, SupabaseCategory>;
  deleting: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!item) return null;
  const cat       = catMap.get(item.categoryId);
  const Icon      = getIcon(cat?.icon ?? "Tag");
  const colorInfo = getColor(cat?.color ?? "zinc");

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
            <h3 className="text-base font-semibold text-zinc-50">Delete recurring?</h3>
            <div className="flex items-center justify-center gap-2">
              <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", colorInfo.bg)}>
                <Icon size={12} className={colorInfo.text} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium text-zinc-200">{item.title}</span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              This recurring transaction will be permanently removed. Past generated transactions are not affected.
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

// ─── RecurringView (main) ─────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "paused" | "completed";
type TypeFilter   = "all" | "income" | "expense" | "transfer";
type FrequencyFilter = "all" | RecurringFrequency;

type RecurringFilterCounts = {
  status: Record<StatusFilter, number>;
  type: Record<TypeFilter, number>;
  frequency: Record<FrequencyFilter, number>;
};

function RecurringFilterSheet({
  open,
  statusValue,
  typeValue,
  frequencyValue,
  counts,
  onApply,
  onClear,
  onClose,
}: {
  open: boolean;
  statusValue: StatusFilter;
  typeValue: TypeFilter;
  frequencyValue: FrequencyFilter;
  counts: RecurringFilterCounts;
  onApply: (filters: { status: StatusFilter; type: TypeFilter; frequency: FrequencyFilter }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draftStatus, setDraftStatus] = useState<StatusFilter>(statusValue);
  const [draftType, setDraftType] = useState<TypeFilter>(typeValue);
  const [draftFrequency, setDraftFrequency] = useState<FrequencyFilter>(frequencyValue);

  useEffect(() => {
    if (!open) return;
    setDraftStatus(statusValue);
    setDraftType(typeValue);
    setDraftFrequency(frequencyValue);
  }, [open, statusValue, typeValue, frequencyValue]);

  if (!open) return null;

  const statusOptions: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "paused", label: "Paused" },
    { key: "completed", label: "Completed" },
  ];
  const typeOptions: Array<{ key: TypeFilter; label: string }> = [
    { key: "all", label: "All Types" },
    { key: "income", label: "Income" },
    { key: "expense", label: "Expense" },
    { key: "transfer", label: "Transfer" },
  ];
  const frequencyOptions: Array<{ key: FrequencyFilter; label: string }> = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
  ];

  const optionClass = (selected: boolean) => cn(
    "flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-medium transition-colors",
    selected ? "theme-selected" : "theme-hover bg-[var(--theme-card)] text-muted-foreground ring-1 ring-border"
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="theme-surface relative w-full rounded-t-2xl shadow-2xl ring-1 ring-border sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-card-foreground">Filters</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Status</p>
              <div className="grid gap-2">
                {statusOptions.map((option) => (
                  <button key={option.key} type="button" onClick={() => setDraftStatus(option.key)} className={optionClass(draftStatus === option.key)}>
                    <span>{option.label}</span>
                    <span className="rounded px-1.5 text-xs font-semibold tabular-nums opacity-75">{counts.status[option.key]}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Type</p>
              <div className="grid grid-cols-2 gap-2">
                {typeOptions.map((option) => (
                  <button key={option.key} type="button" onClick={() => setDraftType(option.key)} className={optionClass(draftType === option.key)}>
                    <span>{option.label}</span>
                    <span className="rounded px-1.5 text-xs font-semibold tabular-nums opacity-75">{counts.type[option.key]}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Frequency</p>
              <div className="grid grid-cols-2 gap-2">
                {frequencyOptions.map((option) => (
                  <button key={option.key} type="button" onClick={() => setDraftFrequency(option.key)} className={optionClass(draftFrequency === option.key)}>
                    <span>{option.label}</span>
                    <span className="rounded px-1.5 text-xs font-semibold tabular-nums opacity-75">{counts.frequency[option.key]}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="theme-hover flex-1 rounded-lg bg-[var(--theme-card)] px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-border transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              onApply({ status: draftStatus, type: draftType, frequency: draftFrequency });
              onClose();
            }}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecurringView() {
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>("all");
  const [search,       setSearch]       = useState("");
  const [filterOpen,    setFilterOpen]    = useState(false);
  const [modal,         setModal]         = useState<ModalState>({ mode: "closed" });
  const [detailsTarget, setDetailsTarget] = useState<AppRecurring | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<AppRecurring | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState("");
  const [actioning,    setActioning]    = useState<string | null>(null);
  const [recurring,    setRecurring]    = useState<AppRecurring[]>([]);
  const [linkedBills,  setLinkedBills]  = useState<LinkedGeneratedBill[]>([]);
  const [categories,   setCategories]   = useState<SupabaseCategory[]>([]);
  const [wallets,      setWallets]      = useState<SupabaseWallet[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState("");
  const [actionError,  setActionError]  = useState("");
  const loadRequestId = useRef(0);

  const loadRecurring = useCallback(async (
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
        const [localRecurring, localCategories, localWallets, localBills] = await Promise.all([
          getRecurringTransactions(OFFLINE_USER_ID),
          getCategories(OFFLINE_USER_ID),
          getWallets(OFFLINE_USER_ID),
          getBills(OFFLINE_USER_ID),
        ]);
        if (!isCurrent()) return;
        setRecurring(localRecurring.map(localRecurringToApp));
        setLinkedBills(localBills.map(localBillToLinkedGeneratedBill).filter((bill): bill is LinkedGeneratedBill => Boolean(bill)));
        setCategories(localCategories.map(localCategoryToSupabase));
        setWallets(localWallets.map(localWalletToSupabase));
        return;
      }

      if (!user?.id) {
        if (!isCurrent()) return;
        setRecurring([]);
        setLinkedBills([]);
        setCategories([]);
        setWallets([]);
        return;
      }

      const supabase = createClient();
      const [recurringSettled, categoriesSettled, walletSettled, billsSettled] = await Promise.allSettled([
        loggedSupabase(
          "recurring",
          supabase
            .from("recurring_transactions")
            .select("id,user_id,wallet_id,category_id,title,amount,transaction_type,frequency,next_run_date,is_active,status,end_condition,end_date,max_occurrences,occurrences_count")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("next_run_date", { ascending: true })
        ),
        ensureSupabaseDefaultCategories(user.id),
        loggedSupabase(
          "wallets",
          supabase
            .from("wallets")
            .select("id,name")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("created_at", { ascending: true })
        ),
        loggedSupabase(
          "recurring linked bills",
          supabase
            .from("bills")
            .select("id,recurring_id,generated_occurrence_date,due_date,status")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .eq("is_recurring", true)
            .not("recurring_id", "is", null)
        ),
      ]);

      if (!isCurrent()) return;

      const errors = [recurringSettled, categoriesSettled, walletSettled, billsSettled].map(settledError).filter(Boolean);
      if (errors.length > 0) setLoadError(errors.join(" | "));

      const recurringResult   = recurringSettled.status   === "fulfilled" ? recurringSettled.value   : { data: [] };
      const categoriesResult  = categoriesSettled.status  === "fulfilled" ? categoriesSettled.value  : [];
      const walletResult      = walletSettled.status      === "fulfilled" ? walletSettled.value      : { data: [] };
      const billsResult       = billsSettled.status       === "fulfilled" ? billsSettled.value       : { data: [] };
      setRecurring(((recurringResult.data ?? []) as SupabaseRecurringRow[]).map(mapRecurring));
      setLinkedBills(((billsResult.data ?? []) as SupabaseGeneratedBillRow[])
        .filter((bill) => bill.recurring_id)
        .map((bill) => ({
          id: bill.id,
          recurringId: bill.recurring_id as string,
          occurrenceDate: bill.generated_occurrence_date ?? bill.due_date,
          dueDate: bill.due_date,
          status: bill.status,
        })));
      setCategories(categoriesResult);
      setWallets((walletResult.data ?? []) as SupabaseWallet[]);
    } catch (err) {
      if (!isCurrent()) return;
      setLoadError(err instanceof Error ? err.message : "Failed to load recurring transactions.");
      setRecurring([]);
      setLinkedBills([]);
      setCategories([]);
      setWallets([]);
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, user?.id]);

  useEffect(() => {
    let mounted = true;
    loadRecurring(() => mounted);
    return () => { mounted = false; };
  }, [loadRecurring]);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const walMap = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);
  const linkedBillMap = useMemo(
    () => new Map(linkedBills.map((bill) => [`${bill.recurringId}:${bill.occurrenceDate}`, bill])),
    [linkedBills]
  );

  const upcomingWithOverdue = useMemo(() => {
    const inWeek = new Date();
    inWeek.setDate(inWeek.getDate() + 7);
    const inWeekStr = toIsoDate(inWeek);
    return recurring.filter((r) => {
      if (r.status !== "active") return false;
      const payment = getPaymentInfo(r, getLinkedGeneratedBill(r, linkedBillMap));
      return !payment.isPaidCurrentPeriod && payment.date <= inWeekStr;
    });
  }, [linkedBillMap, recurring]);

  const filtered = useMemo(() => {
    let result = recurring;
    if (statusFilter !== "all") result = result.filter((r) => r.status === statusFilter);
    if (typeFilter !== "all")   result = result.filter((r) => typeFilter !== "transfer" && r.type === typeFilter);
    if (frequencyFilter !== "all") result = result.filter((r) => r.frequency === frequencyFilter);
    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((r) => {
        const categoryName = r.categoryId ? catMap.get(r.categoryId)?.name ?? "" : "";
        const walletName = r.walletId ? walMap.get(r.walletId)?.name ?? "" : "";
        return [
          r.title,
          r.type,
          r.frequency,
          r.status,
          categoryName,
          walletName,
        ].some((value) => value.toLowerCase().includes(query));
      });
    }
    return result;
  }, [catMap, frequencyFilter, recurring, search, statusFilter, typeFilter, walMap]);

  const counts = useMemo<RecurringFilterCounts>(() => ({
    status: {
      all: recurring.length,
      active: recurring.filter((r) => r.status === "active").length,
      paused: recurring.filter((r) => r.status === "paused").length,
      completed: recurring.filter((r) => r.status === "completed").length,
    },
    type: {
      all: recurring.length,
      income: recurring.filter((r) => r.type === "income").length,
      expense: recurring.filter((r) => r.type === "expense").length,
      transfer: 0,
    },
    frequency: {
      all: recurring.length,
      daily: recurring.filter((r) => r.frequency === "daily").length,
      weekly: recurring.filter((r) => r.frequency === "weekly").length,
      monthly: recurring.filter((r) => r.frequency === "monthly").length,
      yearly: recurring.filter((r) => r.frequency === "yearly").length,
    },
  }), [recurring]);

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || frequencyFilter !== "all" || search.trim().length > 0;

  function handleRecurringSaved(updatedItem?: AppRecurring) {
    if (updatedItem) {
      setRecurring((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item));
    }
    void loadRecurring(undefined, { silent: true });
  }

  async function handleSetStatus(item: AppRecurring, newStatus: RecurringStatus) {
    setActioning(item.id);
    setActionError("");
    try {
      if (isGuest) {
        await setRecurringStatus(Number(item.id), newStatus);
        setRecurring((current) =>
          current.map((r) => r.id === item.id ? { ...r, status: newStatus, isActive: newStatus === "active" } : r)
        );
        void loadRecurring(undefined, { silent: true });
        return;
      }

      const supabase = createClient();
      const { error } = await supabase
        .from("recurring_transactions")
        .update({ is_active: newStatus === "active", status: newStatus })
        .eq("id", item.id)
        .eq("user_id", item.user_id);

      if (error) { setActionError(error.message); return; }

      setRecurring((current) =>
        current.map((r) => r.id === item.id ? { ...r, status: newStatus, isActive: newStatus === "active" } : r)
      );
      void loadRecurring(undefined, { silent: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update recurring transaction.");
    } finally {
      setActioning(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (isGuest) {
        await deleteRecurring(Number(deleteTarget.id));
        setDeleteTarget(null);
        setRecurring((current) => current.filter((item) => item.id !== deleteTarget.id));
        void loadRecurring(undefined, { silent: true });
        return;
      }

      const supabase = createClient();
      const { error } = await supabase
        .from("recurring_transactions")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("user_id", deleteTarget.user_id);

      if (error) { setDeleteError(error.message); return; }

      setDeleteTarget(null);
      setRecurring((current) => current.filter((item) => item.id !== deleteTarget.id));
      void loadRecurring(undefined, { silent: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete recurring transaction.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="px-5 py-7 max-w-4xl mx-auto space-y-6">
        {/* page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-50 tracking-tight">Recurring</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {loading
                ? "Loading…"
                : `${counts.status.active} active · ${counts.status.paused} paused${counts.status.completed > 0 ? ` · ${counts.status.completed} completed` : ""}`
              }
            </p>
          </div>
          <button
            onClick={() => setModal({ mode: "add" })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors shrink-0"
          >
            <Plus size={15} strokeWidth={2.5} />
            Add Recurring
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

            {actionError && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {actionError}
              </div>
            )}

            {/* upcoming */}
            {upcomingWithOverdue.length > 0 && (
              <UpcomingCard items={upcomingWithOverdue} catMap={catMap} billMap={linkedBillMap} />
            )}

            {/* mobile search and filters */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recurring..."
                  className="h-9 border-zinc-700 bg-zinc-900 pl-9 pr-8 text-sm"
                />
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
                aria-label="Open recurring filters"
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>

            {/* desktop filter bar */}
            <div className="hidden items-center gap-2 flex-wrap md:flex">
              {/* status tabs */}
              <div className="flex items-center gap-0.5 p-1 bg-zinc-900 rounded-lg ring-1 ring-zinc-800">
                {(
                  [
                    { key: "all",       label: "All"       },
                    { key: "active",    label: "Active"    },
                    { key: "paused",    label: "Paused"    },
                    { key: "completed", label: "Completed" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      statusFilter === key
                        ? key === "active"    ? "bg-emerald-500/15 text-emerald-300"
                        : key === "paused"    ? "bg-zinc-700 text-zinc-300"
                        : key === "completed" ? "bg-violet-500/15 text-violet-300"
                        : "theme-selected"
                        : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    {label}
                    <span className={cn("text-[10px] font-semibold tabular-nums min-w-[16px] text-center rounded px-1", statusFilter === key ? "opacity-70" : "text-zinc-600")}>
                      {counts.status[key]}
                    </span>
                  </button>
                ))}
              </div>

              {/* type filter */}
              <div className="flex items-center gap-0.5 p-1 bg-zinc-900 rounded-lg ring-1 ring-zinc-800">
                {(
                  [
                    { key: "all",     label: "All Types" },
                    { key: "income",  label: "Income"    },
                    { key: "expense", label: "Expense"   },
                    { key: "transfer", label: "Transfer" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setTypeFilter(key)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      typeFilter === key
                        ? key === "income"  ? "bg-emerald-500/15 text-emerald-300"
                        : key === "expense" ? "bg-rose-500/15 text-rose-300"
                        : key === "transfer" ? "bg-sky-500/15 text-sky-300"
                        : "theme-selected"
                        : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
                  <Repeat size={28} className="text-zinc-500" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-300">
                    {!hasActiveFilters
                      ? "No recurring transactions"
                      : "No matching recurring transactions"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                    Set up recurring transactions to automatically track repeating income or expenses.
                  </p>
                </div>
                {!hasActiveFilters && (
                  <button
                    onClick={() => setModal({ mode: "add" })}
                    className="theme-hover flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--theme-card)] font-medium text-sm transition-colors ring-1 ring-border"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    Add your first recurring
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((item) => (
                  <RecurringCard
                    key={item.id}
                    item={item}
                    linkedBill={getLinkedGeneratedBill(item, linkedBillMap)}
                    catMap={catMap}
                    walMap={walMap}
                    onOpen={() => setDetailsTarget(item)}
                    onEdit={() => setModal({ mode: "edit", item })}
                    onDelete={() => setDeleteTarget(item)}
                    onPause={() => !actioning && handleSetStatus(item, "paused")}
                    onResume={() => !actioning && handleSetStatus(item, "active")}
                    onReactivate={() => !actioning && handleSetStatus(item, "active")}
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
        categories={categories}
        wallets={wallets}
        userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
        isOffline={isGuest}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={handleRecurringSaved}
      />
      <RecurringFilterSheet
        open={filterOpen}
        statusValue={statusFilter}
        typeValue={typeFilter}
        frequencyValue={frequencyFilter}
        counts={counts}
        onApply={({ status, type, frequency }) => {
          setStatusFilter(status);
          setTypeFilter(type);
          setFrequencyFilter(frequency);
        }}
        onClear={() => {
          setStatusFilter("all");
          setTypeFilter("all");
          setFrequencyFilter("all");
        }}
        onClose={() => setFilterOpen(false)}
      />
      <RecurringDetailsModal
        item={detailsTarget}
        linkedBill={detailsTarget ? getLinkedGeneratedBill(detailsTarget, linkedBillMap) : undefined}
        catMap={catMap}
        walMap={walMap}
        onClose={() => setDetailsTarget(null)}
        onEdit={() => {
          if (!detailsTarget) return;
          setModal({ mode: "edit", item: detailsTarget });
          setDetailsTarget(null);
        }}
        onDelete={() => {
          if (!detailsTarget) return;
          setDeleteTarget(detailsTarget);
          setDetailsTarget(null);
        }}
        onPause={() => {
          if (!detailsTarget || actioning) return;
          const target = detailsTarget;
          setDetailsTarget(null);
          void handleSetStatus(target, "paused");
        }}
        onResume={() => {
          if (!detailsTarget || actioning) return;
          const target = detailsTarget;
          setDetailsTarget(null);
          void handleSetStatus(target, "active");
        }}
        onReactivate={() => {
          if (!detailsTarget || actioning) return;
          const target = detailsTarget;
          setDetailsTarget(null);
          void handleSetStatus(target, "active");
        }}
      />
      <DeleteConfirmModal
        item={deleteTarget}
        catMap={catMap}
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
