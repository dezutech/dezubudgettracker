"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search, Plus, ChevronDown, StickyNote,
  X, ArrowDownLeft, ArrowUpRight, TrendingUp,
  Utensils, Zap, ShoppingCart, Tv, Car, ShoppingBag,
  Heart, BookOpen, Home, Repeat, MoreHorizontal,
  Briefcase, Laptop, Gift, CirclePlus, HelpCircle,
  Loader2, SlidersHorizontal, ArrowLeftRight, Pencil, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencyInputPrefix } from "@/components/ui/currency-input-prefix";
import { createClient } from "@/lib/supabase/client";
import { ensureSupabaseDefaultCategories } from "@/lib/supabase/categories";
import { loggedSupabase, settledError } from "@/lib/supabase/query";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createTransaction,
  deleteTransaction,
  getCategories,
  getTransactions,
  getWallets,
  updateTransaction,
  type DbCategory,
  type DbTransaction,
  type DbWallet,
} from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

// ─── icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Utensils, ShoppingCart, Car, Zap, Tv, ShoppingBag, Heart, BookOpen,
  Home, Repeat, MoreHorizontal, Briefcase, Laptop, TrendingUp,
  Gift, CirclePlus, ArrowLeftRight,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? HelpCircle;
}

// ─── color map ────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { text: string; bg: string }> = {
  orange:  { text: "text-orange-400",  bg: "bg-orange-500/10"  },
  lime:    { text: "text-lime-400",    bg: "bg-lime-500/10"    },
  sky:     { text: "text-sky-400",     bg: "bg-sky-500/10"     },
  yellow:  { text: "text-yellow-400",  bg: "bg-yellow-500/10"  },
  purple:  { text: "text-purple-400",  bg: "bg-purple-500/10"  },
  pink:    { text: "text-pink-400",    bg: "bg-pink-500/10"    },
  rose:    { text: "text-rose-400",    bg: "bg-rose-500/10"    },
  indigo:  { text: "text-indigo-400",  bg: "bg-indigo-500/10"  },
  amber:   { text: "text-amber-400",   bg: "bg-amber-500/10"   },
  violet:  { text: "text-violet-400",  bg: "bg-violet-500/10"  },
  zinc:    { text: "text-zinc-400",    bg: "bg-zinc-500/10"    },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10" },
  teal:    { text: "text-teal-400",    bg: "bg-teal-500/10"    },
};

const DEFAULT_COLOR = { text: "text-zinc-400", bg: "bg-zinc-500/10" };

// ─── resolved display type ────────────────────────────────────────────────────

type DisplayTx = {
  id: string;
  name: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  date: string;
  createdAt?: string;
  notes?: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  walletName: string;
};

export type SupabaseWallet = {
  id: string;
  name: string;
};

export type SupabaseCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
  icon: string | null;
  color: string | null;
};

type SupabaseTransaction = {
  id: string;
  wallet_id: string;
  destination_wallet_id: string | null;
  debt_id?: string | null;
  debt_type?: "i_owe" | "owes_me" | null;
  person_name?: string | null;
  category_id: string | null;
  amount: number | string;
  transaction_type: "income" | "expense" | "transfer";
  description: string | null;
  notes: string | null;
  transaction_date: string;
  created_at?: string;
  updated_at?: string;
};

function localWalletToSupabase(wallet: DbWallet): SupabaseWallet {
  return { id: String(wallet.id), name: wallet.name };
}

function localCategoryToSupabase(category: DbCategory): SupabaseCategory {
  return {
    id: String(category.id),
    name: category.name,
    type: category.type === "both" ? "expense" : category.type,
    icon: category.icon,
    color: category.color,
  };
}

function localTransactionToSupabase(tx: DbTransaction): SupabaseTransaction {
  return {
    id: String(tx.id),
    wallet_id: String(tx.walletId),
    destination_wallet_id: tx.toWalletId != null ? String(tx.toWalletId) : null,
    debt_id: tx.debtId != null ? String(tx.debtId) : null,
    debt_type: tx.debtType ?? null,
    person_name: tx.personName ?? null,
    category_id: tx.categoryId ? String(tx.categoryId) : null,
    amount: tx.amount,
    transaction_type: tx.type,
    description: tx.name,
    notes: tx.notes ?? null,
    transaction_date: tx.date,
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
  };
}

