"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  PiggyBank,
  Plus,
  ReceiptText,
  HandCoins,
  Target,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loggedSupabase, settledError } from "@/lib/supabase/query";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import { useCategories, useDashboardData as useLocalDashboardData, useWallets } from "@/lib/db/hooks";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { cn } from "@/lib/utils";
import { RecentTransactions, type DashboardRecentTx } from "./recent-transactions";
import type { DashboardTopCategory } from "./top-categories";
import { AddTransactionModal, type SupabaseCategory as AddTransactionCategory, type SupabaseWallet as AddTransactionWallet } from "@/components/transactions/transactions-view";

type SpendingPeriod = "week" | "month" | "year";
type FinancialChartType = "bar" | "line";
type FinancialPoint = { label: string; income: number; expenses: number; netCashFlow: number };

const FINANCIAL_SERIES_COLORS = {
  income: "rgb(52 211 153)",
  expenses: "rgb(251 113 133)",
  netCashFlow: "rgb(56 189 248)",
};

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
  financialOverview: Record<SpendingPeriod, FinancialPoint[]>;
  topCategories: DashboardTopCategory[];
  spendingCategories: Record<SpendingPeriod, DashboardTopCategory[]>;
  recentTransactions: DashboardRecentTx[];
  bills: DashboardBill[];
  billSummary: DashboardBillSummary;
  debtSummary: DashboardDebtSummary;
  goals: DashboardGoalSummary[];
  wallets: Array<{ id: string | number; name: string; type: string; balance: number; color: string | null; limit?: number; logo_url: string | null }>;
} = {
  netWorth: 0, monthIncome: 0, monthExpenses: 0,
  netSavings: 0, savingsRate: 0,
  incomeTrend: 0, expensesTrend: 0, savingsTrend: 0,
  chartData: [], financialOverview: { week: [], month: [], year: [] }, topCategories: [], spendingCategories: { week: [], month: [], year: [] }, recentTransactions: [], wallets: [],
  goals: [],
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
  debtSummary: {
    totalPayable: 0,
    totalCollectible: 0,
    overdueCount: 0,
    overdueAmount: 0,
  },
};

type SupabaseWallet = {
  id: string;
  name: string;
  type: string;
  balance: number | string;
  credit_limit: number | string | null;
  color: string | null;
  logo_url: string | null;
};

type SupabaseCategory = {
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
  category_id: string | null;
  amount: number | string;
  transaction_type: "income" | "expense" | "transfer";
  description: string | null;
  transaction_date: string;
  created_at?: string;
};

type SupabaseBudget = {
  id: string;
  category_id: string;
  amount: number | string;
  month: string;
};

