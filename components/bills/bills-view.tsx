"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencyInputPrefix } from "@/components/ui/currency-input-prefix";
import { DetailRow, DetailRows, DetailsModalShell } from "@/components/ui/details-modal";
import { ReceiptAttachment } from "@/components/ui/receipt-attachment";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  ensureSupabaseDefaultCategories,
  type SupabaseCategory,
} from "@/lib/supabase/categories";
import { loggedSupabase, settledError } from "@/lib/supabase/query";
import {
  archiveBill,
  createBill,
  getBills,
  getCategories,
  getWallets,
  markBillPaid,
  syncRecurringMonthlyBills as syncLocalRecurringMonthlyBills,
  updateBill,
  updateOverdueLocalBills,
  type DbBill,
  type DbCategory,
  type DbWallet,
} from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import {
  EMPTY_RECEIPT,
  getReceiptMetadata,
  resolveReceiptMetadata,
  type ReceiptDraft,
} from "@/lib/receipts";

type BillStatus = "unpaid" | "paid" | "overdue" | "scheduled";
type FilterTab = "all" | "due_month" | "upcoming" | "overdue" | "paid";

type SupabaseWallet = {
  id: string;
  name: string;
  balance: number | string;
};

type SupabaseBill = {
  id: string;
  user_id: string;
  title: string;
  amount: number | string;
  due_date: string;
  category_id: string | null;
  wallet_id: string | null;
  status: BillStatus;
  notes: string | null;
  is_recurring: boolean;
  recurring_id: string | null;
  generated_occurrence_date: string | null;
  bill_id: string | null;
  receipt_url: string | null;
  receipt_path: string | null;
  receipt_file_name: string | null;
  receipt_mime_type: string | null;
  receipt_size: number | null;
};

type SupabaseRecurringRow = {
  id: string;
  user_id: string;
  wallet_id: string | null;
  category_id: string | null;
  title: string;
  amount: number | string;
  transaction_type: "income" | "expense";
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  next_run_date: string;
  is_active: boolean;
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

function localWalletToSupabase(wallet: DbWallet): SupabaseWallet {
  return { id: String(wallet.id), name: wallet.name, balance: wallet.balance };
}

function localBillToSupabase(bill: DbBill): SupabaseBill {
  return {
    id: String(bill.id),
    user_id: bill.userId,
    title: bill.title,
    amount: bill.amount,
    due_date: bill.dueDate,
    category_id: bill.categoryId != null ? String(bill.categoryId) : null,
    wallet_id: bill.walletId != null ? String(bill.walletId) : null,
    status: bill.status,
    notes: bill.notes ?? null,
    is_recurring: bill.isRecurring,
    recurring_id: bill.recurringId != null ? String(bill.recurringId) : null,
    generated_occurrence_date: bill.generatedOccurrenceDate ?? null,
    bill_id: bill.billId != null ? String(bill.billId) : String(bill.id),
    receipt_url: bill.receipt_url ?? null,
    receipt_path: bill.receipt_path ?? null,
    receipt_file_name: bill.receipt_file_name ?? null,
    receipt_mime_type: bill.receipt_mime_type ?? null,
    receipt_size: bill.receipt_size ?? null,
  };
}

type BillFormState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; bill: SupabaseBill };

