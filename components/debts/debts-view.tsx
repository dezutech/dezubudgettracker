"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  HandCoins,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { loggedSupabase } from "@/lib/supabase/query";
import {
  addDebtPayment,
  archiveDebt,
  createDebt,
  effectiveDebtStatus,
  getDebts,
  markDebtPaid,
  updateDebt,
  updateOverdueLocalDebts,
  type DbDebt,
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
  original_amount: number | string;
  remaining_balance: number | string;
  borrowed_date: string;
  due_date: string | null;
  notes: string | null;
  status: DebtStatus;
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
    original_amount: debt.originalAmount,
    remaining_balance: debt.remainingBalance,
    borrowed_date: debt.borrowedDate,
    due_date: debt.dueDate,
    notes: debt.notes ?? null,
    status: debt.status,
  };
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
  isOffline,
  userId,
  onClose,
  onSaved,
}: {
  state: Exclude<DebtFormState, { mode: "closed" }>;
  isOffline: boolean;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.debt : null;
  const [personName, setPersonName] = useState(initial?.person_name ?? "");
  const [debtType, setDebtType] = useState<DebtType>(initial?.debt_type ?? "i_owe");
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
          originalAmount: parsedOriginal,
          remainingBalance: parsedRemaining,
          borrowedDate,
          dueDate: dueDate || null,
          notes: notes.trim() || undefined,
          status: nextStatus,
          isDeleted: false,
        };
        if (isEdit) await updateDebt(Number(state.debt.id), payload);
        else await createDebt(payload);
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
        original_amount: parsedOriginal,
        remaining_balance: parsedRemaining,
        borrowed_date: borrowedDate,
        due_date: dueDate || null,
        notes: notes.trim() || null,
        status: nextStatus,
      };

      const result = isEdit
        ? await supabase.from("debts").update(payload).eq("id", state.debt.id).eq("user_id", userId)
        : await supabase.from("debts").insert(payload);

      if (result.error) { setError(result.error.message); return; }
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
              <label className="text-xs font-medium text-muted-foreground">Original amount</label>
              <Input type="number" min="0.01" step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} placeholder="0.00" className="h-9" />
            </div>

            {isEdit && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Remaining balance</label>
                <Input type="number" min="0" step="0.01" value={remainingBalance} onChange={(e) => setRemainingBalance(e.target.value)} placeholder="0.00" className="h-9" />
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
  isOffline,
  userId,
  onClose,
  onSaved,
}: {
  debt: SupabaseDebt;
  isOffline: boolean;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const [amount, setAmount] = useState("");
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
    setSaving(true);
    try {
      if (isOffline) {
        await addDebtPayment(Number(debt.id), parsed, OFFLINE_USER_ID);
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
      const { error: updateError } = await supabase
        .from("debts")
        .update({ remaining_balance: nextRemaining, status: nextStatus })
        .eq("id", debt.id)
        .eq("user_id", userId);
      if (updateError) { setError(updateError.message); return; }
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
      <div className="theme-surface relative w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-card-foreground">
            {debt.debt_type === "i_owe" ? "Add Payment" : "Add Collection"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Remaining: {formatCurrency(remaining)}
          </p>
        </div>
        <div className="px-5 py-5">
          <label className="text-xs font-medium text-muted-foreground">Amount</label>
          <Input type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 h-10" placeholder="0.00" />
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

function DebtRow({
  debt,
  formatCurrency,
  onEdit,
  onDelete,
  onPayment,
  onPaid,
  paying,
}: {
  debt: SupabaseDebt;
  formatCurrency: (value: number | string) => string;
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
    <div className="dezu-card rounded-[1.15rem] bg-card/90 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", isOwe ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400")}>
          <Icon size={18} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-card-foreground">{debt.person_name}</h3>
            <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold leading-none", isOwe ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300")}>
              {isOwe ? "I Owe" : "Owes Me"}
            </span>
            <DebtStatusBadge status={status} />
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-lg font-bold tabular-nums text-card-foreground">{formatCurrency(debt.remaining_balance)}</p>
            <p className="text-xs text-muted-foreground">of {formatCurrency(debt.original_amount)}</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Started {formatDate(debt.borrowed_date)}</span>
            <span className={cn(status === "overdue" ? "text-rose-300" : "")}>{dueLabel(debt)}</span>
            {debt.notes && <span className="truncate sm:max-w-[260px]">{debt.notes}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {status !== "paid" && (
            <>
              <button type="button" onClick={onPayment} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                <HandCoins size={13} />
                {isOwe ? "Payment" : "Collection"}
              </button>
              <button type="button" onClick={onPaid} disabled={paying} className="theme-hover flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors disabled:pointer-events-none disabled:opacity-60">
                {paying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Paid
              </button>
            </>
          )}
          <button type="button" onClick={onEdit} className="theme-hover flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors">
            <Pencil size={13} />
            Edit
          </button>
          <button type="button" onClick={onDelete} className="flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-rose-300 transition-colors hover:bg-rose-500/10">
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<DebtFormState>({ mode: "closed" });
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
        const localDebts = await getDebts(OFFLINE_USER_ID);
        if (!isCurrent()) return;
        setDebts(localDebts.map(localDebtToSupabase));
        return;
      }
      if (!user?.id) {
        if (!isCurrent()) return;
        setDebts([]);
        return;
      }

      const overdueError = await updateOverdueCloudDebts(user.id);
      if (overdueError) setActionError(overdueError);

      const supabase = createClient();
      const { data, error } = await loggedSupabase(
        "debts",
        supabase
          .from("debts")
          .select("id,user_id,person_name,debt_type,original_amount,remaining_balance,borrowed_date,due_date,notes,status")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("due_date", { ascending: true, nullsFirst: false })
      );
      if (!isCurrent()) return;
      if (error) {
        setLoadError(error.message);
        setDebts([]);
        return;
      }
      setDebts((data ?? []) as SupabaseDebt[]);
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

  async function handleMarkPaid(debt: SupabaseDebt) {
    setPayingId(debt.id);
    setActionError("");
    try {
      if (isGuest) {
        await markDebtPaid(Number(debt.id), OFFLINE_USER_ID);
        void loadDebts(undefined, { silent: true });
        return;
      }
      if (!user?.id) { setActionError("Please sign in to update debts."); return; }
      const supabase = createClient();
      const { error } = await supabase
        .from("debts")
        .update({ remaining_balance: 0, status: "paid" })
        .eq("id", debt.id)
        .eq("user_id", user.id);
      if (error) { setActionError(error.message); return; }
      void loadDebts(undefined, { silent: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to mark debt paid.");
    } finally {
      setPayingId(null);
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
      <div className="mx-auto max-w-6xl space-y-4 px-5 py-5 sm:space-y-6 sm:py-7">
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

            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search person or notes..." className="h-9 pl-9 text-sm" />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="theme-pill-list no-scrollbar flex w-full snap-x snap-mandatory scroll-px-3 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain rounded-lg p-1.5 [-webkit-overflow-scrolling:touch] sm:w-fit sm:gap-1 sm:p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilter(tab.key)}
                    className={cn(
                      "flex min-h-10 min-w-max shrink-0 snap-start items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium leading-none transition-colors sm:min-h-8 sm:px-3 sm:py-1.5",
                      filter === tab.key ? "theme-selected" : "theme-pill"
                    )}
                  >
                    {tab.label}
                    <span className="min-w-5 rounded px-1 text-center text-[10px] font-semibold leading-4 opacity-70">{tab.count}</span>
                  </button>
                ))}
              </div>
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
              <div className="grid grid-cols-1 gap-3">
                {filteredDebts.map((debt) => (
                  <DebtRow
                    key={debt.id}
                    debt={debt}
                    formatCurrency={formatCurrency}
                    onEdit={() => setModal({ mode: "edit", debt })}
                    onDelete={() => setDeleteTarget(debt)}
                    onPayment={() => setPaymentTarget(debt)}
                    onPaid={() => handleMarkPaid(debt)}
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
          isOffline={isGuest}
          userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
          onClose={() => setModal({ mode: "closed" })}
          onSaved={() => loadDebts(undefined, { silent: true })}
        />
      )}

      {paymentTarget && (
        <PaymentModal
          debt={paymentTarget}
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