type SupabaseGoal = {
  id: string;
  name: string;
  target_amount: number | string;
  current_amount: number | string;
  target_date: string | null;
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

type DebtStatus = "active" | "paid" | "overdue";

type SupabaseDebt = {
  id: string;
  debt_type: "i_owe" | "owes_me";
  remaining_balance: number | string;
  due_date: string | null;
  status: DebtStatus;
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

type DashboardDebtSummary = {
  totalPayable: number;
  totalCollectible: number;
  overdueCount: number;
  overdueAmount: number;
};

type DashboardGoalSummary = {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  progress: number;
};

function monthRange(month: string) {
  const [year, mo] = month.split("-").map(Number);
  const lastDay = new Date(year, mo, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function weekRange() {
  const today = new Date(todayIso() + "T00:00:00");
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setDate(today.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
  };
}

function yearRange(month: string) {
  const [year] = month.split("-").map(Number);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
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

function summarizeFinancialPoint(label: string, txs: SupabaseTransaction[]): FinancialPoint {
  const income = sumByType(txs, "income");
  const expenses = sumByType(txs, "expense");
  return { label, income, expenses, netCashFlow: income - expenses };
}

function buildFinancialOverview(transactions: SupabaseTransaction[], month: string): Record<SpendingPeriod, FinancialPoint[]> {
  const week = weekRange();
  const year = yearRange(month);
  const weekStart = new Date(week.start + "T00:00:00");
  const [, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Number(month.slice(0, 4)), monthNumber, 0).getDate();

  return {
    week: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const iso = toIsoDate(date);
      return summarizeFinancialPoint(
        date.toLocaleDateString("en-US", { weekday: "short" }),
        transactions.filter((tx) => tx.transaction_date === iso)
      );
    }),
    month: Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, index) => {
      const startDay = index * 7 + 1;
      const endDay = Math.min(startDay + 6, daysInMonth);
      const start = `${month}-${String(startDay).padStart(2, "0")}`;
      const end = `${month}-${String(endDay).padStart(2, "0")}`;
      return summarizeFinancialPoint(
        `W${index + 1}`,
        transactions.filter((tx) => tx.transaction_date >= start && tx.transaction_date <= end)
      );
    }),
    year: Array.from({ length: 12 }, (_, index) => {
      const itemMonth = `${year.start.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`;
      const range = monthRange(itemMonth);
      return summarizeFinancialPoint(
        shortMonthLabel(itemMonth),
        transactions.filter((tx) => tx.transaction_date >= range.start && tx.transaction_date <= range.end)
      );
    }),
  };
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

  const [
    { data: recurringRows, error: recurringError },
    { data: walletRows },
    { data: categoryRows },
  ] = await Promise.all([
    loggedSupabase(
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
    ),
    supabase.from("wallets").select("id").eq("user_id", userId).eq("is_deleted", false),
    supabase.from("categories").select("id").eq("user_id", userId).eq("is_deleted", false),
  ]);

  if (recurringError) return recurringError.message;

  const recurring = (recurringRows ?? []) as SupabaseRecurringRow[];
  if (recurring.length === 0) return "";

  const validWalletIds = new Set((walletRows ?? []).map((w) => w.id as string));
  const validCategoryIds = new Set((categoryRows ?? []).map((c) => c.id as string));

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

    const walletId = item.wallet_id && validWalletIds.has(item.wallet_id) ? item.wallet_id : null;
    const categoryId = item.category_id && validCategoryIds.has(item.category_id) ? item.category_id : null;

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
          category_id: categoryId,
          wallet_id: walletId,
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

function summarizeSpendingCategories(
  transactions: SupabaseTransaction[],
  categoryMap: Map<string, SupabaseCategory>,
  start: string,
  end: string
): DashboardTopCategory[] {
  const expenses = transactions.filter((tx) =>
    tx.transaction_type === "expense" &&
    tx.transaction_date >= start &&
    tx.transaction_date <= end
  );
  const totalExpenses = expenses.reduce((sum, tx) => sum + amount(tx), 0);
  const categoryTotals = new Map<string, number>();

  for (const tx of expenses) {
    const key = tx.category_id ?? "uncategorized";
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + amount(tx));
  }

  return [...categoryTotals.entries()]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([categoryId, total]) => {
      const category = categoryMap.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? "Uncategorized",
        icon: category?.icon ?? "Tag",
        color: category?.color ?? "zinc",
        total,
        percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
      };
    });
}

function effectiveDebtStatus(debt: SupabaseDebt): DebtStatus {
  if (debt.status === "paid" || Number(debt.remaining_balance) <= 0) return "paid";
  if (debt.due_date && debt.due_date < todayIso()) return "overdue";
  return "active";
}

function summarizeDebts(debts: SupabaseDebt[]): DashboardDebtSummary {
  const active = debts
    .map((debt) => ({ ...debt, status: effectiveDebtStatus(debt) }))
    .filter((debt) => debt.status !== "paid" && Number(debt.remaining_balance) > 0);
  const payable = active.filter((debt) => debt.debt_type === "i_owe");
  const collectible = active.filter((debt) => debt.debt_type === "owes_me");
  const overdue = active.filter((debt) => debt.status === "overdue");

  return {
    totalPayable: payable.reduce((sum, debt) => sum + Number(debt.remaining_balance), 0),
    totalCollectible: collectible.reduce((sum, debt) => sum + Number(debt.remaining_balance), 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, debt) => sum + Number(debt.remaining_balance), 0),
  };
}