const STATUS_CONFIG: Record<BillStatus, { label: string; text: string; bg: string }> = {
  unpaid:    { label: "Unpaid",    text: "text-zinc-300",    bg: "bg-zinc-700/70" },
  paid:      { label: "Paid",      text: "text-emerald-300", bg: "bg-emerald-500/10" },
  overdue:   { label: "Overdue",   text: "text-rose-300",    bg: "bg-rose-500/10" },
  scheduled: { label: "Scheduled", text: "text-sky-300",     bg: "bg-sky-500/10" },
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function toIsoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function nextMonthDate(iso: string) {
  const date = new Date(iso + "T00:00:00");
  date.setMonth(date.getMonth() + 1);
  return toIsoDate(date);
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(iso: string) {
  const now = new Date(todayIso() + "T00:00:00").getTime();
  const target = new Date(iso + "T00:00:00").getTime();
  return Math.round((target - now) / 86400000);
}

function effectiveStatus(bill: SupabaseBill): BillStatus {
  if (bill.status === "paid") return "paid";
  if (bill.due_date < todayIso()) return "overdue";
  return bill.status;
}

function dueLabel(bill: SupabaseBill) {
  const diff = daysUntil(bill.due_date);
  if (bill.status === "paid") return "Paid";
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} late`;
  if (diff === 0) return "Due today";
  if (diff <= 3) return `Due in ${diff} day${diff === 1 ? "" : "s"}`;
  return formatDate(bill.due_date);
}

function isDueThisMonth(bill: SupabaseBill) {
  const { start, end } = monthBounds();
  return bill.due_date >= start && bill.due_date <= end && bill.status !== "paid";
}

function isUpcoming(bill: SupabaseBill) {
  const today = todayIso();
  const end = new Date();
  end.setDate(end.getDate() + 30);
  return bill.status !== "paid" && bill.due_date >= today && bill.due_date <= toIsoDate(end);
}

function normalizeGeneratedStatus(dueDate: string): BillStatus {
  return dueDate > todayIso() ? "scheduled" : "unpaid";
}

function isDuplicateBillError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "23505" ||
    error.message?.includes("bills_user_recurring_due_active_uidx") ||
    error.message?.toLowerCase().includes("duplicate key")
  );
}

function friendlyBillError(error: { code?: string; message?: string } | null | undefined) {
  if (isDuplicateBillError(error)) return "Bill already exists for this due date.";
  return error?.message ?? "";
}

async function syncRecurringMonthlyBills(userId: string) {
  const supabase = createClient();
  const { end } = monthBounds();

  const { data: recurringRows, error: recurringError } = await loggedSupabase(
    "recurring bills source",
    supabase
      .from("recurring_transactions")
      .select("id,user_id,wallet_id,category_id,title,amount,transaction_type,frequency,next_run_date,is_active")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .eq("is_active", true)
      .eq("transaction_type", "expense")
      .eq("frequency", "monthly")
      .lte("next_run_date", end)
  );

  if (recurringError) return recurringError.message;

  const recurring = (recurringRows ?? []) as SupabaseRecurringRow[];
  if (recurring.length === 0) return "";

  const { data: existingRows, error: existingError } = await loggedSupabase(
    "existing recurring bills",
    supabase
      .from("bills")
      .select("recurring_id,generated_occurrence_date,due_date")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .not("recurring_id", "is", null)
  );

  if (existingError) return existingError.message;

  const existing = new Set(
    ((existingRows ?? []) as Pick<SupabaseBill, "recurring_id" | "generated_occurrence_date" | "due_date">[])
      .map((bill) => `${bill.recurring_id}:${bill.generated_occurrence_date ?? bill.due_date}`)
  );
  const queued = new Set<string>();

  const generated = recurring.flatMap((item) => {
    const rows: Array<{
      user_id: string;
      title: string;
      amount: number;
      due_date: string;
      category_id: string | null;
      wallet_id: string | null;
      status: BillStatus;
      notes: string;
      is_recurring: boolean;
      recurring_id: string;
      generated_occurrence_date: string;
    }> = [];

    let dueDate = item.next_run_date;
    let guard = 0;
    while (dueDate <= end && guard < 12) {
      const key = `${item.id}:${dueDate}`;
      if (!existing.has(key) && !queued.has(key)) {
        queued.add(key);
        rows.push({
          user_id: userId,
          title: item.title,
          amount: Number(item.amount),
          due_date: dueDate,
          category_id: item.category_id,
          wallet_id: item.wallet_id,
          status: normalizeGeneratedStatus(dueDate),
          notes: "Generated from recurring transaction",
          is_recurring: true,
          recurring_id: item.id,
          generated_occurrence_date: dueDate,
        });
      }
      dueDate = nextMonthDate(dueDate);
      guard += 1;
    }

    return rows;
  });

  if (generated.length === 0) return "";

  const { error: insertError } = await loggedSupabase(
    "generated bills insert",
    supabase.from("bills").insert(generated)
  );

  if (isDuplicateBillError(insertError)) {
    return "";
  }

  return friendlyBillError(insertError);
}

async function updateOverdueBills(userId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("bills")
    .update({ status: "overdue" })
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .in("status", ["unpaid", "scheduled"])
    .lt("due_date", todayIso());

  return error?.message ?? "";
}

function StatusBadge({ status }: { status: BillStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold leading-none", config.bg, config.text)}>
      {config.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  className,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof ReceiptText;
  tone: "emerald" | "rose" | "amber" | "sky";
  className?: string;
}) {
  const toneClass = {
    emerald: "text-emerald-400 bg-emerald-500/10",
    rose: "text-rose-400 bg-rose-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    sky: "text-sky-400 bg-sky-500/10",
  }[tone];

  return (
    <div className={cn("dezu-card rounded-[1.15rem] bg-card/90 p-2.5 sm:p-4", className)}>
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-zinc-500 sm:text-xs">{label}</p>
          <p className="mt-0.5 truncate text-xs font-bold tabular-nums text-zinc-50 min-[380px]:text-sm sm:mt-1 sm:text-lg">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500 sm:mt-1 sm:text-xs">{sub}</p>
        </div>
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl", toneClass)}>
          <Icon size={14} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

function BillModal({
  state,
  categories,
  wallets,
  userId,
  isOffline,
  onClose,
  onSaved,
}: {
  state: Exclude<BillFormState, { mode: "closed" }>;
  categories: SupabaseCategory[];
  wallets: SupabaseWallet[];
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === "edit";
  const initialBill = isEdit ? state.bill : null;
  const [title, setTitle] = useState(initialBill?.title ?? "");
  const [amount, setAmount] = useState(initialBill ? String(initialBill.amount) : "");
  const [dueDate, setDueDate] = useState(initialBill?.due_date ?? todayIso());
  const [categoryId, setCategoryId] = useState(initialBill?.category_id ?? "");
  const [walletId, setWalletId] = useState(initialBill?.wallet_id ?? "");
  const [status, setStatus] = useState<BillStatus>(initialBill?.status ?? "unpaid");
  const [notes, setNotes] = useState(initialBill?.notes ?? "");
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft>({ file: null, remove: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const parsedAmount = Number(amount);
    setError("");

    if (!title.trim()) { setError("Title is required."); return; }
    if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!dueDate) { setError("Due date is required."); return; }
    if (!categoryId) { setError("Select a category."); return; }
    if (!walletId) { setError("Select a wallet."); return; }

    setSaving(true);
    try {
      if (!isOffline && !userId) { setError("Please sign in to save bills."); return; }
      const receipt = await resolveReceiptMetadata({
        current: initialBill ? getReceiptMetadata(initialBill) : EMPTY_RECEIPT,
        draft: receiptDraft,
        isOffline,
        userId: isOffline ? OFFLINE_USER_ID : userId ?? "",
        scope: "bills",
      });

      if (isOffline) {
        const payload = {
          userId: OFFLINE_USER_ID,
          title: title.trim(),
          amount: parsedAmount,
          dueDate,
          categoryId: Number(categoryId),
          walletId: Number(walletId),
          status,
          notes: notes.trim() || undefined,
          isRecurring: isEdit ? state.bill.is_recurring : false,
          recurringId: isEdit && state.bill.recurring_id ? Number(state.bill.recurring_id) : null,
          generatedOccurrenceDate: isEdit ? state.bill.generated_occurrence_date ?? state.bill.due_date : null,
          billId: isEdit ? Number(state.bill.bill_id ?? state.bill.id) : null,
          ...receipt,
          isDeleted: false,
        };
        if (isEdit) {
          await updateBill(Number(state.bill.id), payload);
        } else {
          await createBill(payload);
        }
        onSaved();
        onClose();
        return;
      }

      const supabase = createClient();
      const payload = {
        user_id: userId,
        title: title.trim(),
        amount: parsedAmount,
        due_date: dueDate,
        category_id: categoryId,
        wallet_id: walletId,
        status,
        notes: notes.trim() || null,
        is_recurring: isEdit ? state.bill.is_recurring : false,
        recurring_id: isEdit ? state.bill.recurring_id : null,
        generated_occurrence_date: isEdit ? state.bill.generated_occurrence_date ?? state.bill.due_date : null,
        ...receipt,
      };

      const result = isEdit
        ? await supabase
            .from("bills")
            .update(payload)
            .eq("id", state.bill.id)
            .eq("user_id", userId)
        : await supabase.from("bills").insert(payload);

      if (result.error) {
        setError(result.error.message);
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-lg sm:rounded-2xl">
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-50">{isEdit ? "Edit Bill" : "New Bill"}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            <X size={15} />
          </button>
        </div>

        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-400">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Internet bill" className="h-9 border-zinc-700 bg-zinc-800" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Amount</label>
              <div className="relative">
                <CurrencyInputPrefix />
                <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-9 border-zinc-700 bg-zinc-800 pl-10" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Due Date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 border-zinc-700 bg-zinc-800 [color-scheme:dark]" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                <option value="">Select category</option>
                {categories.filter((category) => category.type === "expense").map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Wallet</label>
              <select value={walletId} onChange={(e) => setWalletId(e.target.value)} className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                <option value="">Select wallet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-400">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as BillStatus)} disabled={isEdit && state.bill.status === "paid"} className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60">
                <option value="unpaid">Unpaid</option>
                <option value="scheduled">Scheduled</option>
                <option value="overdue">Overdue</option>
                {isEdit && state.bill.status === "paid" && <option value="paid">Paid</option>}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-400">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>

            <div className="sm:col-span-2">
              <ReceiptAttachment
                value={initialBill}
                draft={receiptDraft}
                onDraftChange={setReceiptDraft}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</p>
          )}
        </div>

        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:pointer-events-none disabled:opacity-60">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Bill"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillRow({
  bill,
  category,
  wallet,
  onOpen,
  onEdit,
  onDelete,
  onPaid,
  paying,
  formatCurrency,
}: {
  bill: SupabaseBill;
  category?: SupabaseCategory;
  wallet?: SupabaseWallet;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPaid: () => void;
  paying: boolean;
  formatCurrency: (value: number | string) => string;
}) {
  const status = effectiveStatus(bill);
  const dueSoon = bill.status !== "paid" && daysUntil(bill.due_date) >= 0 && daysUntil(bill.due_date) <= 3;
  const statusLabel = STATUS_CONFIG[status].label;

  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }} className="dezu-card rounded-xl bg-card/90 p-2.5 transition-colors hover:ring-1 hover:ring-[var(--theme-primary)]/30 sm:rounded-[1.15rem] sm:p-4">
      <div className="flex gap-2.5 sm:gap-3 sm:flex-row sm:items-start">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 sm:h-10 sm:w-10">
          <ReceiptText size={17} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-100">{bill.title}</h3>
            <span className="hidden sm:inline-flex"><StatusBadge status={status} /></span>
            {bill.is_recurring && (
              <span className="hidden rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-semibold leading-none text-violet-300 sm:inline-flex">Recurring</span>
            )}
            {dueSoon && (
              <span className="hidden rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold leading-none text-amber-300 sm:inline-flex">Due soon</span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold tabular-nums text-zinc-50 sm:text-lg">
            {formatCurrency(bill.amount)}
            <span className={cn("font-medium", status === "overdue" ? "text-rose-300" : status === "paid" ? "text-emerald-300" : "text-zinc-500")}> · {statusLabel}</span>
          </p>
          <div className="mt-2 hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 sm:flex">
            <span className={cn("flex items-center gap-1", status === "overdue" ? "text-rose-300" : dueSoon ? "text-amber-300" : "")}>
              <Calendar size={12} />
              {dueLabel(bill)}
            </span>
            <span>{category?.name ?? "No category"}</span>
            <span className="flex items-center gap-1">
              <Wallet size={12} />
              {wallet?.name ?? "No wallet"}
            </span>
            {bill.notes && <span className="truncate sm:max-w-[220px]">{bill.notes}</span>}
          </div>
          {bill.receipt_url && (
            <div className="mt-3 hidden max-w-sm sm:block">
              <ReceiptAttachment value={bill} draft={{ file: null, remove: false }} onDraftChange={() => {}} readOnly compact />
            </div>
          )}
        </div>

        <div className="hidden shrink-0 flex-wrap items-center gap-2 sm:flex sm:justify-end">
          {bill.status !== "paid" && (
            <button onClick={(event) => { event.stopPropagation(); onPaid(); }} disabled={paying} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:pointer-events-none disabled:opacity-60">
              {paying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Mark paid
            </button>
          )}
          <button onClick={(event) => { event.stopPropagation(); onEdit(); }} className="theme-hover flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 py-2 text-xs font-medium text-muted-foreground transition-colors">
            <Pencil size={13} />
            Edit
          </button>
          <button onClick={(event) => { event.stopPropagation(); onDelete(); }} className="flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-rose-300 transition-colors hover:bg-rose-500/10">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkPaidModal({
  bill,
  paying,
  error,
  onClose,
  onConfirm,
}: {
  bill: SupabaseBill | null;
  paying: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (draft: ReceiptDraft) => void;
}) {
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft>({ file: null, remove: false });

  useEffect(() => {
    if (bill) setReceiptDraft({ file: null, remove: false });
  }, [bill]);

  if (!bill) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={paying ? undefined : onClose} />
      <div className="theme-surface relative w-full rounded-t-2xl shadow-2xl ring-1 ring-border sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Mark bill as paid</p>
            <h2 className="truncate text-base font-semibold text-card-foreground">{bill.title}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={paying} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <ReceiptAttachment value={bill} draft={receiptDraft} onDraftChange={setReceiptDraft} />
          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} disabled={paying} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(receiptDraft)} disabled={paying} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:pointer-events-none disabled:opacity-60">
            {paying && <Loader2 size={13} className="animate-spin" />}
            Mark paid
          </button>
        </div>
      </div>
    </div>
  );
}

function BillDetailsModal({
  bill,
  category,
  wallet,
  onClose,
  onEdit,
  onDelete,
  onPaid,
  paying,
}: {
  bill: SupabaseBill | null;
  category?: SupabaseCategory;
  wallet?: SupabaseWallet;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPaid: () => void;
  paying: boolean;
}) {
  const { formatCurrency } = useCurrency();
  if (!bill) return null;
  const status = effectiveStatus(bill);
  const notes = (bill.notes ?? "").trim();

  return (
    <DetailsModalShell
      open={Boolean(bill)}
      eyebrow="Bill Details"
      title={bill.title}
      onClose={onClose}
      footer={
        <>
          {bill.status !== "paid" && (
            <button onClick={onPaid} disabled={paying} className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:pointer-events-none disabled:opacity-60">
              {paying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Mark Paid
            </button>
          )}
          <button onClick={onEdit} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            <Pencil size={14} />
            Edit Bill
          </button>
          <button onClick={onDelete} className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-rose-400 transition-colors hover:bg-rose-500/10">
            <Trash2 size={14} />
            Delete Bill
          </button>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            Close
          </button>
        </>
      }
    >
      <DetailRows>
        <DetailRow label="Amount" value={formatCurrency(bill.amount)} accent="font-bold tabular-nums" />
        <DetailRow label="Status" value={STATUS_CONFIG[status].label} />
        <DetailRow label="Due Date" value={formatDate(bill.due_date)} />
        <DetailRow label="Wallet" value={wallet?.name ?? "No wallet"} />
        <DetailRow label="Category" value={category?.name ?? "No category"} />
        <DetailRow label="Type" value={bill.is_recurring ? "Recurring bill" : "Bill"} />
        <DetailRow label="Notes" value={notes || "No notes added"} multiline />
      </DetailRows>
      {bill.receipt_url && (
        <div className="mt-3">
          <ReceiptAttachment value={bill} draft={{ file: null, remove: false }} onDraftChange={() => {}} readOnly compact />
        </div>
      )}
    </DetailsModalShell>
  );
}

function BillsFilterModal({
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

export function BillsView() {
  const { formatCurrency } = useCurrency();
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const [bills, setBills] = useState<SupabaseBill[]>([]);
  const [categories, setCategories] = useState<SupabaseCategory[]>([]);
  const [wallets, setWallets] = useState<SupabaseWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [modal, setModal] = useState<BillFormState>({ mode: "closed" });
  const [detailsTarget, setDetailsTarget] = useState<SupabaseBill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupabaseBill | null>(null);
  const [payTarget, setPayTarget] = useState<SupabaseBill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  const loadBills = useCallback(async (
    isMounted?: () => boolean,
    options?: { silent?: boolean }
  ) => {
    const requestId = ++loadRequestId.current;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setLoadError("");
    setActionError("");
    const isCurrent = () => requestId === loadRequestId.current && (!isMounted || isMounted());

    try {
      if (authLoading || isLoggingOut) return;
      if (isGuest) {
        await syncLocalRecurringMonthlyBills(OFFLINE_USER_ID);
        await updateOverdueLocalBills(OFFLINE_USER_ID);
        const [localBills, localCategories, localWallets] = await Promise.all([
          getBills(OFFLINE_USER_ID),
          getCategories(OFFLINE_USER_ID),
          getWallets(OFFLINE_USER_ID),
        ]);
        if (!isCurrent()) return;
        setBills(localBills.map(localBillToSupabase));
        setCategories(localCategories.map(localCategoryToSupabase));
        setWallets(localWallets.map(localWalletToSupabase));
        return;
      }

      if (!user?.id) {
        if (!isCurrent()) return;
        setBills([]);
        setCategories([]);
        setWallets([]);
        return;
      }

      const syncError = await syncRecurringMonthlyBills(user.id);
      const overdueError = await updateOverdueBills(user.id);
      if (syncError || overdueError) {
        setActionError([syncError, overdueError].filter(Boolean).join(" | "));
      }

      const supabase = createClient();
      const [billSettled, categorySettled, walletSettled] = await Promise.allSettled([
        loggedSupabase(
          "bills",
          supabase
            .from("bills")
            .select("id,user_id,title,amount,due_date,category_id,wallet_id,status,notes,is_recurring,recurring_id,generated_occurrence_date,bill_id,receipt_url,receipt_path,receipt_file_name,receipt_mime_type,receipt_size")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .order("due_date", { ascending: true })
        ),
        ensureSupabaseDefaultCategories(user.id),
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

      const errors = [billSettled, categorySettled, walletSettled].map(settledError).filter(Boolean);
      if (errors.length > 0) setLoadError(errors.join(" | "));

      const billResult = billSettled.status === "fulfilled" ? billSettled.value : { data: [] };
      const categoryResult = categorySettled.status === "fulfilled" ? categorySettled.value : [];
      const walletResult = walletSettled.status === "fulfilled" ? walletSettled.value : { data: [] };

      setBills((billResult.data ?? []) as SupabaseBill[]);
      setCategories(categoryResult);
      setWallets((walletResult.data ?? []) as SupabaseWallet[]);
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load bills.");
      setBills([]);
      setCategories([]);
      setWallets([]);
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, user]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      loadBills(() => mounted);
    });
    return () => {
      mounted = false;
    };
  }, [loadBills]);

  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const walletMap = useMemo(() => new Map(wallets.map((item) => [item.id, item])), [wallets]);

  const counts = useMemo(() => {
    const active = bills.filter((bill) => bill.status !== "paid");
    const overdue = active.filter((bill) => effectiveStatus(bill) === "overdue");
    const dueMonth = active.filter(isDueThisMonth);
    const upcoming = active.filter(isUpcoming);
    const paid = bills.filter((bill) => bill.status === "paid");
    return {
      all: bills.length,
      active: active.length,
      overdue: overdue.length,
      dueMonth: dueMonth.length,
      upcoming: upcoming.length,
      paid: paid.length,
      dueAmount: dueMonth.reduce((sum, bill) => sum + Number(bill.amount), 0),
      overdueAmount: overdue.reduce((sum, bill) => sum + Number(bill.amount), 0),
      upcomingAmount: upcoming.reduce((sum, bill) => sum + Number(bill.amount), 0),
      remainingAmount: active.reduce((sum, bill) => sum + Number(bill.amount), 0),
    };
  }, [bills]);

  const filteredBills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills.filter((bill) => {
      const status = effectiveStatus(bill);
      if (filter === "due_month" && !isDueThisMonth(bill)) return false;
      if (filter === "upcoming" && !isUpcoming(bill)) return false;
      if (filter === "overdue" && status !== "overdue") return false;
      if (filter === "paid" && bill.status !== "paid") return false;
      if (q) {
        const category = bill.category_id ? categoryMap.get(bill.category_id)?.name ?? "" : "";
        const wallet = bill.wallet_id ? walletMap.get(bill.wallet_id)?.name ?? "" : "";
        return [bill.title, bill.notes ?? "", category, wallet].some((value) =>
          value.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [bills, categoryMap, filter, search, walletMap]);

  async function handleDeleteBill() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (isGuest) {
        await archiveBill(Number(deleteTarget.id));
        setBills((current) => current.filter((bill) => bill.id !== deleteTarget.id));
        setDeleteTarget(null);
        void loadBills(undefined, { silent: true });
        return;
      }

      if (!user?.id) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("bills")
        .update({ is_deleted: true })
        .eq("id", deleteTarget.id)
        .eq("user_id", user.id);

      if (error) {
        setDeleteError(error.message);
        return;
      }

      setBills((current) => current.filter((bill) => bill.id !== deleteTarget.id));
      setDeleteTarget(null);
      void loadBills(undefined, { silent: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete bill.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleMarkPaid(bill: SupabaseBill, receiptDraft: ReceiptDraft = { file: null, remove: false }) {
    setActionError("");
    setPayingId(bill.id);
    try {
      if (isGuest) {
        await markBillPaid(Number(bill.id), OFFLINE_USER_ID);
        const receipt = await resolveReceiptMetadata({
          current: getReceiptMetadata(bill),
          draft: receiptDraft,
          isOffline: true,
          userId: OFFLINE_USER_ID,
          scope: "bills",
        });
        await updateBill(Number(bill.id), receipt);
        setBills((current) =>
          current.map((item) => item.id === bill.id ? { ...item, status: "paid", ...receipt } : item)
        );
        setPayTarget(null);
        void loadBills(undefined, { silent: true });
        return;
      }

      if (!user?.id) { setActionError("Please sign in to pay a bill."); return; }
      if (!bill.wallet_id) { setActionError("Select a wallet before marking this bill as paid."); return; }
      if (!bill.category_id) { setActionError("Select a category before marking this bill as paid."); return; }

      const supabase = createClient();
      const { data: currentBill, error: billReadError } = await supabase
        .from("bills")
        .select("id,status,amount,title,due_date,wallet_id,category_id,receipt_url,receipt_path,receipt_file_name,receipt_mime_type,receipt_size")
        .eq("id", bill.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (billReadError) { setActionError(billReadError.message); return; }
      if (!currentBill) { setActionError("Bill was not found."); return; }
      if (currentBill.status === "paid") { void loadBills(undefined, { silent: true }); return; }

      const { data: walletRow, error: walletReadError } = await supabase
        .from("wallets")
        .select("balance")
        .eq("id", bill.wallet_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (walletReadError) { setActionError(walletReadError.message); return; }
      if (!walletRow) { setActionError("Selected wallet was not found."); return; }

      const amount = Number(currentBill.amount);
      const previousBalance = Number(walletRow.balance ?? 0);
      const { error: walletUpdateError } = await supabase
        .from("wallets")
        .update({ balance: previousBalance - amount })
        .eq("id", bill.wallet_id)
        .eq("user_id", user.id);

      if (walletUpdateError) { setActionError(walletUpdateError.message); return; }

      const { error: transactionError } = await supabase.from("transactions").insert({
        user_id: user.id,
        wallet_id: bill.wallet_id,
        category_id: bill.category_id,
        amount,
        transaction_type: "expense",
        description: `Bill payment: ${bill.title}`,
        transaction_date: todayIso(),
      });

      if (transactionError) {
        await supabase
          .from("wallets")
          .update({ balance: previousBalance })
          .eq("id", bill.wallet_id)
          .eq("user_id", user.id);
        setActionError(transactionError.message);
        return;
      }

      const receipt = await resolveReceiptMetadata({
        current: getReceiptMetadata(bill),
        draft: receiptDraft,
        isOffline: false,
        userId: user.id,
        scope: "bills",
      });

      const { error: billUpdateError } = await supabase
        .from("bills")
        .update({ status: "paid", ...receipt })
        .eq("id", bill.id)
        .eq("user_id", user.id);

      if (billUpdateError) {
        setActionError(billUpdateError.message);
        return;
      }

      setBills((current) =>
        current.map((item) => item.id === bill.id ? { ...item, status: "paid", ...receipt } : item)
      );
      setPayTarget(null);
      void loadBills(undefined, { silent: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to mark bill as paid.");
    } finally {
      setPayingId(null);
    }
  }

  const tabs: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "due_month", label: "This Month", count: counts.dueMonth },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "overdue", label: "Overdue", count: counts.overdue },
    { key: "paid", label: "Paid", count: counts.paid },
  ];

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:space-y-6 sm:px-5 sm:py-7">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight text-zinc-50">Bills</h1>
            <p className="mt-0.5 truncate text-sm text-zinc-500">
              {loading ? "Loading..." : `${counts.active} active bills, ${counts.paid} paid`}
            </p>
          </div>
          <button aria-label="Add Bill" onClick={() => setModal({ mode: "add" })} className="flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 sm:h-auto sm:px-4 sm:py-2 sm:text-sm">
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden min-[390px]:inline sm:inline">Add Bill</span>
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
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
              <SummaryCard label="Due This Month" value={formatCurrency(counts.dueAmount)} sub={`${counts.dueMonth} bill${counts.dueMonth === 1 ? "" : "s"}`} icon={Calendar} tone="sky" />
              <SummaryCard label="Upcoming" value={formatCurrency(counts.upcomingAmount)} sub="Next 30 days" icon={Clock3} tone="amber" />
              <SummaryCard label="Overdue" value={formatCurrency(counts.overdueAmount)} sub={`${counts.overdue} needs attention`} icon={AlertTriangle} tone="rose" />
              <SummaryCard label="Paid" value={`${counts.paid}`} sub="Completed bills" icon={CheckCircle2} tone="emerald" />
              <SummaryCard label="Remaining" value={formatCurrency(counts.remainingAmount)} sub="Unpaid bills" icon={ReceiptText} tone="sky" className="col-span-2 lg:col-span-1" />
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bills, categories, wallets..." className="h-9 border-zinc-700 bg-zinc-900 pl-9 text-sm" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
                title="Filters"
                aria-label="Open bill filters"
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>

            {filteredBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800">
                  <ReceiptText size={28} className="text-zinc-500" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-300">No bills found</p>
                  <p className="mt-1 max-w-sm text-xs text-zinc-500">
                    Add bills or set up monthly expense recurring transactions to generate bills automatically.
                  </p>
                </div>
                <button onClick={() => setModal({ mode: "add" })} className="theme-hover flex items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-4 py-2 text-sm font-medium text-foreground ring-1 ring-border transition-colors">
                  <Plus size={14} strokeWidth={2.5} />
                  Add your first bill
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
                {filteredBills.map((bill) => (
                  <BillRow
                    key={bill.id}
                    bill={bill}
                    category={bill.category_id ? categoryMap.get(bill.category_id) : undefined}
                    wallet={bill.wallet_id ? walletMap.get(bill.wallet_id) : undefined}
                    onOpen={() => setDetailsTarget(bill)}
                    onEdit={() => setModal({ mode: "edit", bill })}
                    onDelete={() => setDeleteTarget(bill)}
                    onPaid={() => setPayTarget(bill)}
                    paying={payingId === bill.id}
                    formatCurrency={formatCurrency}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {modal.mode !== "closed" && (
        <BillModal
          key={modal.mode === "edit" ? modal.bill.id : "add"}
          state={modal}
          categories={categories}
          wallets={wallets}
          userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
          isOffline={isGuest}
          onClose={() => setModal({ mode: "closed" })}
          onSaved={() => loadBills(undefined, { silent: true })}
        />
      )}

      <BillsFilterModal
        open={filterOpen}
        tabs={tabs}
        value={filter}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />

      <BillDetailsModal
        bill={detailsTarget}
        category={detailsTarget?.category_id ? categoryMap.get(detailsTarget.category_id) : undefined}
        wallet={detailsTarget?.wallet_id ? walletMap.get(detailsTarget.wallet_id) : undefined}
        onClose={() => setDetailsTarget(null)}
        onEdit={() => {
          if (!detailsTarget) return;
          setModal({ mode: "edit", bill: detailsTarget });
          setDetailsTarget(null);
        }}
        onDelete={() => {
          if (!detailsTarget) return;
          setDeleteTarget(detailsTarget);
          setDetailsTarget(null);
        }}
        onPaid={() => {
          if (!detailsTarget) return;
          setPayTarget(detailsTarget);
          setDetailsTarget(null);
        }}
        paying={payingId === detailsTarget?.id}
      />

      <MarkPaidModal
        bill={payTarget}
        paying={payingId === payTarget?.id}
        error={actionError}
        onClose={() => {
          if (!payingId) {
            setActionError("");
            setPayTarget(null);
          }
        }}
        onConfirm={(draft) => {
          if (payTarget) void handleMarkPaid(payTarget, draft);
        }}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="theme-surface relative w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border">
            <div className="flex flex-col gap-3 px-5 py-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
                <Trash2 size={24} strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-50">Delete bill?</h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  {deleteTarget.title} will be hidden from your bill list. Existing paid transactions are not changed.
                </p>
              </div>
              {deleteError && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{deleteError}</p>}
            </div>
            <div className="flex items-center gap-2 border-t border-zinc-800 px-5 py-4">
              <button onClick={() => setDeleteTarget(null)} className="theme-hover flex-1 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors">Cancel</button>
              <button onClick={handleDeleteBill} disabled={deleting} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-500 py-2 text-sm font-semibold text-[var(--theme-danger-foreground)] transition-colors hover:bg-rose-400 disabled:pointer-events-none disabled:opacity-60">
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
