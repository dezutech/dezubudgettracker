"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  ReceiptText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loggedSupabase, settledError } from "@/lib/supabase/query";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import { useDashboardData as useLocalDashboardData } from "@/lib/db/hooks";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { cn } from "@/lib/utils";
import { StatCards } from "./stat-cards";
import { ExpenseChart } from "./expense-chart";
import { WalletOverview } from "./wallet-overview";
import { RecentTransactions, type DashboardRecentTx } from "./recent-transactions";
import { TopCategories, type DashboardTopCategory } from "./top-categories";

function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [year, mo] = month.split("-").map(Number);
  return new Date(year, mo - 1).toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });
}

function shiftMonth(month: string, delta: number): string {
  const [year, mo] = month.split("-").map(Number);
  const d = new Date(year, mo - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const EMPTY: {
  netWorth: number; monthIncome: number; monthExpenses: number;
  netSavings: number; savingsRate: number;
  incomeTrend: number; expensesTrend: number; savingsTrend: number;
  chartData: Array<{ month: string; income: number; expenses: number }>;
  topCategories: DashboardTopCategory[];
  recentTransactions: DashboardRecentTx[];
  bills: DashboardBill[];
  billSummary: DashboardBillSummary;
  wallets: Array<{ id: string | number; name: string; type: string; balance: number; color: string | null; logo_url: string | null }>;
} = {
  netWorth: 0, monthIncome: 0, monthExpenses: 0,
  netSavings: 0, savingsRate: 0,
  incomeTrend: 0, expensesTrend: 0, savingsTrend: 0,
  chartData: [], topCategories: [], recentTransactions: [], wallets: [],
  bills: [],
  billSummary: {
    dueThisMonthCount: 0,
    dueThisMonthAmount: 0,
    upcomingCount: 0,
    upcomingAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    paidThisMonthCount: 0,
    paidThisMonthAmount: 0,
    remainingAmount: 0,
  },
};

type SupabaseWallet = {
  id: string;
  name: string;
  type: string;
  balance: number | string;
  color: string | null;
  logo_url: string | null;
};

type SupabaseCategory = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

type SupabaseTransaction = {
  id: string;
  wallet_id: string;
  destination_wallet_id: string | null;
  category_id: string | null;
  amount: number | string;
  transaction_type: "income" | "expense" | "transfer";
  description: string | null;
  transaction_date: string;
};

type SupabaseBudget = {
  id: string;
  category_id: string;
  amount: number | string;
  month: string;
};

type SupabaseGoal = {
  id: string;
  target_amount: number | string;
  current_amount: number | string;
  status: string;
};

type BillStatus = "unpaid" | "paid" | "overdue" | "scheduled";

type SupabaseBill = {
  id: string;
  title: string;
  amount: number | string;
  due_date: string;
  status: BillStatus;
  is_recurring: boolean;
  recurring_id: string | null;
};

type SupabaseRecurringRow = {
  id: string;
  wallet_id: string | null;
  category_id: string | null;
  title: string;
  amount: number | string;
  transaction_type: "income" | "expense";
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  next_run_date: string;
};

type DashboardBill = {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  isRecurring: boolean;
};

type DashboardBillSummary = {
  dueThisMonthCount: number;
  dueThisMonthAmount: number;
  upcomingCount: number;
  upcomingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  paidThisMonthCount: number;
  paidThisMonthAmount: number;
  remainingAmount: number;
};

function monthRange(month: string) {
  const [year, mo] = month.split("-").map(Number);
  const lastDay = new Date(year, mo, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function addMonths(month: string, delta: number): string {
  const [year, mo] = month.split("-").map(Number);
  const d = new Date(year, mo - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shortMonthLabel(month: string): string {
  const [year, mo] = month.split("-").map(Number);
  return new Date(year, mo - 1).toLocaleDateString("en-US", { month: "short" });
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
}

function amount(tx: SupabaseTransaction) {
  return Number(tx.amount);
}

function sumByType(txs: SupabaseTransaction[], type: "income" | "expense") {
  return txs.filter((tx) => tx.transaction_type === type).reduce((sum, tx) => sum + amount(tx), 0);
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function toIsoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function nextMonthDate(iso: string) {
  const date = new Date(iso + "T00:00:00");
  date.setMonth(date.getMonth() + 1);
  return toIsoDate(date);
}

function daysUntil(iso: string) {
  const now = new Date(todayIso() + "T00:00:00").getTime();
  const target = new Date(iso + "T00:00:00").getTime();
  return Math.round((target - now) / 86400000);
}

function effectiveBillStatus(bill: SupabaseBill | DashboardBill): BillStatus {
  const dueDate = "due_date" in bill ? bill.due_date : bill.dueDate;
  if (bill.status === "paid") return "paid";
  if (dueDate < todayIso()) return "overdue";
  return bill.status;
}

function shortDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function dueBadgeLabel(bill: DashboardBill) {
  if (bill.status === "paid") return "Paid";
  const diff = daysUntil(bill.dueDate);
  if (diff < 0) return `${Math.abs(diff)}d late`;
  if (diff === 0) return "Today";
  if (diff <= 3) return `${diff}d left`;
  return shortDate(bill.dueDate);
}

function isDuplicateBillError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "23505" ||
    error.message?.includes("bills_user_recurring_due_active_uidx") ||
    error.message?.toLowerCase().includes("duplicate key")
  );
}

async function syncRecurringMonthlyBillsForDashboard(userId: string, month: string) {
  const supabase = createClient();
  const { end } = monthRange(month);

  const { data: recurringRows, error: recurringError } = await loggedSupabase(
    "dashboard recurring bills source",
    supabase
      .from("recurring_transactions")
      .select("id,wallet_id,category_id,title,amount,transaction_type,frequency,next_run_date")
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
    "dashboard existing recurring bills",
    supabase
      .from("bills")
      .select("recurring_id,due_date")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .not("recurring_id", "is", null)
  );

  if (existingError) return existingError.message;

  const existing = new Set(
    ((existingRows ?? []) as Array<{ recurring_id: string | null; due_date: string }>)
      .map((bill) => `${bill.recurring_id}:${bill.due_date}`)
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
          status: dueDate > todayIso() ? "scheduled" : "unpaid",
          notes: "Generated from recurring transaction",
          is_recurring: true,
          recurring_id: item.id,
        });
      }
      dueDate = nextMonthDate(dueDate);
      guard += 1;
    }

    return rows;
  });

  if (generated.length === 0) return "";

  const { error: insertError } = await loggedSupabase(
    "dashboard generated bills insert",
    supabase.from("bills").insert(generated)
  );

  if (isDuplicateBillError(insertError)) return "";
  return insertError?.message ?? "";
}