async function updateOverdueDebtsForDashboard(userId: string) {
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

function DashboardDebtsWidget({ summary }: { summary: DashboardDebtSummary }) {
  const { formatCurrency } = useCurrency();

  return (
    <div className="dezu-card rounded-[1.15rem] bg-card/90 py-3 text-sm text-card-foreground sm:py-4">
      <div className="grid gap-2 px-3 sm:grid-cols-[1fr_auto] sm:px-4">
        <div>
          <h2 className="font-heading text-base font-medium leading-snug">Debt Tracker</h2>
          <p className="text-sm text-muted-foreground">Borrowed and lent money at a glance</p>
        </div>
        <Link
          href="/debts"
          className="theme-hover inline-flex min-h-8 items-center justify-center rounded-lg bg-[var(--theme-card)] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors ring-1 ring-border"
        >
          View Debt Tracker
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 px-3 sm:mt-4 sm:gap-3 sm:px-4 lg:grid-cols-3">
        <BillingSummaryCard
          label="Total Payable"
          value={formatCurrency(summary.totalPayable)}
          sub="Money I owe"
          icon={ArrowUpRight}
          tone="rose"
        />
        <BillingSummaryCard
          label="Total Collectible"
          value={formatCurrency(summary.totalCollectible)}
          sub="Money owed to me"
          icon={ArrowDownLeft}
          tone="emerald"
        />
        <BillingSummaryCard
          label="Overdue Debts"
          value={formatCurrency(summary.overdueAmount)}
          sub={`${summary.overdueCount} overdue`}
          icon={HandCoins}
          tone="amber"
          className="col-span-2 lg:col-span-1"
        />
      </div>
    </div>
  );
}

function AvailableBalanceCard({
  balance,
  walletCount,
  currency,
}: {
  balance: number;
  walletCount: number;
  currency: string;
}) {
  const { formatCurrency } = useCurrency();

  return (
    <div className="dezu-card rounded-[1.25rem] bg-card/95 p-5 text-card-foreground sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available Balance</p>
          <p className="mt-2 truncate text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
            {formatCurrency(balance, { absolute: false })}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {currency} · Across {walletCount} active wallet{walletCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Wallet size={22} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

function HealthCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Wallet;
  tone: "emerald" | "rose" | "sky" | "amber";
}) {
  const toneClass = {
    emerald: "bg-emerald-500/10 text-emerald-400",
    rose: "bg-rose-500/10 text-rose-400",
    sky: "bg-sky-500/10 text-sky-400",
    amber: "bg-amber-500/10 text-amber-400",
  }[tone];

  return (
    <div className="dezu-card rounded-[1.15rem] bg-card/90 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
          <p className="mt-1 truncate text-base font-bold tabular-nums text-card-foreground sm:text-xl">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{sub}</p>
        </div>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", toneClass)}>
          <Icon size={15} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

function FinancialHealthCards({
  income,
  expenses,
  netCashFlow,
  savingsRate,
}: {
  income: number;
  expenses: number;
  netCashFlow: number;
  savingsRate: number;
}) {
  const { formatCurrency } = useCurrency();

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <HealthCard label="Income This Month" value={formatCurrency(income)} sub="Money in" icon={ArrowDownLeft} tone="emerald" />
      <HealthCard label="Expenses This Month" value={formatCurrency(expenses)} sub="Money out" icon={ArrowUpRight} tone="rose" />
      <HealthCard
        label="Net Cash Flow"
        value={`${netCashFlow >= 0 ? "+" : "-"}${formatCurrency(Math.abs(netCashFlow))}`}
        sub={netCashFlow >= 0 ? "Earning more than spending" : "Spending more than earning"}
        icon={PiggyBank}
        tone={netCashFlow >= 0 ? "sky" : "amber"}
      />
      <HealthCard
        label="Savings Rate"
        value={`${Number.isFinite(savingsRate) ? savingsRate.toFixed(1) : "0.0"}%`}
        sub="Net cash flow / income"
        icon={Target}
        tone={savingsRate >= 20 ? "emerald" : savingsRate >= 0 ? "sky" : "rose"}
      />
    </div>
  );
}

function ChartFallback({ children, loading = false }: { children?: ReactNode; loading?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl bg-muted/25">
      {loading ? (
        <div className="flex w-full flex-col gap-3 px-5">
          <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-muted/70 sm:h-40" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{children}</p>
      )}
    </div>
  );
}

function useChartSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
      setSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };

    frame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    });
    observer.observe(node);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return { ref, size };
}

function FinancialTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  const { formatCurrency } = useCurrency();
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-popover px-4 py-3 text-xs text-popover-foreground shadow-2xl">
      <p className="mb-2 font-medium text-muted-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="mb-1 flex items-center gap-2 last:mb-0">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto pl-3 font-semibold text-foreground">
            {formatCurrency(entry.value, { decimals: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
}

function FinancialOverviewWidget({
  period,
  onPeriodChange,
  chartType,
  onChartTypeChange,
  data,
}: {
  period: SpendingPeriod;
  onPeriodChange: (period: SpendingPeriod) => void;
  chartType: FinancialChartType;
  onChartTypeChange: (type: FinancialChartType) => void;
  data: FinancialPoint[];
}) {
  const { formatCurrency } = useCurrency();
  const { ref, size } = useChartSize();
  const hasData = data.length > 0 && data.some((item) => item.income > 0 || item.expenses > 0);
  const canRenderChart = hasData && size.width > 0 && size.height > 0;
  const totals = data.reduce(
    (sum, item) => ({
      income: sum.income + item.income,
      expenses: sum.expenses + item.expenses,
      netCashFlow: sum.netCashFlow + item.netCashFlow,
    }),
    { income: 0, expenses: 0, netCashFlow: 0 }
  );
  const periodOptions: Array<{ key: SpendingPeriod; label: string }> = [
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "year", label: "This Year" },
  ];
  const chartOptions: Array<{ key: FinancialChartType; label: string }> = [
    { key: "bar", label: "Bar Chart" },
    { key: "line", label: "Line Chart" },
  ];

  return (
    <div className="dezu-card rounded-[1.15rem] bg-card/90 p-3 text-card-foreground sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-heading text-base font-medium leading-snug">Financial Overview</h2>
          <p className="text-sm text-muted-foreground">Income, expenses, and net cash flow</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]">
          <div className="theme-pill-list grid grid-cols-3 gap-1 rounded-lg p-1">
            {periodOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onPeriodChange(option.key)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors sm:text-xs",
                  period === option.key ? "theme-selected" : "theme-pill"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="theme-pill-list grid grid-cols-2 gap-1 rounded-lg p-1">
            {chartOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onChartTypeChange(option.key)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors sm:text-xs",
                  chartType === option.key ? "theme-selected" : "theme-pill"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniMetric label="Income" value={formatCurrency(totals.income, { decimals: 0 })} tone="emerald" />
        <MiniMetric label="Expenses" value={formatCurrency(totals.expenses, { decimals: 0 })} tone="rose" />
        <MiniMetric
          label="Net Cash Flow"
          value={`${totals.netCashFlow >= 0 ? "+" : "-"}${formatCurrency(Math.abs(totals.netCashFlow), { decimals: 0 })}`}
          tone={totals.netCashFlow >= 0 ? "sky" : "amber"}
        />
      </div>

      <div ref={ref} className="mt-4 h-48 min-h-48 w-full sm:h-60 sm:min-h-60">
        {!hasData ? (
          <ChartFallback>No transaction activity for this period.</ChartFallback>
        ) : !canRenderChart ? (
          <ChartFallback loading />
        ) : chartType === "bar" ? (
          <BarChart width={size.width} height={size.height} data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} dy={6} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${formatCurrency(Number(value) / 1000, { decimals: 0 })}k`} />
            <Tooltip content={<FinancialTooltip />} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="income" name="Income" fill={FINANCIAL_SERIES_COLORS.income} radius={[5, 5, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill={FINANCIAL_SERIES_COLORS.expenses} radius={[5, 5, 0, 0]} />
            <Bar dataKey="netCashFlow" name="Net Cash Flow" fill={FINANCIAL_SERIES_COLORS.netCashFlow} radius={[5, 5, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart width={size.width} height={size.height} data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} dy={6} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${formatCurrency(Number(value) / 1000, { decimals: 0 })}k`} />
            <Tooltip content={<FinancialTooltip />} cursor={{ stroke: "var(--ring)", strokeWidth: 1 }} />
            <Line type="monotone" dataKey="income" name="Income" stroke={FINANCIAL_SERIES_COLORS.income} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: FINANCIAL_SERIES_COLORS.income, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="expenses" name="Expenses" stroke={FINANCIAL_SERIES_COLORS.expenses} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: FINANCIAL_SERIES_COLORS.expenses, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="netCashFlow" name="Net Cash Flow" stroke={FINANCIAL_SERIES_COLORS.netCashFlow} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: FINANCIAL_SERIES_COLORS.netCashFlow, strokeWidth: 0 }} />
          </LineChart>
        )}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: "emerald" | "rose" | "sky" | "amber" }) {
  const toneClass = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    sky: "text-sky-400",
    amber: "text-amber-400",
  }[tone];

  return (
    <div className="rounded-xl bg-muted/40 px-2.5 py-2">
      <p className="truncate text-[10px] font-medium text-muted-foreground sm:text-xs">{label}</p>
      <p className={cn("mt-0.5 truncate text-xs font-bold tabular-nums min-[380px]:text-sm sm:text-base", toneClass)}>{value}</p>
    </div>
  );
}

