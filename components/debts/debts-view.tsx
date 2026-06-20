"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  HandCoins,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencyInputPrefix } from "@/components/ui/currency-input-prefix";
import { DetailRow, DetailRows } from "@/components/ui/details-modal";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { loggedSupabase } from "@/lib/supabase/query";
import {
  addDebtPayment,
  archiveDebt,
  createCategory,
  createDebt,
  createTransaction,
  effectiveDebtStatus,
  getCategories,
  getDebts,
  getNextSortOrder,
  getTransactions,
  getWallets,
  updateDebt,
  updateOverdueLocalDebts,
  type DbCategory,
  type DbDebt,
  type DbWallet,
  type DebtStatus,
  type DebtType,
} from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

type FilterTab = "all" | "active" | "i_owe" | "owes_me" | "overdue" | "paid";

type SupabaseDebt = {
  id: string;
  user_id: string;
  person_name: string;
  debt_type: DebtType;
  wallet_id: string | null;
  original_amount: number | string;
  remaining_balance: number | string;
  borrowed_date: string;
  due_date: string | null;
  notes: string | null;
  status: DebtStatus;
};

type SupabaseWallet = {
  id: string;
  name: string;
  balance: number | string;
};

type SupabaseCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
  icon: string | null;
  color: string | null;
};

type DebtFormState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; debt: SupabaseDebt };

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(iso: string | null) {
  if (!iso) return "No due date";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const now = new Date(todayIso() + "T00:00:00").getTime();
  const target = new Date(iso + "T00:00:00").getTime();
  return Math.round((target - now) / 86400000);
}

function localDebtToSupabase(debt: DbDebt): SupabaseDebt {
  return {
    id: String(debt.id),
    user_id: debt.userId,
    person_name: debt.personName,
    debt_type: debt.debtType,
    wallet_id: debt.walletId != null ? String(debt.walletId) : null,
    original_amount: debt.originalAmount,
    remaining_balance: debt.remainingBalance,
    borrowed_date: debt.borrowedDate,
    due_date: debt.dueDate,
    notes: debt.notes ?? null,
    status: debt.status,
  };
}