function summarizeBills(bills: SupabaseBill[], month: string): {
  summary: DashboardBillSummary;
  visibleBills: DashboardBill[];
} {
  const { start, end } = monthRange(month);
  const today = todayIso();
  const upcomingEndDate = new Date(today + "T00:00:00");
  upcomingEndDate.setDate(upcomingEndDate.getDate() + 30);
  const upcomingEnd = toIsoDate(upcomingEndDate);

  const normalized = bills.map((bill) => ({
    id: bill.id,
    title: bill.title,
    amount: Number(bill.amount),
    dueDate: bill.due_date,
    status: effectiveBillStatus(bill),
    isRecurring: bill.is_recurring,
  }));

  const active = normalized.filter((bill) => bill.status !== "paid");
  const dueThisMonth = active.filter((bill) => bill.dueDate >= start && bill.dueDate <= end);
  const upcoming = active.filter((bill) => bill.dueDate >= today && bill.dueDate <= upcomingEnd);
  const overdue = active.filter((bill) => bill.status === "overdue");
  const paidThisMonth = normalized.filter((bill) => bill.status === "paid" && bill.dueDate >= start && bill.dueDate <= end);

  return {
    summary: {
      dueThisMonthCount: dueThisMonth.length,
      dueThisMonthAmount: dueThisMonth.reduce((sum, bill) => sum + bill.amount, 0),
      upcomingCount: upcoming.length,
      upcomingAmount: upcoming.reduce((sum, bill) => sum + bill.amount, 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, bill) => sum + bill.amount, 0),
      paidThisMonthCount: paidThisMonth.length,
      paidThisMonthAmount: paidThisMonth.reduce((sum, bill) => sum + bill.amount, 0),
      remainingAmount: active.reduce((sum, bill) => sum + bill.amount, 0),
    },
    visibleBills: [...overdue, ...upcoming]
      .filter((bill, index, all) => all.findIndex((item) => item.id === bill.id) === index)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5),
  };
}