function CompactBillsWidget({ summary }: { summary: DashboardBillSummary }) {
  const { formatCurrency } = useCurrency();
  return (
    <div className="dezu-card rounded-[1.15rem] bg-card/90 p-3 text-card-foreground sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-medium">Bills</h2>
          <p className="text-sm text-muted-foreground">Upcoming and overdue</p>
        </div>
        <Link href="/bills" className="theme-hover rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-border">View Bills</Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <BillingSummaryCard label="Upcoming Bills" value={formatCurrency(summary.upcomingAmount)} sub={`${summary.upcomingCount} next 30 days`} icon={Clock3} tone="amber" />
        <BillingSummaryCard label="Overdue Bills" value={formatCurrency(summary.overdueAmount)} sub={`${summary.overdueCount} overdue`} icon={AlertTriangle} tone="rose" />
      </div>
    </div>
  );
}

function CompactDebtWidget({ summary }: { summary: DashboardDebtSummary }) {
  const { formatCurrency } = useCurrency();
  return (
    <div className="dezu-card rounded-[1.15rem] bg-card/90 p-3 text-card-foreground sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-medium">Debt Summary</h2>
          <p className="text-sm text-muted-foreground">Pay and collect</p>
        </div>
        <Link href="/debts" className="theme-hover rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-border">View Debts</Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <BillingSummaryCard label="Total Payable" value={formatCurrency(summary.totalPayable)} sub="Money I owe" icon={ArrowUpRight} tone="rose" />
        <BillingSummaryCard label="Total Collectible" value={formatCurrency(summary.totalCollectible)} sub={`${summary.overdueCount} overdue`} icon={ArrowDownLeft} tone="emerald" />
      </div>
    </div>
  );
}