function localWalletToSupabase(wallet: DbWallet): SupabaseWallet {
  return { id: String(wallet.id), name: wallet.name, balance: wallet.balance };
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

const DEBT_CATEGORY_META: Record<string, { type: "income" | "expense"; icon: string; color: string }> = {
  "Borrowed Money": { type: "income", icon: "HandCoins", color: "sky" },
  "Money Lent": { type: "expense", icon: "HandCoins", color: "amber" },
  "Debt Payment": { type: "expense", icon: "ArrowUpRight", color: "rose" },
  "Debt Collection": { type: "income", icon: "ArrowDownLeft", color: "emerald" },
};

async function ensureLocalDebtCategory(name: keyof typeof DEBT_CATEGORY_META, userId = OFFLINE_USER_ID) {
  const meta = DEBT_CATEGORY_META[name];
  const existing = (await getCategories(userId)).find((category) => category.name === name && category.type === meta.type);
  if (existing) return existing.id;
  const sortOrder = await getNextSortOrder();
  return createCategory({
    userId,
    name,
    type: meta.type,
    icon: meta.icon,
    color: meta.color,
    isDefault: true,
    sortOrder,
  });
}

async function ensureSupabaseDebtCategory(name: keyof typeof DEBT_CATEGORY_META, userId: string) {
  const meta = DEBT_CATEGORY_META[name];
  const supabase = createClient();
  const { data: existing, error: readError } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .eq("type", meta.type)
    .eq("is_deleted", false)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: userId,
      name,
      type: meta.type,
      icon: meta.icon,
      color: meta.color,
      is_default: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

function toLocalDebt(debt: SupabaseDebt): Pick<DbDebt, "status" | "remainingBalance" | "dueDate"> {
  return {
    status: debt.status,
    remainingBalance: Number(debt.remaining_balance),
    dueDate: debt.due_date,
  };
}

function effectiveStatus(debt: SupabaseDebt): DebtStatus {
  return effectiveDebtStatus(toLocalDebt(debt));
}

function isMissingColumnError(error: { message?: string } | null | undefined, column: string) {
  return !!error?.message?.toLowerCase().includes(`column ${column.toLowerCase()} does not exist`);
}

function dueLabel(debt: SupabaseDebt) {
  if (effectiveStatus(debt) === "paid") return "Paid";
  const diff = daysUntil(debt.due_date);
  if (diff == null) return "No due date";
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} late`;
  if (diff === 0) return "Due today";
  if (diff <= 7) return `Due in ${diff} day${diff === 1 ? "" : "s"}`;
  return formatDate(debt.due_date);
}

const STATUS_CONFIG: Record<DebtStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-sky-500/10 text-sky-300" },
  paid: { label: "Paid", className: "bg-emerald-500/10 text-emerald-300" },
  overdue: { label: "Overdue", className: "bg-rose-500/10 text-rose-300" },
};

function DebtStatusBadge({ status }: { status: DebtStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold leading-none", config.className)}>
      {config.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "rose" | "emerald" | "amber" | "sky";
  icon: typeof HandCoins;
}) {
  const toneClass = {
    rose: "bg-rose-500/10 text-rose-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    sky: "bg-sky-500/10 text-sky-400",
  }[tone];

  return (
    <div className="dezu-card rounded-[1.15rem] bg-card/90 p-2.5 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
          <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-card-foreground sm:text-lg">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{sub}</p>
        </div>
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl", toneClass)}>
          <Icon size={15} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

function DebtModal({
  state,
  wallets,
  linkedTransactionCount,
  isOffline,
  userId,
  onClose,
  onSaved,
}: {
  state: Exclude<DebtFormState, { mode: "closed" }>;
  wallets: SupabaseWallet[];
  linkedTransactionCount: number;
  isOffline: boolean;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.debt : null;
  const [personName, setPersonName] = useState(initial?.person_name ?? "");
  const [debtType, setDebtType] = useState<DebtType>(initial?.debt_type ?? "i_owe");
  const [walletId, setWalletId] = useState(initial?.wallet_id ?? "");
  const [originalAmount, setOriginalAmount] = useState(initial ? String(initial.original_amount) : "");
  const [remainingBalance, setRemainingBalance] = useState(initial ? String(initial.remaining_balance) : "");
  const [borrowedDate, setBorrowedDate] = useState(initial?.borrowed_date ?? todayIso());
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const parsedOriginal = Number(originalAmount);
    const parsedRemaining = isEdit ? Number(remainingBalance) : parsedOriginal;
    setError("");

    if (!personName.trim()) { setError("Person name is required."); return; }
    if (!originalAmount.trim() || Number.isNaN(parsedOriginal) || parsedOriginal <= 0) {
      setError("Enter an original amount greater than 0.");
      return;
    }
    if (Number.isNaN(parsedRemaining) || parsedRemaining < 0) {
      setError("Remaining balance cannot be negative.");
      return;
    }
    if (parsedRemaining > parsedOriginal) {
      setError("Remaining balance cannot exceed the original amount.");
      return;
    }
    if (!borrowedDate) { setError("Borrowed or lent date is required."); return; }
    if (!isEdit && !walletId) { setError("Select the wallet that received or sent the money."); return; }

    const nextStatus: DebtStatus = parsedRemaining <= 0
      ? "paid"
      : dueDate && dueDate < todayIso()
      ? "overdue"
      : "active";

    setSaving(true);
    try {
      if (isOffline) {
        const payload = {
          userId: OFFLINE_USER_ID,
          personName: personName.trim(),
          debtType,
          walletId: walletId ? Number(walletId) : null,
          originalAmount: parsedOriginal,
          remainingBalance: parsedRemaining,
          borrowedDate,
          dueDate: dueDate || null,
          notes: notes.trim() || undefined,
          status: nextStatus,
          isDeleted: false,
        };
        if (isEdit) await updateDebt(Number(state.debt.id), payload);
        else {
          const debtId = await createDebt(payload);
          const categoryId = await ensureLocalDebtCategory(debtType === "i_owe" ? "Borrowed Money" : "Money Lent");
          await createTransaction({
            userId: OFFLINE_USER_ID,
            walletId: Number(walletId),
            categoryId,
            type: debtType === "i_owe" ? "income" : "expense",
            amount: parsedOriginal,
            date: borrowedDate,
            name: debtType === "i_owe" ? `Borrowed money from ${personName.trim()}` : `Money lent to ${personName.trim()}`,
            notes: notes.trim() || undefined,
            debtId,
            debtType,
            personName: personName.trim(),
          });
        }
        onSaved();
        onClose();
        return;
      }

      if (!userId) { setError("Please sign in to save debts."); return; }
      const supabase = createClient();
      const payload = {
        user_id: userId,
        person_name: personName.trim(),
        debt_type: debtType,
        wallet_id: walletId || null,
        original_amount: parsedOriginal,
        remaining_balance: parsedRemaining,
        borrowed_date: borrowedDate,
        due_date: dueDate || null,
        notes: notes.trim() || null,
        status: nextStatus,
      };

      if (isEdit) {
        const result = await supabase.from("debts").update(payload).eq("id", state.debt.id).eq("user_id", userId);
        if (result.error) { setError(result.error.message); return; }
      } else {
        const categoryId = await ensureSupabaseDebtCategory(debtType === "i_owe" ? "Borrowed Money" : "Money Lent", userId);
        const { data: walletRow, error: walletReadError } = await supabase
          .from("wallets")
          .select("balance")
          .eq("id", walletId)
          .eq("user_id", userId)
          .maybeSingle();
        if (walletReadError) { setError(walletReadError.message); return; }
        if (!walletRow) { setError("Selected wallet was not found."); return; }

        const { data: debtRow, error: debtError } = await supabase
          .from("debts")
          .insert(payload)
          .select("id")
          .single();
        if (debtError) { setError(debtError.message); return; }

        const previousBalance = Number(walletRow.balance ?? 0);
        const nextBalance = previousBalance + (debtType === "i_owe" ? parsedOriginal : -parsedOriginal);
        const { error: walletUpdateError } = await supabase
          .from("wallets")
          .update({ balance: nextBalance })
          .eq("id", walletId)
          .eq("user_id", userId);
        if (walletUpdateError) {
          await supabase.from("debts").delete().eq("id", debtRow.id).eq("user_id", userId);
          setError(walletUpdateError.message);
          return;
        }

        const { error: txError } = await supabase.from("transactions").insert({
          user_id: userId,
          wallet_id: walletId,
          category_id: categoryId,
          amount: parsedOriginal,
          transaction_type: debtType === "i_owe" ? "income" : "expense",
          description: debtType === "i_owe" ? `Borrowed money from ${personName.trim()}` : `Money lent to ${personName.trim()}`,
          notes: notes.trim() || null,
          transaction_date: borrowedDate,
          debt_id: debtRow.id,
          debt_type: debtType,
          person_name: personName.trim(),
        });
        if (txError) {
          await supabase.from("wallets").update({ balance: previousBalance }).eq("id", walletId).eq("user_id", userId);
          await supabase.from("debts").delete().eq("id", debtRow.id).eq("user_id", userId);
          setError(txError.message);
          return;
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save debt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="dezu-modal-panel relative w-full bg-card shadow-2xl ring-1 ring-border sm:max-w-lg sm:rounded-2xl">
        <div className="dezu-modal-header flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-card-foreground">{isEdit ? "Edit Debt" : "Add Debt"}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          {isEdit && linkedTransactionCount > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
              This debt has {linkedTransactionCount} linked transaction{linkedTransactionCount === 1 ? "" : "s"}. Editing details will not rewrite existing transaction history.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Person name</label>
              <Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="e.g. Maria" className="h-9" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Debt type</label>
              <select value={debtType} onChange={(e) => setDebtType(e.target.value as DebtType)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="i_owe">I Owe</option>
                <option value="owes_me">Owes Me</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {debtType === "i_owe" ? "Receiving wallet" : "Lending wallet"}
              </label>
              <select value={walletId} onChange={(e) => setWalletId(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select wallet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Original amount</label>
              <div className="relative">
                <CurrencyInputPrefix />
                <Input type="number" min="0.01" step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} placeholder="0.00" className="h-9 pl-10" />
              </div>
            </div>

            {isEdit && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Remaining balance</label>
                <div className="relative">
                  <CurrencyInputPrefix />
                  <Input type="number" min="0" step="0.01" value={remainingBalance} onChange={(e) => setRemainingBalance(e.target.value)} placeholder="0.00" className="h-9 pl-10" />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Borrowed/Lent date</label>
              <Input type="date" value={borrowedDate} onChange={(e) => setBorrowedDate(e.target.value)} className="h-9" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</p>}
        </div>

        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Debt"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({
  debt,
  wallets,
  isOffline,
  userId,
  onClose,
  onSaved,
}: {
  debt: SupabaseDebt;
  wallets: SupabaseWallet[];
  isOffline: boolean;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState(debt.wallet_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const remaining = Number(debt.remaining_balance);

  async function handleSave() {
    const parsed = Number(amount);
    setError("");
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (parsed > remaining) {
      setError("Payment cannot exceed the remaining balance.");
      return;
    }
    if (!walletId) {
      setError(debt.debt_type === "i_owe" ? "Select the payment wallet." : "Select the receiving wallet.");
      return;
    }
    setSaving(true);
    try {
      if (isOffline) {
        const categoryId = await ensureLocalDebtCategory(debt.debt_type === "i_owe" ? "Debt Payment" : "Debt Collection");
        await addDebtPayment(Number(debt.id), parsed, OFFLINE_USER_ID);
        await createTransaction({
          userId: OFFLINE_USER_ID,
          walletId: Number(walletId),
          categoryId,
          type: debt.debt_type === "i_owe" ? "expense" : "income",
          amount: parsed,
          date: todayIso(),
          name: debt.debt_type === "i_owe" ? `Debt payment to ${debt.person_name}` : `Debt collection from ${debt.person_name}`,
          notes: debt.notes ?? undefined,
          debtId: Number(debt.id),
          debtType: debt.debt_type,
          personName: debt.person_name,
        });
        onSaved();
        onClose();
        return;
      }
      if (!userId) { setError("Please sign in to update debts."); return; }
      const nextRemaining = Math.max(0, remaining - parsed);
      const nextStatus: DebtStatus = nextRemaining <= 0
        ? "paid"
        : debt.due_date && debt.due_date < todayIso()
        ? "overdue"
        : "active";
      const supabase = createClient();
      const categoryId = await ensureSupabaseDebtCategory(debt.debt_type === "i_owe" ? "Debt Payment" : "Debt Collection", userId);
      const { data: walletRow, error: walletReadError } = await supabase
        .from("wallets")
        .select("balance")
        .eq("id", walletId)
        .eq("user_id", userId)
        .maybeSingle();
      if (walletReadError) { setError(walletReadError.message); return; }
      if (!walletRow) { setError("Selected wallet was not found."); return; }

      const { error: updateError } = await supabase
        .from("debts")
        .update({ remaining_balance: nextRemaining, status: nextStatus })
        .eq("id", debt.id)
        .eq("user_id", userId);
      if (updateError) { setError(updateError.message); return; }

      const previousBalance = Number(walletRow.balance ?? 0);
      const nextBalance = previousBalance + (debt.debt_type === "i_owe" ? -parsed : parsed);
      const { error: walletUpdateError } = await supabase
        .from("wallets")
        .update({ balance: nextBalance })
        .eq("id", walletId)
        .eq("user_id", userId);
      if (walletUpdateError) {
        await supabase.from("debts").update({ remaining_balance: remaining, status: debt.status }).eq("id", debt.id).eq("user_id", userId);
        setError(walletUpdateError.message);
        return;
      }

      const { error: txError } = await supabase.from("transactions").insert({
        user_id: userId,
        wallet_id: walletId,
        category_id: categoryId,
        amount: parsed,
        transaction_type: debt.debt_type === "i_owe" ? "expense" : "income",
        description: debt.debt_type === "i_owe" ? `Debt payment to ${debt.person_name}` : `Debt collection from ${debt.person_name}`,
        notes: debt.notes,
        transaction_date: todayIso(),
        debt_id: debt.id,
        debt_type: debt.debt_type,
        person_name: debt.person_name,
      });
      if (txError) {
        await supabase.from("wallets").update({ balance: previousBalance }).eq("id", walletId).eq("user_id", userId);
        await supabase.from("debts").update({ remaining_balance: remaining, status: debt.status }).eq("id", debt.id).eq("user_id", userId);
        setError(txError.message);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="theme-surface relative flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-card-foreground">
            {debt.debt_type === "i_owe" ? "Add Payment" : "Add Collection"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Remaining: {formatCurrency(remaining)}
          </p>
        </div>
        <div className="px-5 py-5">
          <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <div className="mt-1.5 flex gap-2">
                <div className="relative flex-1">
                  <CurrencyInputPrefix />
                  <Input type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 pl-10" placeholder="0.00" />
                </div>
                <button type="button" onClick={() => setAmount(String(remaining))} className="shrink-0 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted">
                  Full
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {debt.debt_type === "i_owe" ? "Payment wallet" : "Receiving wallet"}
              </label>
              <select value={walletId} onChange={(e) => setWalletId(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select wallet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className="theme-hover flex-1 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function DebtDetailsModal({
  debt,
  wallet,
  onClose,
  onEdit,
  onDelete,
  onPayment,
}: {
  debt: SupabaseDebt;
  wallet?: SupabaseWallet;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPayment: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const status = effectiveStatus(debt);
  const isOwe = debt.debt_type === "i_owe";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="theme-surface relative w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-card-foreground">{debt.person_name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{isOwe ? "I Owe" : "Owes Me"} · {dueLabel(debt)}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
          <DetailRows>
            <DetailRow label="Person" value={debt.person_name} />
            <DetailRow label="Type" value={isOwe ? "I Owe" : "Owes Me"} />
            <DetailRow label="Original" value={formatCurrency(debt.original_amount)} accent="font-bold tabular-nums" />
            <DetailRow label="Remaining" value={formatCurrency(debt.remaining_balance)} accent="font-bold tabular-nums" />
            <DetailRow label="Status" value={STATUS_CONFIG[status].label} />
            <DetailRow label="Due Date" value={formatDate(debt.due_date)} />
            <DetailRow label="Wallet" value={wallet?.name ?? "No wallet"} />
            <DetailRow label="Notes" value={debt.notes?.trim() || "No notes added"} multiline />
            <DetailRow label="Payments" value="Open transaction history to review linked debt payments." multiline />
          </DetailRows>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          {status !== "paid" && (
            <button type="button" onClick={onPayment} className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              <HandCoins size={14} />
              {isOwe ? "Add Payment" : "Add Collection"}
            </button>
          )}
          <button type="button" onClick={onEdit} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            <Pencil size={14} />
            Edit Debt
          </button>
          <button type="button" onClick={onDelete} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-rose-400 transition-colors hover:bg-rose-500/10">
            <Trash2 size={14} />
            Delete Debt
          </button>
        </div>
      </div>
    </div>
  );
}

function DebtsFilterModal({
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
          <h2 className="text-base font-semibold text-card-foreground">Filters</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
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

function DebtRow({
  debt,
  formatCurrency,
  onViewDetails,
  onEdit,
  onDelete,
  onPayment,
  onPaid,
  paying,
}: {
  debt: SupabaseDebt;
  formatCurrency: (value: number | string) => string;
  onViewDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPayment: () => void;
  onPaid: () => void;
  paying: boolean;
}) {
  const status = effectiveStatus(debt);
  const isOwe = debt.debt_type === "i_owe";
  const Icon = isOwe ? ArrowUpRight : ArrowDownLeft;
  const progress = Number(debt.original_amount) > 0
    ? Math.max(0, Math.min(100, ((Number(debt.original_amount) - Number(debt.remaining_balance)) / Number(debt.original_amount)) * 100))
    : 0;

  return (
    <div role="button" tabIndex={0} onClick={onViewDetails} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onViewDetails(); }} className="dezu-card rounded-xl bg-card/90 p-2.5 transition-colors hover:ring-1 hover:ring-[var(--theme-primary)]/30 md:rounded-[1.15rem] md:p-4">
      <div className="flex gap-2.5 md:gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-10 md:w-10", isOwe ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400")}>
          <Icon size={16} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-card-foreground">{debt.person_name}</h3>
            <span className={cn("hidden rounded-full px-2 py-1 text-[10px] font-semibold leading-none md:inline-flex", isOwe ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300")}>
              {isOwe ? "I Owe" : "Owes Me"}
            </span>
            <span className="hidden md:inline-flex"><DebtStatusBadge status={status} /></span>
          </div>
          <div className="mt-1 flex items-baseline gap-x-1.5">
            <p className="truncate text-sm font-bold tabular-nums text-card-foreground md:text-lg">{formatCurrency(debt.remaining_balance)}</p>
            <p className="text-xs text-muted-foreground md:hidden">Remaining · {STATUS_CONFIG[status].label}</p>
            <p className="hidden text-xs text-muted-foreground md:block">of {formatCurrency(debt.original_amount)}</p>
          </div>
          <div className="mt-1.5 hidden h-1 overflow-hidden rounded-full bg-muted md:mt-2 md:block md:h-1.5">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1.5 hidden flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground md:mt-2 md:flex md:gap-x-3 md:text-xs">
            <span className="hidden min-[380px]:inline">Started {formatDate(debt.borrowed_date)}</span>
            <span className={cn(status === "overdue" ? "text-rose-300" : "")}>{dueLabel(debt)}</span>
            {debt.notes && <span className="truncate md:max-w-[260px]">{debt.notes}</span>}
          </div>
        </div>

        <div className="hidden shrink-0 flex-wrap items-center gap-2 md:flex md:justify-end">
          {status !== "paid" && (
            <>
              <button type="button" onClick={(event) => { event.stopPropagation(); onPayment(); }} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                <HandCoins size={13} />
                {isOwe ? "Payment" : "Collection"}
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onPaid(); }} disabled={paying} className="theme-hover flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors disabled:pointer-events-none disabled:opacity-60">
                {paying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Paid
              </button>
            </>
          )}
          <button type="button" onClick={(event) => { event.stopPropagation(); onViewDetails(); }} className="theme-hover flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors">
            <Eye size={13} />
            Details
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }} className="theme-hover flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors">
            <Pencil size={13} />
            Edit
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} className="flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-rose-300 transition-colors hover:bg-rose-500/10">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

async function updateOverdueCloudDebts(userId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("debts")
    .update({ status: "overdue" })
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .neq("status", "paid")
    .gt("remaining_balance", 0)
    .lt("due_date", todayIso());
  return error?.message ?? "";
}

export function DebtsView() {
  const { formatCurrency } = useCurrency();
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const [debts, setDebts] = useState<SupabaseDebt[]>([]);
  const [wallets, setWallets] = useState<SupabaseWallet[]>([]);
  const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [modal, setModal] = useState<DebtFormState>({ mode: "closed" });
  const [detailTarget, setDetailTarget] = useState<SupabaseDebt | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<SupabaseDebt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupabaseDebt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  const loadDebts = useCallback(async (isMounted?: () => boolean, options?: { silent?: boolean }) => {
    const requestId = ++loadRequestId.current;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setLoadError("");
    setActionError("");
    const isCurrent = () => requestId === loadRequestId.current && (!isMounted || isMounted());

    try {
      if (authLoading || isLoggingOut) return;
      if (isGuest) {
        await updateOverdueLocalDebts(OFFLINE_USER_ID);
        const [localDebts, localWallets, localTransactions] = await Promise.all([
          getDebts(OFFLINE_USER_ID),
          getWallets(OFFLINE_USER_ID),
          getTransactions({ userId: OFFLINE_USER_ID }),
        ]);
        if (!isCurrent()) return;
        setDebts(localDebts.map(localDebtToSupabase));
        setWallets(localWallets.map(localWalletToSupabase));
        setLinkedCounts(localTransactions.reduce<Record<string, number>>((acc, tx) => {
          if (tx.debtId != null) acc[String(tx.debtId)] = (acc[String(tx.debtId)] ?? 0) + 1;
          return acc;
        }, {}));
        return;
      }
      if (!user?.id) {
        if (!isCurrent()) return;
        setDebts([]);
        setWallets([]);
        setLinkedCounts({});
        return;
      }

      const overdueError = await updateOverdueCloudDebts(user.id);
      if (overdueError) setActionError(overdueError);

      const supabase = createClient();
      const [initialDebtResult, walletResult, initialTxResult] = await Promise.all([
        loggedSupabase(
          "debts",
          supabase
            .from("debts")
            .select("id,user_id,person_name,debt_type,wallet_id,original_amount,remaining_balance,borrowed_date,due_date,notes,status")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("due_date", { ascending: true, nullsFirst: false })
        ),
        loggedSupabase(
          "debt wallets",
          supabase
            .from("wallets")
            .select("id,name,balance")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("created_at", { ascending: true })
        ),
        loggedSupabase(
          "debt linked transactions",
          supabase
            .from("transactions")
            .select("debt_id")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .not("debt_id", "is", null)
        ),
      ]);
      let debtResult: {
        data: unknown[] | null;
        error: { message?: string } | null;
      } = initialDebtResult;
      let txResult: {
        data: unknown[] | null;
        error: { message?: string } | null;
      } = initialTxResult;

      if (isMissingColumnError(debtResult.error, "debts.wallet_id")) {
        debtResult = await loggedSupabase(
          "debts without wallet column",
          supabase
            .from("debts")
            .select("id,user_id,person_name,debt_type,original_amount,remaining_balance,borrowed_date,due_date,notes,status")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("due_date", { ascending: true, nullsFirst: false })
        );
      }

      if (isMissingColumnError(txResult.error, "transactions.debt_id")) {
        txResult = { data: [], error: null } as typeof txResult;
      }

      if (!isCurrent()) return;
      const firstError = debtResult.error ?? walletResult.error ?? txResult.error;
      if (firstError) {
        setLoadError(firstError.message ?? "Failed to load debts.");
        setDebts([]);
        setWallets([]);
        setLinkedCounts({});
        return;
      }
      setDebts(((debtResult.data ?? []) as Array<Omit<SupabaseDebt, "wallet_id"> & { wallet_id?: string | null }>).map((debt) => ({
        ...debt,
        wallet_id: debt.wallet_id ?? null,
      })));
      setWallets((walletResult.data ?? []) as SupabaseWallet[]);
      setLinkedCounts(((txResult.data ?? []) as Array<{ debt_id: string | null }>).reduce<Record<string, number>>((acc, tx) => {
        if (tx.debt_id) acc[tx.debt_id] = (acc[tx.debt_id] ?? 0) + 1;
        return acc;
      }, {}));
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load debts.");
      setDebts([]);
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, user]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      loadDebts(() => mounted);
    });
    return () => {
      mounted = false;
    };
  }, [loadDebts]);

  useEffect(() => {
    if (!user?.id || isGuest) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`debts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "debts", filter: `user_id=eq.${user.id}` },
        () => loadDebts(undefined, { silent: true })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isGuest, loadDebts, user?.id]);

  const counts = useMemo(() => {
    const normalized = debts.map((debt) => ({ ...debt, effective: effectiveStatus(debt) }));
    const active = normalized.filter((debt) => debt.effective !== "paid" && Number(debt.remaining_balance) > 0);
    const payable = active.filter((debt) => debt.debt_type === "i_owe");
    const collectible = active.filter((debt) => debt.debt_type === "owes_me");
    const overdue = active.filter((debt) => debt.effective === "overdue");
    const paid = normalized.filter((debt) => debt.effective === "paid");
    return {
      all: debts.length,
      active: active.length,
      paid: paid.length,
      payableCount: payable.length,
      collectibleCount: collectible.length,
      overdueCount: overdue.length,
      totalPayable: payable.reduce((sum, debt) => sum + Number(debt.remaining_balance), 0),
      totalCollectible: collectible.reduce((sum, debt) => sum + Number(debt.remaining_balance), 0),
      overdueAmount: overdue.reduce((sum, debt) => sum + Number(debt.remaining_balance), 0),
      remainingAmount: active.reduce((sum, debt) => sum + Number(debt.remaining_balance), 0),
    };
  }, [debts]);

  const filteredDebts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debts.filter((debt) => {
      const status = effectiveStatus(debt);
      if (filter === "active" && status === "paid") return false;
      if (filter === "i_owe" && debt.debt_type !== "i_owe") return false;
      if (filter === "owes_me" && debt.debt_type !== "owes_me") return false;
      if (filter === "overdue" && status !== "overdue") return false;
      if (filter === "paid" && status !== "paid") return false;
      if (q) {
        return [debt.person_name, debt.notes ?? "", debt.debt_type].some((value) =>
          value.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [debts, filter, search]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError("");
    try {
      if (isGuest) {
        await archiveDebt(Number(deleteTarget.id));
        setDeleteTarget(null);
        void loadDebts(undefined, { silent: true });
        return;
      }
      if (!user?.id) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("debts")
        .update({ is_deleted: true })
        .eq("id", deleteTarget.id)
        .eq("user_id", user.id);
      if (error) { setActionError(error.message); return; }
      setDeleteTarget(null);
      void loadDebts(undefined, { silent: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete debt.");
    } finally {
      setDeleting(false);
    }
  }

  const tabs: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "i_owe", label: "I Owe", count: counts.payableCount },
    { key: "owes_me", label: "Owes Me", count: counts.collectibleCount },
    { key: "overdue", label: "Overdue", count: counts.overdueCount },
    { key: "paid", label: "Paid", count: counts.paid },
  ];

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:space-y-6 sm:px-5 sm:py-7">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground">Debt Tracker</h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {loading ? "Loading..." : `${counts.active} active debts, ${counts.paid} paid`}
            </p>
          </div>
          <button type="button" aria-label="Add Debt" onClick={() => setModal({ mode: "add" })} className="flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:h-auto sm:px-4 sm:py-2 sm:text-sm">
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden min-[390px]:inline sm:inline">Add Debt</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {loadError && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{loadError}</div>}
            {actionError && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">{actionError}</div>}

            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <SummaryCard label="Total I Owe" value={formatCurrency(counts.totalPayable)} sub={`${counts.payableCount} payable`} icon={ArrowUpRight} tone="rose" />
              <SummaryCard label="Total Owes Me" value={formatCurrency(counts.totalCollectible)} sub={`${counts.collectibleCount} collectible`} icon={ArrowDownLeft} tone="emerald" />
              <SummaryCard label="Remaining Balance" value={formatCurrency(counts.remainingAmount)} sub="All active debts" icon={HandCoins} tone="sky" />
              <SummaryCard label="Overdue Debts" value={formatCurrency(counts.overdueAmount)} sub={`${counts.overdueCount} overdue`} icon={AlertTriangle} tone="amber" />
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search person or notes..." className="h-9 pl-9 text-sm" />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-card)] text-muted-foreground ring-1 ring-border transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
                title="Filters"
                aria-label="Open debt filters"
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>

            {filteredDebts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <HandCoins size={28} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-card-foreground">No debts found</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Track money you borrowed and money others borrowed from you.
                  </p>
                </div>
                <button type="button" onClick={() => setModal({ mode: "add" })} className="theme-hover flex items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-4 py-2 text-sm font-medium text-foreground ring-1 ring-border transition-colors">
                  <Plus size={14} strokeWidth={2.5} />
                  Add your first debt
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
                {filteredDebts.map((debt) => (
                  <DebtRow
                    key={debt.id}
                    debt={debt}
                    formatCurrency={formatCurrency}
                    onViewDetails={() => setDetailTarget(debt)}
                    onEdit={() => setModal({ mode: "edit", debt })}
                    onDelete={() => setDeleteTarget(debt)}
                    onPayment={() => setPaymentTarget(debt)}
                    onPaid={() => setPaymentTarget(debt)}
                    paying={payingId === debt.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {modal.mode !== "closed" && (
        <DebtModal
          key={modal.mode === "edit" ? modal.debt.id : "add"}
          state={modal}
          wallets={wallets}
          linkedTransactionCount={modal.mode === "edit" ? linkedCounts[modal.debt.id] ?? 0 : 0}
          isOffline={isGuest}
          userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
          onClose={() => setModal({ mode: "closed" })}
          onSaved={() => loadDebts(undefined, { silent: true })}
        />
      )}

      {detailTarget && (
        <DebtDetailsModal
          debt={detailTarget}
          wallet={detailTarget.wallet_id ? wallets.find((wallet) => wallet.id === detailTarget.wallet_id) : undefined}
          onClose={() => setDetailTarget(null)}
          onEdit={() => {
            setModal({ mode: "edit", debt: detailTarget });
            setDetailTarget(null);
          }}
          onDelete={() => {
            setDeleteTarget(detailTarget);
            setDetailTarget(null);
          }}
          onPayment={() => {
            setPaymentTarget(detailTarget);
            setDetailTarget(null);
          }}
        />
      )}

      <DebtsFilterModal
        open={filterOpen}
        tabs={tabs}
        value={filter}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />

      {paymentTarget && (
        <PaymentModal
          debt={paymentTarget}
          wallets={wallets}
          isOffline={isGuest}
          userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => loadDebts(undefined, { silent: true })}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="theme-surface relative w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border">
            <div className="flex flex-col gap-3 px-5 py-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
                <Trash2 size={24} strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-card-foreground">Delete debt?</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  This debt for {deleteTarget.person_name} will be hidden from your list.
                  {(linkedCounts[deleteTarget.id] ?? 0) > 0 && (
                    <>
                      {" "}It has {linkedCounts[deleteTarget.id]} linked transaction{linkedCounts[deleteTarget.id] === 1 ? "" : "s"}, which will remain in transaction history.
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border px-5 py-4">
              <button type="button" onClick={() => setDeleteTarget(null)} className="theme-hover flex-1 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-400 disabled:pointer-events-none disabled:opacity-60">
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