function BillingSummaryCard({
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
  tone: "sky" | "amber" | "rose" | "emerald" | "zinc";
  className?: string;
}) {
  const toneClass = {
    sky: "bg-sky-500/10 text-sky-400",
    amber: "bg-amber-500/10 text-amber-400",
    rose: "bg-rose-500/10 text-rose-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    zinc: "bg-zinc-800 text-zinc-300",
  }[tone];

  return (
    <div className={cn("dezu-card rounded-[1.15rem] bg-card/90 p-2.5 sm:p-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-xs font-bold tabular-nums text-card-foreground min-[380px]:text-sm sm:mt-1">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
        </div>
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8", toneClass)}>
          <Icon size={14} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

function DashboardBillsWidget({
  summary,
  bills,
}: {
  summary: DashboardBillSummary;
  bills: DashboardBill[];
}) {
  const { formatCurrency } = useCurrency();

  return (
    <div className="dezu-card rounded-[1.15rem] bg-card/90 py-3 text-sm text-card-foreground sm:py-4">
      <div className="grid gap-2 px-3 sm:grid-cols-[1fr_auto] sm:px-4">
        <div>
          <h2 className="font-heading text-base font-medium leading-snug">Billing</h2>
          <p className="text-sm text-muted-foreground">Upcoming bills and payment pressure</p>
        </div>
        <Link
          href="/bills"
          className="theme-hover inline-flex min-h-8 items-center justify-center rounded-lg bg-[var(--theme-card)] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors ring-1 ring-border"
        >
          View All Bills
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 px-3 sm:mt-4 sm:gap-3 sm:px-4 lg:grid-cols-5">
        <BillingSummaryCard
          label="Due This Month"
          value={formatCurrency(summary.dueThisMonthAmount)}
          sub={`${summary.dueThisMonthCount} bill${summary.dueThisMonthCount === 1 ? "" : "s"}`}
          icon={Calendar}
          tone="sky"
        />
        <BillingSummaryCard
          label="Upcoming"
          value={formatCurrency(summary.upcomingAmount)}
          sub={`${summary.upcomingCount} next 30 days`}
          icon={Clock3}
          tone="amber"
        />
        <BillingSummaryCard
          label="Overdue"
          value={formatCurrency(summary.overdueAmount)}
          sub={`${summary.overdueCount} overdue`}
          icon={AlertTriangle}
          tone="rose"
        />
        <BillingSummaryCard
          label="Paid This Month"
          value={formatCurrency(summary.paidThisMonthAmount)}
          sub={`${summary.paidThisMonthCount} paid`}
          icon={CheckCircle2}
          tone="emerald"
        />
        <BillingSummaryCard
          label="Remaining"
          value={formatCurrency(summary.remainingAmount)}
          sub="All unpaid bills"
          icon={ReceiptText}
          tone="zinc"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="mt-3 px-3 sm:mt-4 sm:px-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Bills</p>
          <p className="text-xs text-muted-foreground">Next 30 days first</p>
        </div>
        {bills.length === 0 ? (
          <div className="dezu-card rounded-[1.15rem] bg-card/80 py-5 text-center text-sm text-muted-foreground">
            No upcoming or overdue bills.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 lg:grid lg:grid-cols-5 lg:gap-2">
            {bills.map((bill) => {
              const status = effectiveBillStatus(bill);
              const badgeClass = status === "overdue"
                ? "bg-rose-500/10 text-rose-300"
                : daysUntil(bill.dueDate) <= 3
                ? "bg-amber-500/10 text-amber-300"
                : "bg-zinc-800 text-zinc-300";

              return (
                <div key={bill.id} className="dezu-card rounded-[1.15rem] bg-card/90 p-2.5 sm:p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-card-foreground">{bill.title}</p>
                      <p className="mt-0.5 text-xs font-bold tabular-nums text-card-foreground sm:mt-1 sm:text-sm">
                        {formatCurrency(bill.amount)}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold leading-none", badgeClass)}>
                      {dueBadgeLabel(bill)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground sm:mt-2">
                    <span>{shortDate(bill.dueDate)}</span>
                    {bill.isRecurring && <span>Recurring</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MonthPicker({
  month,
  onShift,
  className,
}: {
  month: string;
  onShift: (delta: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex h-10 max-w-[170px] shrink-0 items-center gap-0.5 rounded-full bg-card/90 px-1 ring-1 ring-border shadow-sm sm:max-w-none", className)}>
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onShift(-1)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft size={14} strokeWidth={2.25} />
      </button>
      <span className="min-w-[5.75rem] truncate text-center text-[11px] font-semibold tabular-nums text-foreground min-[380px]:min-w-[6.75rem] min-[380px]:text-xs sm:min-w-[140px] sm:text-sm">
        {formatMonthLabel(month)}
      </span>
      <button
        type="button"
        aria-label="Next month"
        onClick={() => onShift(1)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronRight size={14} strokeWidth={2.25} />
      </button>
    </div>
  );
}

export function DashboardView() {
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const [month, setMonth] = useState(todayMonth);
  const [data, setData] = useState<typeof EMPTY | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadRequestId = useRef(0);
  const localDashboard = useLocalDashboardData(month, isGuest ? OFFLINE_USER_ID : user?.id ?? "__cloud__");

  const loadDashboard = useCallback(async (isMounted?: () => boolean) => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError("");
    const isCurrent = () => requestId === loadRequestId.current && (!isMounted || isMounted());

    try {
      if (authLoading || isLoggingOut) return;
      if (isGuest) {
        if (isCurrent()) setLoading(false);
        return;
      }
      if (!user?.id) {
        if (!isCurrent()) return;
        setData(EMPTY);
        return;
      }

      const recurringSyncError = await syncRecurringMonthlyBillsForDashboard(user.id, month);

      const supabase = createClient();
      const [walletSettled, txSettled, categorySettled, budgetSettled, goalSettled, billSettled] = await Promise.allSettled([
        loggedSupabase("wallets", supabase.from("wallets").select("id,name,type,balance,color,logo_url").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("transactions", supabase.from("transactions").select("id,wallet_id,destination_wallet_id,category_id,amount,transaction_type,description,transaction_date").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("categories", supabase.from("categories").select("id,name,icon,color").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("budgets", supabase.from("budgets").select("id,category_id,amount,month").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("goals", supabase.from("goals").select("id,target_amount,current_amount,status").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("bills", supabase.from("bills").select("id,title,amount,due_date,status,is_recurring,recurring_id").eq("user_id", user.id).eq("is_deleted", false)),
      ]);

      if (!isCurrent()) return;

      const errors = [recurringSyncError, ...[walletSettled, txSettled, categorySettled, budgetSettled, goalSettled, billSettled]
        .map(settledError)
      ].filter(Boolean);
      if (errors.length > 0) setLoadError(errors.join(" | "));

      const walletResult = walletSettled.status === "fulfilled" ? walletSettled.value : { data: [] };
      const txResult = txSettled.status === "fulfilled" ? txSettled.value : { data: [] };
      const categoryResult = categorySettled.status === "fulfilled" ? categorySettled.value : { data: [] };
      const budgetResult = budgetSettled.status === "fulfilled" ? budgetSettled.value : { data: [] };
      const goalResult = goalSettled.status === "fulfilled" ? goalSettled.value : { data: [] };
      const billResult = billSettled.status === "fulfilled" ? billSettled.value : { data: [] };

      const wallets = ((walletResult.data ?? []) as SupabaseWallet[]).map((wallet) => ({
        ...wallet,
        balance: Number(wallet.balance),
      }));
      const transactions = (txResult.data ?? []) as SupabaseTransaction[];
      const categories = (categoryResult.data ?? []) as SupabaseCategory[];
      const budgets = (budgetResult.data ?? []) as SupabaseBudget[];
      const goals = (goalResult.data ?? []) as SupabaseGoal[];
      const bills = (billResult.data ?? []) as SupabaseBill[];
      const categoryMap = new Map(categories.map((category) => [category.id, category]));
      const walletMap = new Map(wallets.map((wallet) => [wallet.id, wallet]));
      const billData = summarizeBills(bills, month);

      const current = monthRange(month);
      const previousMonth = addMonths(month, -1);
      const previous = monthRange(previousMonth);
      const inRange = (tx: SupabaseTransaction, start: string, end: string) =>
        tx.transaction_date >= start && tx.transaction_date <= end;

      const currentTxs = transactions.filter((tx) => inRange(tx, current.start, current.end));
      const previousTxs = transactions.filter((tx) => inRange(tx, previous.start, previous.end));
      const monthIncome = sumByType(currentTxs, "income");
      const monthExpenses = sumByType(currentTxs, "expense");
      const currentBudgets = budgets.filter((budget) => budget.month.slice(0, 7) === month);
      const activeGoals = goals.filter((goal) => goal.status === "active");
      const activeGoalProgress = activeGoals.reduce((sum, goal) => sum + Number(goal.current_amount), 0);
      void currentBudgets;
      void activeGoalProgress;
      const previousIncome = sumByType(previousTxs, "income");
      const previousExpenses = sumByType(previousTxs, "expense");
      const netSavings = monthIncome - monthExpenses;
      const previousSavings = previousIncome - previousExpenses;

      const chartData = Array.from({ length: 6 }, (_, index) => {
        const chartMonth = addMonths(month, -(5 - index));
        const range = monthRange(chartMonth);
        const txs = transactions.filter((tx) => inRange(tx, range.start, range.end));
        return {
          month: shortMonthLabel(chartMonth),
          income: sumByType(txs, "income"),
          expenses: sumByType(txs, "expense"),
        };
      });

      const categoryTotals = new Map<string, number>();
      for (const tx of currentTxs.filter((item) => item.transaction_type === "expense")) {
        const key = tx.category_id ?? "uncategorized";
        categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + amount(tx));
      }

      const topCategories: DashboardTopCategory[] = [...categoryTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([categoryId, total]) => {
          const category = categoryMap.get(categoryId);
          return {
            categoryId,
            name: category?.name ?? "Uncategorized",
            icon: category?.icon ?? "Tag",
            color: category?.color ?? "zinc",
            total,
            percentage: monthExpenses > 0 ? (total / monthExpenses) * 100 : 0,
          };
        });

      const recentTransactions: DashboardRecentTx[] = [...transactions]
        .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
        .slice(0, 8)
        .map((tx) => {
          const category = tx.category_id ? categoryMap.get(tx.category_id) : undefined;
          const wallet = walletMap.get(tx.wallet_id);
          const destinationWallet = tx.destination_wallet_id ? walletMap.get(tx.destination_wallet_id) : undefined;
          const isTransfer = tx.transaction_type === "transfer";
          return {
            id: tx.id,
            name: isTransfer
              ? `Transfer: ${wallet?.name ?? "Unknown"} → ${destinationWallet?.name ?? "Unknown"}`
              : tx.description ?? "Transaction",
            categoryName: isTransfer ? "Transfer" : category?.name ?? "Uncategorized",
            categoryIcon: isTransfer ? "ArrowLeftRight" : category?.icon ?? "Tag",
            categoryColor: isTransfer ? "sky" : category?.color ?? "zinc",
            walletName: wallet?.name ?? "Unknown wallet",
            amount: amount(tx),
            type: tx.transaction_type,
            date: tx.transaction_date,
          };
        });

      setData({
        netWorth: wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
        monthIncome,
        monthExpenses,
        netSavings,
        savingsRate: monthIncome > 0 ? (netSavings / monthIncome) * 100 : 0,
        incomeTrend: pctChange(monthIncome, previousIncome),
        expensesTrend: pctChange(monthExpenses, previousExpenses),
        savingsTrend: pctChange(netSavings, previousSavings),
        chartData,
        topCategories,
        recentTransactions,
        bills: billData.visibleBills,
        billSummary: billData.summary,
        wallets,
      });
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load dashboard.");
      setData(EMPTY);
    } finally {
      if (!isMounted || isMounted()) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, month, user]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      loadDashboard(() => mounted);
    });
    return () => {
      mounted = false;
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!user?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`dashboard-billing-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bills", filter: `user_id=eq.${user.id}` },
        () => loadDashboard()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_transactions", filter: `user_id=eq.${user.id}` },
        () => loadDashboard()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadDashboard, user?.id]);

  const localStats: typeof EMPTY = localDashboard.data
    ? {
        ...EMPTY,
        ...localDashboard.data,
        topCategories: localDashboard.data.topCategories.map((category) => ({
          ...category,
          categoryId: String(category.categoryId),
        })),
        wallets: localDashboard.data.wallets.map((wallet) => ({
          id: wallet.id,
          name: wallet.name,
          type: wallet.type,
          balance: wallet.balance,
          color: wallet.color,
          logo_url: wallet.logoUrl ?? null,
        })),
      }
    : EMPTY;
  const stats = isGuest ? localStats : data ?? EMPTY;
  const pageLoading = isGuest ? localDashboard.loading : loading;
  const handleShiftMonth = useCallback((delta: number) => {
    setMonth((m) => shiftMonth(m, delta));
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-3 sm:space-y-6 sm:px-5 sm:py-7">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">Dashboard</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
            {pageLoading ? "Loading…" : `${formatMonthLabel(month)} · ${isGuest ? "Offline Overview" : "Overview"}`}
          </p>
        </div>

        <MonthPicker month={month} onShift={handleShiftMonth} />
      </div>

      {pageLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 size={28} className="animate-spin text-zinc-500" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {loadError}
        </div>
      ) : (
        <>
          {/* stat cards */}
          <StatCards
            netWorth={stats.netWorth}
            monthIncome={stats.monthIncome}
            monthExpenses={stats.monthExpenses}
            netSavings={stats.netSavings}
            savingsRate={stats.savingsRate}
            incomeTrend={stats.incomeTrend}
            expensesTrend={stats.expensesTrend}
            savingsTrend={stats.savingsTrend}
          />

          <DashboardBillsWidget
            summary={stats.billSummary}
            bills={stats.bills}
          />

          {/* chart + wallets */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
            <div className="lg:col-span-2">
              <ExpenseChart chartData={stats.chartData} loading={pageLoading} />
            </div>
            <div className="lg:col-span-1">
              <WalletOverview wallets={stats.wallets} />
            </div>
          </div>

          {/* top categories + recent transactions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
            <TopCategories
              categories={stats.topCategories}
              totalExpenses={stats.monthExpenses}
            />
            <RecentTransactions transactions={stats.recentTransactions} />
          </div>
        </>
      )}
    </div>
  );
}