function GoalsSummaryWidget({ goals }: { goals: DashboardGoalSummary[] }) {
  const { formatCurrency } = useCurrency();
  return (
    <div className="dezu-card rounded-[1.15rem] bg-card/90 p-3 text-card-foreground sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-medium">Goals</h2>
          <p className="text-sm text-muted-foreground">Top active goals</p>
        </div>
        <Link href="/goals" className="theme-hover rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-border">View All Goals</Link>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {goals.length === 0 ? (
          <div className="rounded-xl bg-muted/50 py-7 text-center text-sm text-muted-foreground">No active goals yet.</div>
        ) : (
          goals.slice(0, 3).map((goal) => (
            <div key={goal.id}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-card-foreground">{goal.name}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{goal.progress.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${goal.progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(goal.currentAmount, { decimals: 0 })} of {formatCurrency(goal.targetAmount, { decimals: 0 })}
              </p>
            </div>
          ))
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
  const { currency } = useCurrency();
  const [month, setMonth] = useState(todayMonth);
  const [financialPeriod, setFinancialPeriod] = useState<SpendingPeriod>("month");
  const [financialChartType, setFinancialChartType] = useState<FinancialChartType>("bar");
  const [data, setData] = useState<typeof EMPTY | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [cloudAddCategories, setCloudAddCategories] = useState<AddTransactionCategory[]>([]);
  const loadRequestId = useRef(0);
  const localDashboard = useLocalDashboardData(month, isGuest ? OFFLINE_USER_ID : user?.id ?? "__cloud__");
  const localWallets = useWallets(isGuest ? OFFLINE_USER_ID : "__cloud__");
  const localCategories = useCategories(isGuest ? OFFLINE_USER_ID : "__cloud__");

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
      const debtOverdueError = await updateOverdueDebtsForDashboard(user.id);

      const supabase = createClient();
      const [walletSettled, txSettled, categorySettled, budgetSettled, goalSettled, billSettled, debtSettled] = await Promise.allSettled([
        loggedSupabase("wallets", supabase.from("wallets").select("id,name,type,balance,credit_limit,color,logo_url").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("transactions", supabase.from("transactions").select("id,wallet_id,destination_wallet_id,category_id,amount,transaction_type,description,transaction_date,created_at").eq("user_id", user.id).eq("is_deleted", false).order("created_at", { ascending: false })),
        loggedSupabase("categories", supabase.from("categories").select("id,name,type,icon,color").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("budgets", supabase.from("budgets").select("id,category_id,amount,month").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("goals", supabase.from("goals").select("id,name,target_amount,current_amount,target_date,status").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("bills", supabase.from("bills").select("id,title,amount,due_date,status,is_recurring,recurring_id").eq("user_id", user.id).eq("is_deleted", false)),
        loggedSupabase("debts", supabase.from("debts").select("id,debt_type,remaining_balance,due_date,status").eq("user_id", user.id).eq("is_deleted", false)),
      ]);

      if (!isCurrent()) return;

      const errors = [recurringSyncError, debtOverdueError, ...[walletSettled, txSettled, categorySettled, budgetSettled, goalSettled, billSettled, debtSettled]
        .map(settledError)
      ].filter(Boolean);
      if (errors.length > 0) setLoadError(errors.join(" | "));

      const walletResult = walletSettled.status === "fulfilled" ? walletSettled.value : { data: [] };
      const txResult = txSettled.status === "fulfilled" ? txSettled.value : { data: [] };
      const categoryResult = categorySettled.status === "fulfilled" ? categorySettled.value : { data: [] };
      const budgetResult = budgetSettled.status === "fulfilled" ? budgetSettled.value : { data: [] };
      const goalResult = goalSettled.status === "fulfilled" ? goalSettled.value : { data: [] };
      const billResult = billSettled.status === "fulfilled" ? billSettled.value : { data: [] };
      const debtResult = debtSettled.status === "fulfilled" ? debtSettled.value : { data: [] };

      const wallets = ((walletResult.data ?? []) as SupabaseWallet[]).map((wallet) => ({
        ...wallet,
        balance: Number(wallet.balance),
        limit: wallet.credit_limit != null ? Number(wallet.credit_limit) : undefined,
      }));
      const transactions = (txResult.data ?? []) as SupabaseTransaction[];
      const categories = (categoryResult.data ?? []) as SupabaseCategory[];
      setCloudAddCategories(categories);
      const budgets = (budgetResult.data ?? []) as SupabaseBudget[];
      const goals = (goalResult.data ?? []) as SupabaseGoal[];
      const bills = (billResult.data ?? []) as SupabaseBill[];
      const debts = (debtResult.data ?? []) as SupabaseDebt[];
      const categoryMap = new Map(categories.map((category) => [category.id, category]));
      const walletMap = new Map(wallets.map((wallet) => [wallet.id, wallet]));
      const billData = summarizeBills(bills, month);
      const debtSummary = summarizeDebts(debts);
      const week = weekRange();
      const year = yearRange(month);

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
      const financialOverview = buildFinancialOverview(transactions, month);

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

      const activeGoalSummaries: DashboardGoalSummary[] = goals
        .filter((goal) => goal.status === "active")
        .sort((a, b) =>
          Number(b.current_amount) / Math.max(Number(b.target_amount), 1) -
          Number(a.current_amount) / Math.max(Number(a.target_amount), 1)
        )
        .slice(0, 3)
        .map((goal) => ({
          id: goal.id,
          name: goal.name,
          currentAmount: Number(goal.current_amount),
          targetAmount: Number(goal.target_amount),
          progress: Math.min((Number(goal.current_amount) / Math.max(Number(goal.target_amount), 1)) * 100, 100),
        }));

      const recentTransactions: DashboardRecentTx[] = [...transactions]
        .sort((a, b) => {
          const createdDiff = Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "");
          if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;
          return b.id.localeCompare(a.id, undefined, { numeric: true });
        })
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
            createdAt: tx.created_at ?? tx.transaction_date,
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
        financialOverview,
        topCategories,
        spendingCategories: {
          week: summarizeSpendingCategories(transactions, categoryMap, week.start, week.end),
          month: topCategories,
          year: summarizeSpendingCategories(transactions, categoryMap, year.start, year.end),
        },
        recentTransactions,
        bills: billData.visibleBills,
        billSummary: billData.summary,
        debtSummary,
        goals: activeGoalSummaries,
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
    const saved = window.localStorage.getItem("dezu-financial-chart-type");
    if (saved === "bar" || saved === "line") setFinancialChartType(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dezu-financial-chart-type", financialChartType);
  }, [financialChartType]);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "debts", filter: `user_id=eq.${user.id}` },
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
        spendingCategories: {
          week: localDashboard.data.spendingCategories.week.map((category) => ({
            ...category,
            categoryId: String(category.categoryId),
          })),
          month: localDashboard.data.spendingCategories.month.map((category) => ({
            ...category,
            categoryId: String(category.categoryId),
          })),
          year: localDashboard.data.spendingCategories.year.map((category) => ({
            ...category,
            categoryId: String(category.categoryId),
          })),
        },
        financialOverview: localDashboard.data.financialOverview,
        wallets: localDashboard.data.wallets.map((wallet) => ({
          id: wallet.id,
          name: wallet.name,
          type: wallet.type,
          balance: wallet.balance,
          color: wallet.color,
          limit: wallet.limit ?? undefined,
          logo_url: wallet.logoUrl ?? null,
        })),
      }
    : EMPTY;
  const stats = isGuest ? localStats : data ?? EMPTY;
  const pageLoading = isGuest ? localDashboard.loading : loading;
  const addWallets: AddTransactionWallet[] = isGuest
    ? localWallets.wallets.map((wallet) => ({ id: String(wallet.id), name: wallet.name }))
    : stats.wallets.map((wallet) => ({ id: String(wallet.id), name: wallet.name }));
  const addCategories: AddTransactionCategory[] = isGuest
    ? localCategories.categories.map((category) => ({
        id: String(category.id),
        name: category.name,
        type: category.type === "both" ? "expense" : category.type,
        icon: category.icon,
        color: category.color,
      }))
    : cloudAddCategories;
  const handleShiftMonth = useCallback((delta: number) => {
    setMonth((m) => shiftMonth(m, delta));
  }, []);
  const handleTransactionCreated = useCallback(() => {
    if (!isGuest) void loadDashboard(undefined);
  }, [isGuest, loadDashboard]);

  return (
    <>
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
          <AvailableBalanceCard
            balance={stats.netWorth}
            walletCount={stats.wallets.length}
            currency={currency}
          />

          <FinancialHealthCards
            income={stats.monthIncome}
            expenses={stats.monthExpenses}
            netCashFlow={stats.netSavings}
            savingsRate={stats.savingsRate}
          />

          <FinancialOverviewWidget
            period={financialPeriod}
            onPeriodChange={setFinancialPeriod}
            chartType={financialChartType}
            onChartTypeChange={setFinancialChartType}
            data={stats.financialOverview[financialPeriod]}
          />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-5">
            <CompactBillsWidget summary={stats.billSummary} />
            <CompactDebtWidget summary={stats.debtSummary} />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-5">
            <GoalsSummaryWidget goals={stats.goals} />
            <RecentTransactions transactions={stats.recentTransactions} />
          </div>
        </>
      )}
    </div>

      {!pageLoading && !loadError && (
        <button
          type="button"
          aria-label="Add Transaction"
          onClick={() => setAddOpen(true)}
          className="theme-selected fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl ring-1 ring-white/25 transition-transform active:scale-95 md:hidden"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}

      <AddTransactionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        wallets={addWallets}
        categories={addCategories}
        userId={user?.id ?? null}
        isOffline={isGuest}
        onCreated={handleTransactionCreated}
      />
    </>
  );
}