function resolve(
  txs: SupabaseTransaction[],
  catMap: Map<string, SupabaseCategory>,
  walMap: Map<string, SupabaseWallet>
): DisplayTx[] {
  return txs.map((tx) => {
    const cat = tx.category_id ? catMap.get(tx.category_id) : undefined;
    const wal = walMap.get(tx.wallet_id);
    const destinationWallet = tx.destination_wallet_id ? walMap.get(tx.destination_wallet_id) : undefined;
    const isTransfer = tx.transaction_type === "transfer";
    return {
      id:            tx.id,
      name:          isTransfer
        ? `Transfer: ${wal?.name ?? "Unknown"} → ${destinationWallet?.name ?? "Unknown"}`
        : tx.description ?? "Transaction",
      amount:        Number(tx.amount),
      type:          tx.transaction_type,
      date:          tx.transaction_date,
      createdAt:     tx.created_at,
      notes:         tx.notes ?? (isTransfer ? tx.description ?? undefined : undefined),
      categoryName:  isTransfer ? "Transfer" : cat?.name  ?? "Unknown",
      categoryIcon:  isTransfer ? "ArrowLeftRight" : cat?.icon  ?? "HelpCircle",
      categoryColor: isTransfer ? "sky" : cat?.color ?? "zinc",
      walletName:    wal?.name  ?? "Unknown",
    };
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatGroupDate(iso: string): string {
  const date      = new Date(iso + "T00:00:00");
  const todayIso  = new Date().toISOString().split("T")[0];
  const yest      = new Date(); yest.setDate(yest.getDate() - 1);
  const yestIso   = yest.toISOString().split("T")[0];
  if (iso === todayIso) return "Today";
  if (iso === yestIso)  return "Yesterday";
  const sameYear  = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatDetailDate(value: string): string {
  const dateValue = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDetailTime(value: string): string {
  if (!value.includes("T")) return "No time recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No time recorded";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimestamp(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTypeLabel(type: DisplayTx["type"]): string {
  if (type === "income") return "Income";
  if (type === "expense") return "Expense";
  return "Transfer";
}

function createdTimeValue(tx: { createdAt?: string; date: string; id: string }): number {
  const parsed = tx.createdAt ? Date.parse(tx.createdAt) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return Date.parse(`${tx.date}T00:00:00`) || Number(tx.id) || 0;
}

function sortByCreatedDesc<T extends { createdAt?: string; date: string; id: string }>(txs: T[]): T[] {
  return [...txs].sort((a, b) => {
    const createdDiff = createdTimeValue(b) - createdTimeValue(a);
    if (createdDiff !== 0) return createdDiff;
    return b.id.localeCompare(a.id, undefined, { numeric: true });
  });
}

function formatCreatedTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupByDate(txs: DisplayTx[]): [string, DisplayTx[]][] {
  const map = new Map<string, DisplayTx[]>();
  for (const tx of txs) {
    if (!map.has(tx.date)) map.set(tx.date, []);
    map.get(tx.date)!.push(tx);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => [date, sortByCreatedDesc(items)]);
}

function dayNet(txs: DisplayTx[]): number {
  return txs.reduce(
    (s, t) => s + (t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0), 0
  );
}

function walletEffect(type: "income" | "expense" | "transfer", amount: number) {
  if (type === "income") return amount;
  if (type === "expense") return -amount;
  return 0;
}

// ─── SelectField ─────────────────────────────────────────────────────────────

function SelectField({
  options, value, onChange, placeholder = "All",
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-colors"
      >
        <option value="all">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
    </div>
  );
}

// ─── AddTransactionModal ──────────────────────────────────────────────────────

function MobileFilterSheet({
  open,
  typeValue,
  categoryValue,
  walletValue,
  catOptions,
  walOptions,
  counts,
  onClose,
  onApply,
  onClear,
}: {
  open: boolean;
  typeValue: TypeFilter;
  categoryValue: string;
  walletValue: string;
  catOptions: { value: string; label: string }[];
  walOptions: { value: string; label: string }[];
  counts: Record<TypeFilter, number>;
  onClose: () => void;
  onApply: (filters: { type: TypeFilter; category: string; wallet: string }) => void;
  onClear: () => void;
}) {
  const [draftType, setDraftType] = useState<TypeFilter>(typeValue);
  const [draftCategory, setDraftCategory] = useState(categoryValue);
  const [draftWallet, setDraftWallet] = useState(walletValue);

  useEffect(() => {
    if (!open) return;
    setDraftType(typeValue);
    setDraftCategory(categoryValue);
    setDraftWallet(walletValue);
  }, [categoryValue, open, typeValue, walletValue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl bg-zinc-900 ring-1 ring-white/10 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-50">Filters</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Type</label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-800 rounded-lg">
              {(["all", "income", "expense", "transfer"] as TypeFilter[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDraftType(type)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium capitalize transition-colors",
                    draftType === type
                      ? type === "income" ? "bg-emerald-500/20 text-emerald-300"
                      : type === "expense" ? "bg-rose-500/20 text-rose-300"
                      : type === "transfer" ? "bg-sky-500/20 text-sky-300"
                      : "theme-selected"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <span>{type}</span>
                  <span className="rounded px-1 text-[10px] opacity-70">{counts[type]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Category</label>
            <SelectField value={draftCategory} onChange={setDraftCategory} options={catOptions} placeholder="All Categories" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Wallet</label>
            <SelectField value={draftWallet} onChange={setDraftWallet} options={walOptions} placeholder="All Wallets" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-2">
          <button
            onClick={() => {
              setDraftType("all");
              setDraftCategory("all");
              setDraftWallet("all");
              onClear();
            }}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
          >
            Clear filters
          </button>
          <button
            onClick={() => onApply({ type: draftType, category: draftCategory, wallet: draftWallet })}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors"
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddTransactionModal({
  open,
  onClose,
  wallets,
  categories,
  userId,
  isOffline,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  wallets: SupabaseWallet[];
  categories: SupabaseCategory[];
  userId: string | null;
  isOffline: boolean;
  onCreated: () => void;
}) {
  const [txType,    setTxType]    = useState<"expense" | "income">("expense");
  const [amount,    setAmount]    = useState("");
  const [name,      setName]      = useState("");
  const [catId,     setCatId]     = useState("");
  const [walletId,  setWalletId]  = useState("");
  const [date,      setDate]      = useState(() => new Date().toISOString().split("T")[0]);
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const filteredCats = categories.filter(
    (c) => c.type === txType
  );

  function reset() {
    setTxType("expense"); setAmount(""); setName(""); setCatId("");
    setWalletId(""); setDate(new Date().toISOString().split("T")[0]);
    setNotes(""); setError("");
  }

  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    setError("");
    const amt = parseFloat(amount);
    if (!name.trim())            { setError("Description is required."); return; }
    if (isNaN(amt) || amt <= 0)  { setError("Enter a valid amount greater than 0."); return; }
    if (!catId)                  { setError("Select a category."); return; }
    if (!walletId)               { setError("Select a wallet."); return; }

    setSaving(true);
    try {
      if (isOffline) {
        await createTransaction({
          userId: OFFLINE_USER_ID,
          walletId: Number(walletId),
          categoryId: Number(catId),
          type: txType,
          amount: amt,
          date,
          name: name.trim(),
          notes: notes.trim() || undefined,
        });
        reset();
        onCreated();
        onClose();
        return;
      }

      if (!userId) {
        setError("Please sign in to add a transaction.");
        return;
      }

      const supabase = createClient();
      const wallet = wallets.find((item) => item.id === walletId);
      if (!wallet) {
        setError("Selected wallet was not found.");
        return;
      }

      const { error: insertError } = await supabase.from("transactions").insert({
        user_id: userId,
        wallet_id: walletId,
        category_id: catId,
        amount: amt,
        transaction_type: txType,
        description: name.trim(),
        notes: notes.trim() || null,
        transaction_date: date,
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      const { data: walletRow, error: walletReadError } = await supabase
        .from("wallets")
        .select("balance")
        .eq("id", walletId)
        .eq("user_id", userId)
        .maybeSingle();

      if (walletReadError) {
        setError(walletReadError.message);
        return;
      }
      if (!walletRow) {
        setError("Selected wallet was not found.");
        return;
      }

      const currentBalance = Number(walletRow?.balance ?? 0);
      const balanceDelta = txType === "income" ? amt : -amt;
      const { error: walletUpdateError } = await supabase
        .from("wallets")
        .update({ balance: currentBalance + balanceDelta })
        .eq("id", walletId)
        .eq("user_id", userId);

      if (walletUpdateError) {
        setError(walletUpdateError.message);
        return;
      }

      reset();
      onCreated();
      onClose();
    } catch {
      setError("Failed to save transaction. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={handleClose} />
      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl">
        {/* header */}
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-50">New Transaction</h2>
          <button onClick={handleClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* form */}
        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          {/* type toggle */}
          <div className="flex items-center gap-0 p-1 bg-zinc-800 rounded-lg w-fit">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTxType(t); setCatId(""); }}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
                  txType === t
                    ? t === "expense"
                      ? "bg-rose-500/20 text-rose-300"
                      : "bg-emerald-500/20 text-emerald-300"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Amount</label>
            <div className="relative">
              <CurrencyInputPrefix />
              <Input
                type="number" min="0.01" step="0.01" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 h-9"
              />
            </div>
          </div>

          {/* description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Description</label>
            <Input
              placeholder="e.g. Lunch"
              value={name} onChange={(e) => setName(e.target.value)}
              className="bg-zinc-800 border-zinc-700 h-9"
            />
          </div>

          {/* category + wallet */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Category</label>
              <SelectField
                value={catId}
                onChange={setCatId}
                placeholder="Select"
                options={filteredCats.map((c) => ({ value: String(c.id), label: c.name }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Wallet</label>
              <SelectField
                value={walletId}
                onChange={setWalletId}
                placeholder="Select"
                options={wallets.map((w) => ({ value: String(w.id), label: w.name }))}
              />
            </div>
          </div>

          {/* date + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Date</label>
              <Input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="bg-zinc-800 border-zinc-700 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Notes <span className="text-zinc-600">(optional)</span>
              </label>
              <Input
                placeholder="Add a note…"
                value={notes} onChange={(e) => setNotes(e.target.value)}
                className="bg-zinc-800 border-zinc-700 h-9"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* footer */}
        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:pointer-events-none",
              txType === "expense"
                ? "bg-rose-500 hover:bg-rose-400 text-[var(--theme-danger-foreground)]"
                : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
            )}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Add Transaction
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTransactionModal({
  tx,
  wallets,
  categories,
  userId,
  isOffline,
  onClose,
  onSaved,
}: {
  tx: SupabaseTransaction | null;
  wallets: SupabaseWallet[];
  categories: SupabaseCategory[];
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onSaved: (tx?: SupabaseTransaction) => void;
}) {
  const [txType, setTxType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [catId, setCatId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tx) return;
    setTxType(tx.transaction_type === "income" ? "income" : "expense");
    setAmount(String(tx.amount));
    setName(tx.description ?? "");
    setCatId(tx.category_id ?? "");
    setWalletId(tx.wallet_id);
    setDate(tx.transaction_date);
    setNotes(tx.notes ?? "");
    setError("");
  }, [tx]);

  const filteredCats = categories.filter((c) => c.type === txType);

  async function adjustWallet(wallet: string, delta: number) {
    const supabase = createClient();
    const { data, error } = await loggedSupabase(
      "wallets balance read",
      supabase
        .from("wallets")
        .select("balance")
        .eq("id", wallet)
        .eq("user_id", userId)
        .maybeSingle()
    );
    if (error) return error.message;
    if (!data) return "Selected wallet was not found.";

    const { error: updateError } = await loggedSupabase(
      "wallets balance update",
      supabase
        .from("wallets")
        .update({ balance: Number(data?.balance ?? 0) + delta })
        .eq("id", wallet)
        .eq("user_id", userId)
    );
    return updateError?.message ?? null;
  }

  async function handleSave() {
    if (!tx) return;
    setError("");
    const parsed = Number(amount);
    if (!tx.id) { setError("Missing transaction id. Close and reopen this transaction, then try again."); return; }
    if (!name.trim()) { setError("Description is required."); return; }
    if (!amount || Number.isNaN(parsed) || parsed <= 0) { setError("Enter a valid amount greater than 0."); return; }
    if (!catId) { setError("Select a category."); return; }
    if (!walletId) { setError("Select a wallet."); return; }

    setSaving(true);
    try {
      if (isOffline) {
        await updateTransaction(Number(tx.id), {
          walletId: Number(walletId),
          categoryId: Number(catId),
          type: txType,
          amount: parsed,
          date,
          name: name.trim(),
          notes: notes.trim() || undefined,
        });
        onSaved();
        onClose();
        return;
      }

      if (!userId) { setError("Please sign in to edit a transaction."); return; }
      const supabase = createClient();
      const oldEffect = walletEffect(tx.transaction_type, Number(tx.amount));
      const newEffect = walletEffect(txType, parsed);
      const payload = {
        wallet_id: walletId,
        category_id: catId,
        amount: parsed,
        transaction_type: txType,
        description: name.trim(),
        notes: notes.trim() || null,
        transaction_date: date,
      };

      const { data: updatedRows, error: updateError } = await loggedSupabase(
        "transactions update",
        supabase
          .from("transactions")
          .update(payload)
          .eq("id", tx.id)
          .eq("user_id", userId)
          .select("id,user_id,wallet_id,destination_wallet_id,debt_id,debt_type,person_name,category_id,amount,transaction_type,description,notes,transaction_date,created_at,updated_at,is_deleted")
      );

      if (updateError) { setError(updateError.message); return; }

      if (tx.wallet_id === walletId) {
        const balanceError = await adjustWallet(walletId, newEffect - oldEffect);
        if (balanceError) { setError(balanceError); return; }
      } else {
        const reverseError = await adjustWallet(tx.wallet_id, -oldEffect);
        if (reverseError) { setError(reverseError); return; }
        const applyError = await adjustWallet(walletId, newEffect);
        if (applyError) { setError(applyError); return; }
      }

      onSaved(((updatedRows ?? []) as SupabaseTransaction[])[0] ?? { ...tx, ...payload });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update transaction.");
    } finally {
      setSaving(false);
    }
  }

  if (!tx) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl">
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-50">Edit Transaction</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          <div className="flex items-center gap-0 p-1 bg-zinc-800 rounded-lg w-fit">
            {(["expense", "income"] as const).map((type) => (
              <button key={type} onClick={() => { setTxType(type); setCatId(""); }} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize", txType === type ? type === "expense" ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:text-zinc-200")}>
                {type}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Amount</label>
              <div className="relative">
                <CurrencyInputPrefix />
                <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-10 bg-zinc-800 border-zinc-700 h-9" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-zinc-800 border-zinc-700 h-9" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Description</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-800 border-zinc-700 h-9" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="min-h-20 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
              placeholder="No notes added"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Category</label>
              <SelectField value={catId} onChange={setCatId} placeholder="Select" options={filteredCats.map((c) => ({ value: c.id, label: c.name }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Wallet</label>
              <SelectField value={walletId} onChange={setWalletId} placeholder="Select" options={wallets.map((w) => ({ value: w.id, label: w.name }))} />
            </div>
          </div>

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className={cn("flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:pointer-events-none", txType === "expense" ? "bg-rose-500 hover:bg-rose-400 text-[var(--theme-danger-foreground)]" : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950")}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SummaryCard ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, icon: Icon, iconColor, iconBg, valueColor, className,
}: {
  label: string; value: string; sub: string;
  icon: LucideIcon; iconColor: string; iconBg: string; valueColor: string;
  className?: string;
}) {
  return (
    <div className={cn("dezu-card flex items-center gap-2.5 rounded-[1.15rem] bg-card/90 px-3 py-3 sm:gap-3 sm:px-4", className)}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl ${iconBg}`}>
        <Icon size={14} className={iconColor} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className={`truncate text-sm font-bold tracking-tight min-[380px]:text-base ${valueColor}`}>{value}</p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

// ─── TransactionRow ───────────────────────────────────────────────────────────

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-zinc-800/60 px-3 py-2.5", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-zinc-100">{value}</p>
    </div>
  );
}

function TransactionDetailsModal({
  tx,
  raw,
  destinationWalletName,
  onClose,
  onEdit,
  onDelete,
}: {
  tx: DisplayTx | null;
  raw: SupabaseTransaction | null;
  destinationWalletName?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { formatCurrency } = useCurrency();
  if (!tx || !raw) return null;

  const isIncome = tx.type === "income";
  const isExpense = tx.type === "expense";
  const createdAt = formatTimestamp(raw.created_at);
  const updatedAt = formatTimestamp(raw.updated_at);
  const notes = (raw.notes ?? tx.notes ?? "").trim();
  const walletLabel = tx.type === "transfer" && destinationWalletName
    ? `${tx.walletName} to ${destinationWalletName}`
    : tx.walletName;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-lg sm:rounded-2xl">
        <div className="dezu-modal-header flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Transaction Details</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-zinc-50">{tx.name}</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="dezu-modal-body max-h-[70dvh] overflow-y-auto px-5 py-5">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-zinc-800/60 px-3 py-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Amount</p>
              <p className={cn("mt-1 text-xl font-bold tabular-nums", isIncome ? "text-emerald-400" : tx.type === "transfer" ? "text-sky-400" : "text-zinc-50")}>
                {tx.type === "transfer" ? "" : isIncome ? "+" : "-"}{formatCurrency(tx.amount)}
              </p>
            </div>
            <span className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold",
              isIncome ? "bg-emerald-500/10 text-emerald-300" : isExpense ? "bg-rose-500/10 text-rose-300" : "bg-sky-500/10 text-sky-300"
            )}>
              {formatTypeLabel(tx.type)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DetailItem label="Wallet" value={walletLabel} />
            <DetailItem label="Category" value={tx.categoryName} />
            <DetailItem label="Date" value={formatDetailDate(raw.transaction_date)} />
            <DetailItem label="Time" value={formatDetailTime(raw.transaction_date)} />
            {createdAt && <DetailItem label="Created at" value={createdAt} />}
            {updatedAt && <DetailItem label="Updated at" value={updatedAt} />}
          </div>

          <div className="mt-2 rounded-xl bg-zinc-800/60 px-3 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Notes</p>
            <p className={cn("mt-1 whitespace-pre-wrap break-words text-sm", notes ? "text-zinc-100" : "text-zinc-500")}>
              {notes || "No notes added"}
            </p>
          </div>
        </div>

        <div className="dezu-modal-footer flex flex-col gap-2 border-t border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            onClick={onEdit}
            disabled={tx.type === "transfer"}
            className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-zinc-300"
          >
            <Pencil size={14} />
            Edit Transaction
          </button>
          <button
            onClick={onDelete}
            className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-rose-400 transition-colors hover:bg-rose-500/10"
          >
            <Trash2 size={14} />
            Delete Transaction
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TransactionRow({
  tx,
  onOpen,
  onEdit,
  onDelete,
}: {
  tx: DisplayTx;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const Icon   = getIcon(tx.categoryIcon);
  const colors = COLOR_MAP[tx.categoryColor] ?? DEFAULT_COLOR;
  const isIncome = tx.type === "income";
  const isTransfer = tx.type === "transfer";
  const createdTime = formatCreatedTime(tx.createdAt);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="dezu-card group flex cursor-pointer items-center gap-3 rounded-[1.15rem] bg-card/90 px-3 py-3 transition-colors hover:bg-card"
    >
      <div className={`w-9 h-9 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
        <Icon size={15} className={colors.text} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-zinc-100 truncate">{tx.name}</p>
          {tx.notes && <StickyNote size={11} className="text-zinc-500 shrink-0" strokeWidth={1.75} />}
        </div>
        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
          {tx.walletName}
          <span className="mx-1 text-zinc-700">·</span>
          {tx.categoryName}
          {createdTime && (
            <>
              <span className="mx-1 text-zinc-700">·</span>
              {createdTime}
            </>
          )}
          {tx.notes && <span className="ml-1 text-zinc-600 italic">"{tx.notes}"</span>}
        </p>
      </div>
      <p className={`text-sm font-semibold tabular-nums shrink-0 ${isIncome ? "text-emerald-400" : isTransfer ? "text-sky-400" : "text-zinc-100"}`}>
        {isTransfer ? "" : isIncome ? "+" : "-"}{formatCurrency(tx.amount)}
      </p>
      <div className="relative shrink-0" ref={menuRef} onClick={(event) => event.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Transaction actions"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors sm:opacity-0 sm:group-hover:opacity-100"
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
            {!isTransfer && (
              <button
                onClick={() => { setMenuOpen(false); onEdit(); }}
                className="block w-full px-3 py-2 text-left text-xs font-medium text-zinc-300 hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
              >
                Edit Transaction
              </button>
            )}
            <button
              onClick={() => { setMenuOpen(false); onDelete(); }}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-rose-400 hover:bg-rose-500/10"
            >
              Delete Transaction
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TransactionsView (main) ──────────────────────────────────────────────────

type TypeFilter = "all" | "income" | "expense" | "transfer";

export function TransactionsView() {
  const searchParams = useSearchParams();
  const { formatCurrency } = useCurrency();
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const [rawTxs, setRawTxs] = useState<SupabaseTransaction[]>([]);
  const [wallets, setWallets] = useState<SupabaseWallet[]>([]);
  const [categories, setCategories] = useState<SupabaseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addOpen,    setAddOpen]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [catFilter,  setCatFilter]  = useState("all");
  const [walFilter,  setWalFilter]  = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<SupabaseTransaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupabaseTransaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const loadRequestId = useRef(0);

  const loadData = useCallback(async (
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
        const [localTxs, localWallets, localCategories] = await Promise.all([
          getTransactions(),
          getWallets(OFFLINE_USER_ID),
          getCategories(OFFLINE_USER_ID),
        ]);
        if (!isCurrent()) return;
        setRawTxs(localTxs.map(localTransactionToSupabase));
        setWallets(localWallets.map(localWalletToSupabase));
        setCategories(localCategories.map(localCategoryToSupabase));
        return;
      }

      if (!user?.id) {
        if (!isCurrent()) return;
        setRawTxs([]);
        setWallets([]);
        setCategories([]);
        return;
      }

      const supabase = createClient();
      const [txSettled, walletSettled, categoriesSettled] = await Promise.allSettled([
        loggedSupabase(
          "transactions",
          supabase
            .from("transactions")
            .select("id,wallet_id,destination_wallet_id,debt_id,debt_type,person_name,category_id,amount,transaction_type,description,notes,transaction_date,created_at,updated_at")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
        ),
        loggedSupabase(
          "wallets",
          supabase
            .from("wallets")
            .select("id,name")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("created_at", { ascending: true })
        ),
        ensureSupabaseDefaultCategories(user.id),
      ]);

      if (!isCurrent()) return;

      const errors = [txSettled, walletSettled, categoriesSettled].map(settledError).filter(Boolean);
      if (errors.length > 0) setLoadError(errors.join(" | "));

      const txResult = txSettled.status === "fulfilled" ? txSettled.value : { data: [] };
      const walletResult = walletSettled.status === "fulfilled" ? walletSettled.value : { data: [] };
      const categoriesResult = categoriesSettled.status === "fulfilled" ? categoriesSettled.value : [];

      setRawTxs((txResult.data ?? []) as SupabaseTransaction[]);
      setWallets((walletResult.data ?? []) as SupabaseWallet[]);
      setCategories(categoriesResult as SupabaseCategory[]);
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load transactions.");
      setRawTxs([]);
      setWallets([]);
      setCategories([]);
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, user?.id]);

  useEffect(() => {
    let mounted = true;
    loadData(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadData]);

  // lookup maps
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const walMap = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);

  // resolved display transactions
  const allResolved = useMemo(() => resolve(rawTxs, catMap, walMap), [rawTxs, catMap, walMap]);
  const detailsTx = useMemo(
    () => detailsId ? allResolved.find((tx) => tx.id === detailsId) ?? null : null,
    [allResolved, detailsId]
  );
  const detailsRaw = useMemo(
    () => detailsId ? rawTxs.find((tx) => tx.id === detailsId) ?? null : null,
    [detailsId, rawTxs]
  );
  const detailsDestinationWalletName = detailsRaw?.destination_wallet_id
    ? walMap.get(detailsRaw.destination_wallet_id)?.name
    : undefined;

  // filter options (unique category/wallet names)
  const catOptions = useMemo(
    () => [...new Set(allResolved.map((t) => t.categoryName))].sort().map((n) => ({ value: n, label: n })),
    [allResolved]
  );
  const walOptions = useMemo(
    () => [...new Set(allResolved.map((t) => t.walletName))].sort().map((n) => ({ value: n, label: n })),
    [allResolved]
  );

  useEffect(() => {
    const category = searchParams.get("category");
    if (!category || catOptions.length === 0) return;
    const match = catOptions.find((option) => option.value.toLowerCase() === category.toLowerCase());
    if (match) setCatFilter(match.value);
  }, [catOptions, searchParams]);

  // base filter (search + category + wallet) — used for type tab counts
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allResolved.filter((t) => {
      if (catFilter !== "all" && t.categoryName !== catFilter) return false;
      if (walFilter !== "all" && t.walletName   !== walFilter) return false;
      if (q) {
        const hit =
          t.name.toLowerCase().includes(q)         ||
          t.categoryName.toLowerCase().includes(q) ||
          t.walletName.toLowerCase().includes(q)   ||
          (t.notes?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      return true;
    });
  }, [allResolved, search, catFilter, walFilter]);

  const finalFiltered = useMemo(() => {
    if (typeFilter === "all") return baseFiltered;
    return baseFiltered.filter((t) => t.type === typeFilter);
  }, [baseFiltered, typeFilter]);

  const counts = useMemo(() => ({
    all:     baseFiltered.length,
    income:  baseFiltered.filter((t) => t.type === "income").length,
    expense: baseFiltered.filter((t) => t.type === "expense").length,
    transfer: baseFiltered.filter((t) => t.type === "transfer").length,
  }), [baseFiltered]);

  const summary = useMemo(() => {
    const income   = finalFiltered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = finalFiltered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expenses, net: income - expenses };
  }, [finalFiltered]);

  const grouped = useMemo(() => groupByDate(finalFiltered), [finalFiltered]);

  function handleTransactionSaved(updatedTx?: SupabaseTransaction) {
    if (updatedTx) {
      setRawTxs((current) =>
        current.map((tx) => tx.id === updatedTx.id ? updatedTx : tx)
      );
    }

    void loadData(undefined, { silent: true });
  }

  async function handleDeleteTransaction() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (isGuest) {
        await deleteTransaction(Number(deleteTarget.id));
        setRawTxs((current) => current.filter((tx) => tx.id !== deleteTarget.id));
        setDeleteTarget(null);
        void loadData(undefined, { silent: true });
        return;
      }

      if (!user?.id) { setDeleteError("Please sign in to delete a transaction."); return; }
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("transactions")
        .update({ is_deleted: true })
        .eq("id", deleteTarget.id)
        .eq("user_id", user.id);
      if (deleteError) { setDeleteError(deleteError.message); return; }

      if (deleteTarget.transaction_type === "transfer") {
        if (!deleteTarget.destination_wallet_id) {
          setDeleteError("Transfer destination wallet is missing.");
          return;
        }

        const [sourceResult, destinationResult] = await Promise.all([
          supabase
            .from("wallets")
            .select("balance")
            .eq("id", deleteTarget.wallet_id)
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("wallets")
            .select("balance")
            .eq("id", deleteTarget.destination_wallet_id)
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        if (sourceResult.error) { setDeleteError(sourceResult.error.message); return; }
        if (destinationResult.error) { setDeleteError(destinationResult.error.message); return; }
        if (!sourceResult.data || !destinationResult.data) {
          setDeleteError("Transfer wallet was not found.");
          return;
        }

        const amount = Number(deleteTarget.amount);
        const { error: sourceUpdateError } = await supabase
          .from("wallets")
          .update({ balance: Number(sourceResult.data.balance ?? 0) + amount })
          .eq("id", deleteTarget.wallet_id)
          .eq("user_id", user.id);
        if (sourceUpdateError) { setDeleteError(sourceUpdateError.message); return; }

        const { error: destinationUpdateError } = await supabase
          .from("wallets")
          .update({ balance: Number(destinationResult.data.balance ?? 0) - amount })
          .eq("id", deleteTarget.destination_wallet_id)
          .eq("user_id", user.id);
        if (destinationUpdateError) { setDeleteError(destinationUpdateError.message); return; }
      } else {
        const effect = walletEffect(deleteTarget.transaction_type, Number(deleteTarget.amount));
        const { data: walletRow, error: walletReadError } = await supabase
          .from("wallets")
          .select("balance")
          .eq("id", deleteTarget.wallet_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (walletReadError) { setDeleteError(walletReadError.message); return; }
        if (!walletRow) { setDeleteError("Selected wallet was not found."); return; }

        const { error: walletUpdateError } = await supabase
          .from("wallets")
          .update({ balance: Number(walletRow?.balance ?? 0) - effect })
          .eq("id", deleteTarget.wallet_id)
          .eq("user_id", user.id);
        if (walletUpdateError) { setDeleteError(walletUpdateError.message); return; }
      }

      setRawTxs((current) => current.filter((tx) => tx.id !== deleteTarget.id));
      setDeleteTarget(null);
      void loadData(undefined, { silent: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete transaction.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="px-5 pb-32 pt-7 max-w-6xl mx-auto space-y-6 md:pb-7">
        {/* header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-50 tracking-tight">Transactions</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {loading ? "Loading…" : `${rawTxs.length} transaction${rawTxs.length !== 1 ? "s" : ""} · All time`}
            </p>
          </div>
          <button
            aria-label="Add Transaction"
            onClick={() => setAddOpen(true)}
            className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 sm:h-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden min-[390px]:inline sm:inline">Add Transaction</span>
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

            {/* summary */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <SummaryCard
                label="Total Income" value={formatCurrency(summary.income)}
                sub={`${counts.income} entr${counts.income === 1 ? "y" : "ies"}`}
                icon={ArrowDownLeft} iconColor="text-emerald-400" iconBg="bg-emerald-500/10" valueColor="text-emerald-400"
              />
              <SummaryCard
                label="Total Expenses" value={formatCurrency(summary.expenses)}
                sub={`${counts.expense} entr${counts.expense === 1 ? "y" : "ies"}`}
                icon={ArrowUpRight} iconColor="text-rose-400" iconBg="bg-rose-500/10" valueColor="text-rose-400"
              />
              <SummaryCard
                label="Net Balance"
                value={`${summary.net >= 0 ? "+" : "-"}${formatCurrency(summary.net)}`}
                sub="Income minus expenses"
                icon={TrendingUp} iconColor="text-sky-400" iconBg="bg-sky-500/10"
                valueColor={summary.net >= 0 ? "text-card-foreground" : "text-rose-400"}
                className="col-span-2 sm:col-span-1"
              />
            </div>

            {/* toolbar */}
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <Input
                  placeholder="Search transactions, categories, wallets…"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-zinc-900 border-zinc-700 h-9 text-sm"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
                title="Filters"
                aria-label="Open transaction filters"
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>

            {/* results count */}
            <p className="text-xs text-zinc-500">
              {finalFiltered.length === rawTxs.length
                ? `All ${finalFiltered.length} transactions`
                : `Showing ${finalFiltered.length} of ${rawTxs.length} transactions`}
            </p>

            {/* list */}
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                  <Search size={20} className="text-zinc-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-400">No transactions yet</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Transactions stored in Supabase will appear here.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {grouped.map(([date, txs]) => {
                  const net = dayNet(txs);
                  return (
                    <div key={date}>
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          {formatGroupDate(date)}
                        </span>
                        <span className={`text-xs font-semibold tabular-nums ${net >= 0 ? "text-emerald-400" : "text-zinc-400"}`}>
                          {net >= 0 ? "+" : "-"}{formatCurrency(net)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {txs.map((tx) => {
                          const raw = rawTxs.find((item) => item.id === tx.id) ?? null;
                          return (
                            <TransactionRow
                              key={tx.id}
                              tx={tx}
                              onOpen={() => setDetailsId(tx.id)}
                              onEdit={() => raw && setEditTarget(raw)}
                              onDelete={() => raw && setDeleteTarget(raw)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AddTransactionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        wallets={wallets}
        categories={categories}
        userId={user?.id ?? null}
        isOffline={isGuest}
        onCreated={loadData}
      />
      <MobileFilterSheet
        open={filterOpen}
        typeValue={typeFilter}
        categoryValue={catFilter}
        walletValue={walFilter}
        catOptions={catOptions}
        walOptions={walOptions}
        counts={counts}
        onClose={() => setFilterOpen(false)}
        onClear={() => {
          setTypeFilter("all");
          setCatFilter("all");
          setWalFilter("all");
        }}
        onApply={({ type, category, wallet }) => {
          setTypeFilter(type);
          setCatFilter(category);
          setWalFilter(wallet);
          setFilterOpen(false);
        }}
      />
      <TransactionDetailsModal
        tx={detailsTx}
        raw={detailsRaw}
        destinationWalletName={detailsDestinationWalletName}
        onClose={() => setDetailsId(null)}
        onEdit={() => {
          if (!detailsRaw || detailsRaw.transaction_type === "transfer") return;
          setDetailsId(null);
          setEditTarget(detailsRaw);
        }}
        onDelete={() => {
          if (!detailsRaw) return;
          setDetailsId(null);
          setDeleteTarget(detailsRaw);
        }}
      />
      <EditTransactionModal
        tx={editTarget}
        wallets={wallets}
        categories={categories}
        userId={user?.id ?? null}
        isOffline={isGuest}
        onClose={() => setEditTarget(null)}
        onSaved={handleTransactionSaved}
      />
      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm bg-zinc-900 rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden">
            <div className="px-5 py-5 text-center">
              <h3 className="text-base font-semibold text-zinc-50">Delete transaction?</h3>
              <p className="text-xs text-zinc-500 mt-2">This transaction will be hidden and the wallet balance will be adjusted.</p>
              {deleteError && <p className="mt-3 text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{deleteError}</p>}
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">Cancel</button>
              <button onClick={handleDeleteTransaction} disabled={deleting} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-rose-500 hover:bg-rose-400 text-[var(--theme-danger-foreground)] transition-colors disabled:opacity-60 disabled:pointer-events-none">
                {deleting && <Loader2 size={13} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

