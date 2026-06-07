"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, Repeat,
  Calendar, Tag, Pause, Play,
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
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createRecurring,
  deleteRecurring,
  getCategories,
  getRecurringTransactions,
  getWallets,
  toggleRecurring,
  updateRecurring,
  type DbCategory,
  type DbRecurringTransaction,
  type DbWallet,
} from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
type RecurringType = "income" | "expense";

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
  notes?: string;
};

function mapRecurring(row: SupabaseRecurringRow): AppRecurring {
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
    isActive: row.is_active,
  };
}

function localRecurringToApp(item: DbRecurringTransaction): AppRecurring {
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
    isActive: item.isActive,
    notes: item.notes,
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

type DueBadge = { label: string; textClass: string; bgClass: string };

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


// ─── UpcomingCard ─────────────────────────────────────────────────────────────

function UpcomingCard({
  items,
  catMap,
}: {
  items: AppRecurring[];
  catMap: Map<string, SupabaseCategory>;
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
          const badge     = getDueBadge(r.nextRunDate);
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
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", badge.bgClass, badge.textClass)}>
                  {badge.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RecurringCard ────────────────────────────────────────────────────────────

function RecurringCard({
  item,
  catMap,
  walMap,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: AppRecurring;
  catMap: Map<string, SupabaseCategory>;
  walMap: Map<string, SupabaseWallet>;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const cat       = catMap.get(item.categoryId);
  const wallet    = walMap.get(item.walletId);
  const Icon      = getIcon(cat?.icon ?? "Tag");
  const colorInfo = getColor(cat?.color ?? "zinc");
  const freqCfg   = FREQUENCY_CONFIG[item.frequency];
  const badge     = getDueBadge(item.nextRunDate);

  return (
    <div className={cn(
      "dezu-card flex flex-col gap-3 rounded-[1.15rem] bg-card/90 p-4 transition-all group",
      item.isActive ? "ring-zinc-800 hover:ring-zinc-700" : "ring-zinc-800/50 opacity-60"
    )}>
      {/* top row */}
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", colorInfo.bg)}>
          <Icon size={18} className={colorInfo.text} strokeWidth={1.75} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100 truncate">{item.title}</span>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none", freqCfg.bg, freqCfg.color)}>
              {freqCfg.label}
            </span>
            {!item.isActive && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none bg-zinc-800 text-zinc-500">
                Paused
              </span>
            )}
          </div>
          <p className={`text-base font-bold mt-0.5 tabular-nums ${item.type === "income" ? "text-emerald-400" : "text-zinc-100"}`}>
            {item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}
          </p>
        </div>

        {/* active toggle */}
        <button
          onClick={onToggle}
          title={item.isActive ? "Pause" : "Resume"}
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
            item.isActive
              ? "text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10"
              : "text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10"
          )}
        >
          {item.isActive ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>
      </div>

      {/* detail row */}
      <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
        <div className="flex items-center gap-1">
          <Calendar size={11} strokeWidth={2} />
          <span>Next:</span>
          <span className={cn("font-medium px-1.5 py-0.5 rounded", badge.bgClass, badge.textClass)}>
            {badge.label}
          </span>
        </div>
        {cat && <span>· {cat.name}</span>}
        {wallet && <span>· {wallet.name}</span>}
        {item.notes && <span className="truncate max-w-[120px]">· {item.notes}</span>}
      </div>

      {/* action buttons */}
      <div className="flex items-center gap-1 pt-1 border-t border-zinc-800 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
        >
          <Pencil size={12} strokeWidth={2} /> Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-auto"
        >
          <Trash2 size={12} strokeWidth={2} /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── AddEditModal ─────────────────────────────────────────────────────────────

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
  const { symbol } = useCurrency();
  const isEdit = state.mode === "edit";

  const [title,       setTitle]       = useState("");
  const [type,        setType]        = useState<"income" | "expense">("expense");
  const [amount,      setAmount]      = useState("");
  const [categoryId,  setCategoryId]  = useState("");
  const [walletId,    setWalletId]    = useState("");
  const [frequency,   setFrequency]   = useState<RecurringFrequency>("monthly");
  const [nextRunDate, setNextRunDate] = useState(todayIso());
  const [isActive,    setIsActive]    = useState(true);
  const [notes,       setNotes]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

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
      setIsActive(it.isActive);
      setNotes(it.notes ?? "");
    } else {
      setTitle(""); setType("expense"); setAmount("");
      setCategoryId(""); setWalletId("");
      setFrequency("monthly"); setNextRunDate(todayIso());
      setIsActive(true); setNotes("");
    }
    setError("");
  }, [state]);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type]
  );

  async function handleSave() {
    if (state.mode === "closed") return;
    const parsed = Number(amount);
    if (!title.trim()) { setError("Title is required."); return; }
    if (!amount || isNaN(parsed) || parsed <= 0) { setError("Enter a valid amount."); return; }
    if (!categoryId) { setError("Select a category."); return; }
    if (!walletId)   { setError("Select a wallet.");   return; }

    setSaving(true); setError("");
    try {
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
          isActive,
          notes: notes.trim() || undefined,
        };
        if (state.mode === "add") {
          await createRecurring(payload);
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
        is_active: isActive,
      };

      if (state.mode === "add") {
        const { error: insertError } = await loggedSupabase(
          "recurring insert",
          supabase.from("recurring_transactions").insert(payload)
        );

        if (insertError) {
          setError(insertError.message);
          return;
        }
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
            .select("id,user_id,wallet_id,category_id,title,amount,transaction_type,frequency,next_run_date,is_active")
        );

        if (updateError) {
          setError(updateError.message);
          return;
        }

        const updatedItem = ((updatedRows ?? []) as SupabaseRecurringRow[])[0]
          ? mapRecurring(((updatedRows ?? []) as SupabaseRecurringRow[])[0])
          : {
              ...state.item,
              title: payload.title,
              amount: payload.amount,
              type: payload.transaction_type,
              categoryId: payload.category_id,
              walletId: payload.wallet_id,
              frequency: payload.frequency,
              nextRunDate: payload.next_run_date,
              isActive: payload.is_active,
            };
        onSaved(updatedItem);
        onClose();
        return;
      }
      onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save recurring transaction.");
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
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400 pointer-events-none">{symbol}</span>
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-7 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
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

          {/* next run date */}
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

          {/* active toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-zinc-200">Active</p>
              <p className="text-xs text-zinc-500">Paused recurring won't generate transactions</p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors focus:outline-none shrink-0",
                isActive ? "bg-emerald-500" : "bg-zinc-700"
              )}
            >
              <span className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                isActive ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
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

type FilterTab = "all" | "active" | "paused";

export function RecurringView() {
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const [filter,       setFilter]       = useState<FilterTab>("all");
  const [modal,        setModal]        = useState<ModalState>({ mode: "closed" });
  const [deleteTarget, setDeleteTarget] = useState<AppRecurring | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState("");
  const [toggling,     setToggling]     = useState<string | null>(null);
  const [recurring,    setRecurring]    = useState<AppRecurring[]>([]);
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
        const [localRecurring, localCategories, localWallets] = await Promise.all([
          getRecurringTransactions(OFFLINE_USER_ID),
          getCategories(OFFLINE_USER_ID),
          getWallets(OFFLINE_USER_ID),
        ]);
        if (!isCurrent()) return;
        setRecurring(localRecurring.map(localRecurringToApp));
        setCategories(localCategories.map(localCategoryToSupabase));
        setWallets(localWallets.map(localWalletToSupabase));
        return;
      }

      if (!user?.id) {
        if (!isCurrent()) return;
        setRecurring([]);
        setCategories([]);
        setWallets([]);
        return;
      }

      const supabase = createClient();
      const [recurringSettled, categoriesSettled, walletSettled] = await Promise.allSettled([
        loggedSupabase(
          "recurring",
          supabase
            .from("recurring_transactions")
            .select("id,user_id,wallet_id,category_id,title,amount,transaction_type,frequency,next_run_date,is_active")
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
      ]);

      if (!isCurrent()) return;

      const errors = [recurringSettled, categoriesSettled, walletSettled].map(settledError).filter(Boolean);
      if (errors.length > 0) setLoadError(errors.join(" | "));

      const recurringResult = recurringSettled.status === "fulfilled" ? recurringSettled.value : { data: [] };
      const categoriesResult = categoriesSettled.status === "fulfilled" ? categoriesSettled.value : [];
      const walletResult = walletSettled.status === "fulfilled" ? walletSettled.value : { data: [] };
      setRecurring(((recurringResult.data ?? []) as SupabaseRecurringRow[]).map(mapRecurring));
      setCategories(categoriesResult);
      setWallets((walletResult.data ?? []) as SupabaseWallet[]);
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load recurring transactions.");
      setRecurring([]);
      setCategories([]);
      setWallets([]);
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, user?.id]);

  useEffect(() => {
    let mounted = true;
    loadRecurring(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadRecurring]);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const walMap = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);

  // upcoming = active items due within 7 days
  const upcoming = useMemo(() => {
    const today   = todayIso();
    const inWeek  = new Date();
    inWeek.setDate(inWeek.getDate() + 7);
    const inWeekStr = toIsoDate(inWeek);
    return recurring.filter((r) => r.isActive && r.nextRunDate >= today && r.nextRunDate <= inWeekStr);
  }, [recurring]);

  // also include overdue as "upcoming"
  const upcomingWithOverdue = useMemo(() => {
    const today = todayIso();
    const inWeek = new Date();
    inWeek.setDate(inWeek.getDate() + 7);
    const inWeekStr = toIsoDate(inWeek);
    return recurring.filter((r) => r.isActive && r.nextRunDate <= inWeekStr);
  }, [recurring]);

  const filtered = useMemo(() => {
    if (filter === "active") return recurring.filter((r) => r.isActive);
    if (filter === "paused") return recurring.filter((r) => !r.isActive);
    return recurring;
  }, [recurring, filter]);

  const counts = useMemo(() => ({
    all:    recurring.length,
    active: recurring.filter((r) => r.isActive).length,
    paused: recurring.filter((r) => !r.isActive).length,
  }), [recurring]);

  function handleRecurringSaved(updatedItem?: AppRecurring) {
    if (updatedItem) {
      setRecurring((current) =>
        current.map((item) => item.id === updatedItem.id ? updatedItem : item)
      );
    }

    void loadRecurring(undefined, { silent: true });
  }

  async function handleToggle(item: AppRecurring) {
    setToggling(item.id);
    setActionError("");
    try {
      if (isGuest) {
        await toggleRecurring(Number(item.id), !item.isActive);
        setRecurring((current) =>
          current.map((recurringItem) =>
            recurringItem.id === item.id ? { ...recurringItem, isActive: !item.isActive } : recurringItem
          )
        );
        void loadRecurring(undefined, { silent: true });
        return;
      }

      const supabase = createClient();
      const { error } = await supabase
        .from("recurring_transactions")
        .update({ is_active: !item.isActive })
        .eq("id", item.id)
        .eq("user_id", item.user_id);

      if (error) {
        setActionError(error.message);
        return;
      }

      setRecurring((current) =>
        current.map((recurringItem) =>
          recurringItem.id === item.id
            ? { ...recurringItem, isActive: !item.isActive }
            : recurringItem
        )
      );
      void loadRecurring(undefined, { silent: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update recurring transaction.");
    } finally {
      setToggling(null);
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

      if (error) {
        setDeleteError(error.message);
        return;
      }

      setDeleteTarget(null);
      setRecurring((current) => current.filter((item) => item.id !== deleteTarget.id));
      void loadRecurring(undefined, { silent: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete recurring transaction.");
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
              {loading ? "Loading…" : `${counts.active} active · ${counts.paused} paused`}
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
              <UpcomingCard items={upcomingWithOverdue} catMap={catMap} />
            )}

            {/* filter tabs */}
            <div className="flex items-center gap-0.5 p-1 bg-zinc-900 rounded-lg ring-1 ring-zinc-800 w-fit">
              {(
                [
                  { key: "all",    label: "All"    },
                  { key: "active", label: "Active" },
                  { key: "paused", label: "Paused" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors",
                    filter === key
                      ? key === "active" ? "bg-emerald-500/15 text-emerald-300"
                      : key === "paused"  ? "bg-zinc-700 text-zinc-300"
                      : "theme-selected"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {label}
                  <span className={cn("text-[10px] font-semibold tabular-nums min-w-[16px] text-center rounded px-1", filter === key ? "opacity-70" : "text-zinc-600")}>
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>

            {/* list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
                  <Repeat size={28} className="text-zinc-500" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-300">
                    {filter === "all" ? "No recurring transactions" : `No ${filter} recurring transactions`}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                    Set up recurring transactions to automatically track repeating income or expenses.
                  </p>
                </div>
                {filter === "all" && (
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
                    catMap={catMap}
                    walMap={walMap}
                    onEdit={() => setModal({ mode: "edit", item })}
                    onDelete={() => setDeleteTarget(item)}
                    onToggle={() => !toggling && handleToggle(item)}
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
