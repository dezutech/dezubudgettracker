"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Plus, ChevronLeft, ChevronRight, Pencil, Trash2, X,
  Loader2, Target, Tag,
  Utensils, ShoppingCart, Car, Zap, Tv, ShoppingBag,
  Heart, BookOpen, Home, Repeat, Briefcase, Laptop,
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
  createBudget,
  deleteBudget,
  getBudgets,
  getCategories,
  getTransactions,
  updateBudget,
  type DbBudget,
  type DbCategory,
} from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [year, mo] = month.slice(0, 7).split("-").map(Number);
  return new Date(year, mo - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(month: string, delta: number): string {
  const [year, mo] = month.split("-").map(Number);
  const d = new Date(year, mo - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Icon + color registries ──────────────────────────────────────────────────

function toMonthDate(month: string): string {
  return `${month.slice(0, 7)}-01`;
}

function monthEndDate(month: string): string {
  const [year, mo] = month.slice(0, 7).split("-").map(Number);
  const day = new Date(year, mo, 0).getDate();
  return `${year}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const ICON_MAP = new Map<string, LucideIcon>([
  ["Utensils", Utensils], ["UtensilsCrossed", UtensilsCrossed], ["Pizza", Pizza],
  ["Coffee", Coffee], ["Store", Store], ["ShoppingCart", ShoppingCart],
  ["ShoppingBag", ShoppingBag], ["Package", Package], ["Car", Car],
  ["Bus", Bus], ["Bike", Bike], ["Plane", Plane], ["Fuel", Fuel],
  ["Zap", Zap], ["Globe", Globe], ["Smartphone", Smartphone], ["Home", Home],
  ["Tv", Tv], ["Film", Film], ["Music", Music], ["Repeat", Repeat],
  ["Heart", Heart], ["Dumbbell", Dumbbell], ["Stethoscope", Stethoscope],
  ["BookOpen", BookOpen], ["GraduationCap", GraduationCap],
  ["Briefcase", Briefcase], ["Building2", Building2], ["Laptop", Laptop],
  ["TrendingUp", TrendingUp], ["Coins", Coins], ["PiggyBank", PiggyBank],
  ["Wallet", Wallet], ["CreditCard", CreditCard], ["Banknote", Banknote],
  ["Gift", Gift], ["CirclePlus", CirclePlus],
]);

function getIcon(name: string): LucideIcon {
  return ICON_MAP.get(name) ?? Tag;
}

type ColorEntry = { bg: string; text: string };

const COLOR_MAP = new Map<string, ColorEntry>([
  ["orange",  { bg: "bg-orange-500/10",  text: "text-orange-400"  }],
  ["amber",   { bg: "bg-amber-500/10",   text: "text-amber-400"   }],
  ["yellow",  { bg: "bg-yellow-500/10",  text: "text-yellow-400"  }],
  ["lime",    { bg: "bg-lime-500/10",    text: "text-lime-400"    }],
  ["emerald", { bg: "bg-emerald-500/10", text: "text-emerald-400" }],
  ["teal",    { bg: "bg-teal-500/10",    text: "text-teal-400"    }],
  ["sky",     { bg: "bg-sky-500/10",     text: "text-sky-400"     }],
  ["blue",    { bg: "bg-blue-500/10",    text: "text-blue-400"    }],
  ["indigo",  { bg: "bg-indigo-500/10",  text: "text-indigo-400"  }],
  ["violet",  { bg: "bg-violet-500/10",  text: "text-violet-400"  }],
  ["purple",  { bg: "bg-purple-500/10",  text: "text-purple-400"  }],
  ["pink",    { bg: "bg-pink-500/10",    text: "text-pink-400"    }],
  ["rose",    { bg: "bg-rose-500/10",    text: "text-rose-400"    }],
  ["zinc",    { bg: "bg-zinc-500/10",    text: "text-zinc-400"    }],
]);

function getColor(name: string): ColorEntry {
  return COLOR_MAP.get(name) ?? { bg: "bg-zinc-500/10", text: "text-zinc-400" };
}

// ─── Status config ────────────────────────────────────────────────────────────

type StatusKey = "normal" | "warning" | "critical" | "over";

const STATUS_CONFIG: Record<StatusKey, { label: string; bar: string; badge: string; text: string }> = {
  normal:   { label: "On Track",    bar: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-400", text: "text-emerald-400" },
  warning:  { label: "Warning",     bar: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-400",     text: "text-amber-400"   },
  critical: { label: "Critical",    bar: "bg-orange-500",  badge: "bg-orange-500/10 text-orange-400",   text: "text-orange-400"  },
  over:     { label: "Over Budget", bar: "bg-rose-500",    badge: "bg-rose-500/10 text-rose-400",       text: "text-rose-400"    },
};

type SupabaseBudget = {
  id: string;
  user_id: string;
  category_id: string;
  amount: number | string;
  month: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  is_deleted: boolean;
};

type SupabaseTransaction = {
  category_id: string | null;
  amount: number | string;
};

type BudgetWithUsage = {
  budget: SupabaseBudget;
  category: SupabaseCategory | undefined;
  spent: number;
  remaining: number;
  percentage: number;
  status: StatusKey;
};

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

function localBudgetToSupabase(budget: DbBudget): SupabaseBudget {
  return {
    id: String(budget.id),
    user_id: budget.userId,
    category_id: String(budget.categoryId),
    amount: budget.amount,
    month: budget.month,
    created_at: budget.createdAt,
    updated_at: budget.updatedAt,
    synced_at: null,
    is_deleted: false,
  };
}

// ─── BudgetCard ───────────────────────────────────────────────────────────────

function BudgetCard({
  item,
  onEdit,
  onDelete,
}: {
  item: BudgetWithUsage;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const { budget, category, spent, remaining, percentage, status } = item;
  const statusCfg  = STATUS_CONFIG[status];
  const colorInfo  = getColor(category?.color ?? "zinc");
  const Icon       = getIcon(category?.icon ?? "Tag");
  const catName    = category?.name ?? "Unknown Category";
  const clampedPct = Math.min(percentage, 100);
  const budgetAmount = Number(budget.amount);

  return (
    <div className="dezu-card flex flex-col gap-3 rounded-[1.15rem] bg-card/90 p-4 transition-colors group">
      {/* top row */}
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", colorInfo.bg)}>
          <Icon size={18} className={colorInfo.text} strokeWidth={1.75} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {catName}
            </span>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none", statusCfg.badge)}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {formatCurrency(spent)} spent of {formatCurrency(budgetAmount)}
          </p>
        </div>

        {/* actions — always visible on mobile, hover on desktop */}
        <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            title="Edit"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
          >
            <Pencil size={13} strokeWidth={2} />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* progress section */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className={statusCfg.text}>
            {percentage.toFixed(1)}%
          </span>
          <span className="text-zinc-500">
            {remaining >= 0
              ? `${formatCurrency(remaining)} remaining`
              : `${formatCurrency(Math.abs(remaining))} over`}
          </span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", statusCfg.bar)}
            style={{ width: `${clampedPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── AddEditModal ─────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; budget: SupabaseBudget };

function AddEditModal({
  state,
  month,
  categories,
  usedCategoryIds,
  loadError,
  userId,
  isOffline,
  onClose,
  onSaved,
}: {
  state: ModalState;
  month: string;
  categories: SupabaseCategory[];
  usedCategoryIds: Set<string>;
  loadError: string;
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onSaved: (budget?: SupabaseBudget) => void;
}) {
  const { symbol } = useCurrency();
  const isEdit = state.mode === "edit";

  const [categoryId, setCategoryId] = useState("");
  const [amount,     setAmount]     = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    if (state.mode === "edit") {
      setCategoryId(state.budget.category_id);
      setAmount(String(state.budget.amount));
    } else {
      setCategoryId("");
      setAmount("");
    }
    setError("");
  }, [state]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense"),
    [categories]
  );

  const availableCategories = useMemo(() => {
    if (isEdit) return expenseCategories;
    return expenseCategories.filter((c) => !usedCategoryIds.has(c.id));
  }, [expenseCategories, isEdit, usedCategoryIds]);

  const everyExpenseCategoryHasBudget =
    expenseCategories.length > 0 &&
    expenseCategories.every((category) => usedCategoryIds.has(category.id));

  const categoryUnavailableMessage = loadError
    ? loadError
    : categories.length === 0
    ? "No categories yet. Create categories first."
    : expenseCategories.length === 0
    ? "No expense categories yet. Create categories first."
    : everyExpenseCategoryHasBudget
    ? "All categories already have budgets this month"
    : "No categories available.";

  async function handleSave() {
    if (state.mode === "closed") return;
    const parsed = Number(amount);
    if (!categoryId) { setError("Please select a category."); return; }
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid budget amount greater than 0.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isOffline) {
        if (state.mode === "add") {
          await createBudget({
            userId: OFFLINE_USER_ID,
            categoryId: Number(categoryId),
            amount: parsed,
            month: toMonthDate(month),
          });
        } else if (state.mode === "edit") {
          await updateBudget(Number(state.budget.id), { amount: parsed });
        }
        onSaved();
        onClose();
        return;
      }

      if (!userId) {
        setError("Please sign in to save a budget.");
        return;
      }

      const supabase = createClient();
      if (state.mode === "add") {
        const { error: insertError } = await loggedSupabase(
          "budgets insert",
          supabase.from("budgets").insert({
          user_id: userId,
          category_id: categoryId,
          amount: parsed,
          month: toMonthDate(month),
          })
        );

        if (insertError) {
          setError(insertError.message);
          return;
        }
      } else if (state.mode === "edit") {
        if (!state.budget.id) {
          setError("Missing budget id. Close and reopen this budget, then try again.");
          return;
        }

        const payload = { amount: parsed };
        const { data: updatedRows, error: updateError } = await loggedSupabase(
          "budgets update",
          supabase
            .from("budgets")
            .update(payload)
            .eq("id", state.budget.id)
            .eq("user_id", userId)
            .select("id,user_id,category_id,amount,month,created_at,updated_at,synced_at,is_deleted")
        );

        if (updateError) {
          setError(updateError.message);
          return;
        }

        const updatedBudget = ((updatedRows ?? []) as SupabaseBudget[])[0] ?? {
          ...state.budget,
          ...payload,
        };
        onSaved(updatedBudget);
        onClose();
        return;
      }
      onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save budget.");
    } finally {
      setSaving(false);
    }
  }

  if (state.mode === "closed") return null;

  const selectedCat = categories.find((c) => c.id === categoryId);
  const colorInfo   = getColor(selectedCat?.color ?? "zinc");
  const IconPreview = getIcon(selectedCat?.icon ?? "Target");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />

      <div className="dezu-modal-panel theme-surface relative w-full shadow-2xl ring-1 ring-border sm:max-w-sm sm:rounded-2xl">
        {/* header */}
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colorInfo.bg)}>
              <IconPreview size={15} className={colorInfo.text} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-50">
                {isEdit ? "Edit Budget" : "New Budget"}
              </h2>
              <p className="text-xs text-zinc-500">{formatMonthLabel(month)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="theme-icon-button w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* form body */}
        <div className="dezu-modal-body flex flex-col gap-5 px-5 py-5">
          {/* category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Category
            </label>
            {isEdit ? (
              <div className="h-9 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3">
                {selectedCat && (
                  <div className={cn("w-5 h-5 rounded-md flex items-center justify-center shrink-0", colorInfo.bg)}>
                    <IconPreview size={11} className={colorInfo.text} strokeWidth={1.75} />
                  </div>
                )}
                <span className="text-sm text-zinc-300">{selectedCat?.name ?? "—"}</span>
              </div>
            ) : availableCategories.length === 0 ? (
              <div className="h-9 flex items-center rounded-lg border border-zinc-700 bg-zinc-800/50 px-3">
                <span className="text-sm text-zinc-500">{categoryUnavailableMessage}</span>
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors appearance-none"
              >
                <option value="">Select category…</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Monthly Budget Limit
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400 pointer-events-none">
                {symbol}
              </span>
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

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* footer */}
        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button
            onClick={onClose}
            className="theme-hover px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!isEdit && availableCategories.length === 0)}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Budget"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({
  item,
  deleting,
  error,
  onConfirm,
  onClose,
}: {
  item: BudgetWithUsage | null;
  deleting: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { formatCurrency } = useCurrency();
  if (!item) return null;

  const colorInfo = getColor(item.category?.color ?? "zinc");
  const Icon      = getIcon(item.category?.icon ?? "Tag");

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
            <h3 className="text-base font-semibold text-zinc-50">Delete budget?</h3>

            <div className="flex items-center justify-center gap-2">
              <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", colorInfo.bg)}>
                <Icon size={12} className={colorInfo.text} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium text-zinc-200">
                {item.category?.name ?? "Unknown"}
              </span>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              The {formatMonthLabel(item.budget.month)} budget of{" "}
              <span className="text-zinc-300 font-medium">{formatCurrency(Number(item.budget.amount))}</span>{" "}
              will be permanently removed. Transactions are not affected.
            </p>

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
          >
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

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  accent,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  className?: string;
}) {
  return (
    <div className={cn("dezu-card flex flex-col gap-0.5 rounded-[1.15rem] bg-card/90 p-3 sm:gap-1 sm:p-4", className)}>
      <p className="truncate text-[11px] font-medium text-zinc-500 sm:text-xs">{label}</p>
      <p className={cn("truncate text-base font-bold tabular-nums tracking-tight sm:text-xl", accent ?? "text-zinc-50")}>
        {value}
      </p>
      {sub && <p className="truncate text-[11px] text-zinc-600 sm:text-xs">{sub}</p>}
    </div>
  );
}

// ─── BudgetsView (main) ───────────────────────────────────────────────────────

export function BudgetsView() {
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const { formatCurrency } = useCurrency();
  const [month,       setMonth]       = useState(todayMonth);
  const [modal,       setModal]       = useState<ModalState>({ mode: "closed" });
  const [deleteTarget,setDeleteTarget]= useState<BudgetWithUsage | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [data,        setData]        = useState<BudgetWithUsage[]>([]);
  const [categories,  setCategories]  = useState<SupabaseCategory[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState("");
  const loadRequestId = useRef(0);

  const loadBudgets = useCallback(async (
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
        const monthStart = toMonthDate(month);
        const monthEnd = monthEndDate(month);
        const [localBudgets, localCategories, localTransactions] = await Promise.all([
          getBudgets(monthStart, OFFLINE_USER_ID),
          getCategories(OFFLINE_USER_ID),
          getTransactions({ userId: OFFLINE_USER_ID, type: "expense", startDate: monthStart, endDate: monthEnd }),
        ]);
        if (!isCurrent()) return;

        const cats = localCategories.map(localCategoryToSupabase);
        const catMap = new Map(cats.map((cat) => [cat.id, cat]));
        const spentByCategory = new Map<string, number>();
        for (const tx of localTransactions) {
          spentByCategory.set(String(tx.categoryId), (spentByCategory.get(String(tx.categoryId)) ?? 0) + Number(tx.amount));
        }

        setData(localBudgets.map((localBudget) => {
          const budget = localBudgetToSupabase(localBudget);
          const amount = Number(budget.amount);
          const spent = spentByCategory.get(budget.category_id) ?? 0;
          const remaining = amount - spent;
          const percentage = amount > 0 ? (spent / amount) * 100 : 0;
          const status: StatusKey =
            percentage >= 100 ? "over" :
            percentage >= 90  ? "critical" :
            percentage >= 75  ? "warning" :
            "normal";
          return { budget, category: catMap.get(budget.category_id), spent, remaining, percentage, status };
        }));
        setCategories(cats);
        return;
      }

      if (!user?.id) {
        if (!isCurrent()) return;
        setData([]);
        setCategories([]);
        return;
      }

      const supabase = createClient();
      const monthStart = toMonthDate(month);
      const monthEnd = monthEndDate(month);

      const [budgetSettled, categoriesSettled, transactionSettled] = await Promise.allSettled([
        loggedSupabase(
          "budgets",
          supabase
            .from("budgets")
            .select("id,user_id,category_id,amount,month,created_at,updated_at,synced_at,is_deleted")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .eq("month", monthStart)
            .order("created_at", { ascending: true })
        ),
        ensureSupabaseDefaultCategories(user.id),
        loggedSupabase(
          "transactions",
          supabase
            .from("transactions")
            .select("category_id,amount")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .eq("transaction_type", "expense")
            .gte("transaction_date", monthStart)
            .lte("transaction_date", monthEnd)
        ),
      ]);

      if (!isCurrent()) return;

      const errors = [budgetSettled, categoriesSettled, transactionSettled].map(settledError).filter(Boolean);
      if (errors.length > 0) setLoadError(errors.join(" | "));

      const budgetResult = budgetSettled.status === "fulfilled" ? budgetSettled.value : { data: [] };
      const categoriesResult = categoriesSettled.status === "fulfilled" ? categoriesSettled.value : [];
      const transactionResult = transactionSettled.status === "fulfilled" ? transactionSettled.value : { data: [] };
      const budgets = (budgetResult.data ?? []) as SupabaseBudget[];
      const cats = categoriesResult;
      const txs = (transactionResult.data ?? []) as SupabaseTransaction[];
      const catMap = new Map(cats.map((cat) => [cat.id, cat]));
      const spentByCategory = new Map<string, number>();

      for (const tx of txs) {
        if (!tx.category_id) continue;
        spentByCategory.set(
          tx.category_id,
          (spentByCategory.get(tx.category_id) ?? 0) + Number(tx.amount)
        );
      }

      const resolved = budgets.map((budget) => {
        const amount = Number(budget.amount);
        const spent = spentByCategory.get(budget.category_id) ?? 0;
        const remaining = amount - spent;
        const percentage = amount > 0 ? (spent / amount) * 100 : 0;
        const status: StatusKey =
          percentage >= 100 ? "over" :
          percentage >= 90  ? "critical" :
          percentage >= 75  ? "warning" :
          "normal";

        return {
          budget,
          category: catMap.get(budget.category_id),
          spent,
          remaining,
          percentage,
          status,
        };
      });

      setData(resolved);
      setCategories(cats);
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load budgets.");
      setData([]);
      setCategories([]);
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, month, user?.id]);

  useEffect(() => {
    let mounted = true;
    loadBudgets(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadBudgets]);

  const usedCategoryIds = useMemo(
    () => new Set(data.map((d) => d.budget.category_id)),
    [data]
  );

  function handleBudgetSaved(updatedBudget?: SupabaseBudget) {
    if (updatedBudget) {
      setData((current) =>
        current.map((item) =>
          item.budget.id === updatedBudget.id
            ? {
                ...item,
                budget: updatedBudget,
                remaining: Number(updatedBudget.amount) - item.spent,
                percentage: Number(updatedBudget.amount) > 0
                  ? (item.spent / Number(updatedBudget.amount)) * 100
                  : 0,
                status:
                  Number(updatedBudget.amount) > 0 && (item.spent / Number(updatedBudget.amount)) * 100 >= 100 ? "over" :
                  Number(updatedBudget.amount) > 0 && (item.spent / Number(updatedBudget.amount)) * 100 >= 90  ? "critical" :
                  Number(updatedBudget.amount) > 0 && (item.spent / Number(updatedBudget.amount)) * 100 >= 75  ? "warning" :
                  "normal",
              }
            : item
        )
      );
    }

    void loadBudgets(undefined, { silent: true });
  }

  const totalBudget    = data.reduce((s, d) => s + Number(d.budget.amount), 0);
  const totalSpent     = data.reduce((s, d) => s + d.spent, 0);
  const totalRemaining = totalBudget - totalSpent;

  const overCount = data.filter((d) => d.status === "over").length;
  const warningCount = data.filter(
    (d) => d.status === "warning" || d.status === "critical"
  ).length;

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (isGuest) {
        await deleteBudget(Number(deleteTarget.budget.id));
        setDeleteTarget(null);
        void loadBudgets(undefined, { silent: true });
        return;
      }

      const supabase = createClient();
      if (!user?.id) {
        setDeleteError("Please sign in to delete a budget.");
        return;
      }

      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", deleteTarget.budget.id)
        .eq("user_id", user.id);

      if (error) {
        setDeleteError(error.message);
        return;
      }

      setDeleteTarget(null);
      void loadBudgets(undefined, { silent: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete budget.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="px-5 py-7 max-w-4xl mx-auto space-y-6">
        {/* page header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-zinc-50 tracking-tight">Budgets</h1>
            <p className="mt-0.5 truncate text-sm text-zinc-500">
              {loading
                ? "Loading…"
                : data.length === 0
                ? "No budgets set for this month"
                : `${data.length} budget${data.length !== 1 ? "s" : ""} · ${
                    overCount > 0
                      ? `${overCount} over budget`
                      : warningCount > 0
                      ? `${warningCount} need attention`
                      : "All on track"
                  }`}
            </p>
          </div>

          <button
            aria-label="Add Budget"
            onClick={() => setModal({ mode: "add" })}
            className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 sm:h-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden min-[390px]:inline sm:inline">Add Budget</span>
          </button>
        </div>

        {/* month navigation */}
        <div className="theme-pill-list flex items-center justify-between rounded-xl px-2 py-1.5 w-fit gap-1 self-start">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="theme-icon-button w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <span className="text-sm font-semibold text-zinc-100 min-w-[140px] text-center tabular-nums">
            {formatMonthLabel(month)}
          </span>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="theme-icon-button w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          >
            <ChevronRight size={16} strokeWidth={2} />
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
            {data.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                <SummaryCard
                  label="Total Budget"
                  value={formatCurrency(totalBudget)}
                  sub={`${data.length} categor${data.length !== 1 ? "ies" : "y"}`}
                />
                <SummaryCard
                  label="Total Spent"
                  value={formatCurrency(totalSpent)}
                  accent={
                    totalSpent > totalBudget
                      ? "text-rose-400"
                      : totalSpent > totalBudget * 0.9
                      ? "text-orange-400"
                      : "text-zinc-50"
                  }
                  sub={
                    totalBudget > 0
                      ? `${((totalSpent / totalBudget) * 100).toFixed(1)}% used`
                      : undefined
                  }
                />
                <SummaryCard
                  label="Remaining"
                  value={formatCurrency(Math.abs(totalRemaining))}
                  accent={totalRemaining < 0 ? "text-rose-400" : "text-emerald-400"}
                  sub={totalRemaining < 0 ? "over budget" : "available"}
                  className="col-span-2 sm:col-span-1"
                />
              </div>
            )}

            {/* budget cards grid */}
            {data.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.map((item) => (
                  <BudgetCard
                    key={item.budget.id}
                    item={item}
                    onEdit={() => setModal({ mode: "edit", budget: item.budget })}
                    onDelete={() => setDeleteTarget(item)}
                  />
                ))}
              </div>
            ) : (
              /* empty state */
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
                  <Target size={28} className="text-zinc-500" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-300">
                    No budgets for {formatMonthLabel(month)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                    Set spending limits per category to track where your money goes.
                  </p>
                </div>
                <button
                  onClick={() => setModal({ mode: "add" })}
                  className="theme-hover flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--theme-card)] text-foreground font-medium text-sm transition-colors ring-1 ring-border"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  Add your first budget
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <AddEditModal
        state={modal}
        month={month}
        categories={categories}
        usedCategoryIds={usedCategoryIds}
        loadError={loadError}
          userId={user?.id ?? null}
          isOffline={isGuest}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={handleBudgetSaved}
      />
      <DeleteConfirmModal
        item={deleteTarget}
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
