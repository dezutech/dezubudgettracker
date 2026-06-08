import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { db } from "./database";
import { syncRecurringMonthlyBills, updateOverdueLocalBills } from "./bills";
import { effectiveDebtStatus, updateOverdueLocalDebts } from "./debts";
import type {
  DbWallet,
  DbTransaction,
  DbCategory,
  DbBudget,
  DbBill,
  DbRecurringTransaction,
  BillStatus,
  DbGoal,
  DbDebt,
  TransactionType,
} from "./schema";

// ─── useWallets ───────────────────────────────────────────────────────────────

export function useWallets(userId = OFFLINE_USER_ID) {
  const [wallets, setWallets] = useState<DbWallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const sub = liveQuery(() =>
      db.wallets.filter((w) => !w.isArchived).toArray()
        .then((wallets) => wallets.filter((wallet) => wallet.userId === userId))
    ).subscribe({
      next: (ws) => {
        if (!active) return;
        setWallets(ws.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        setLoading(false);
      },
      error: () => {
        if (!active) return;
        setWallets([]);
        setLoading(false);
      },
    });
    return () => {
      active = false;
      sub.unsubscribe();
    };
  }, [userId]);

  return { wallets, loading };
}

// ─── useTransactions ─────────────────────────────────────────────────────────

export function useTransactions(userId = OFFLINE_USER_ID) {
  const [transactions, setTransactions] = useState<DbTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const sub = liveQuery(() =>
      db.transactions.orderBy("date").reverse().toArray()
        .then((transactions) => transactions.filter((transaction) => transaction.userId === userId))
    ).subscribe({
      next: (txs) => {
        if (!active) return;
        setTransactions(txs);
        setLoading(false);
      },
      error: () => {
        if (!active) return;
        setTransactions([]);
        setLoading(false);
      },
    });
    return () => {
      active = false;
      sub.unsubscribe();
    };
  }, [userId]);

  return { transactions, loading };
}

// ─── useCategories ────────────────────────────────────────────────────────────

export function useCategories(userId = OFFLINE_USER_ID) {
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const sub = liveQuery(() =>
      db.categories.where("userId").equals(userId).sortBy("sortOrder")
    ).subscribe({
      next: (cats) => {
        if (!active) return;
        setCategories(cats);
        setLoading(false);
      },
      error: () => {
        if (!active) return;
        setCategories([]);
        setLoading(false);
      },
    });
    return () => {
      active = false;
      sub.unsubscribe();
    };
  }, [userId]);

  return { categories, loading };
}

// ─── useBudgets ───────────────────────────────────────────────────────────────

export type BudgetStatus = "normal" | "warning" | "critical" | "over";

export type BudgetWithUsage = {
  budget: DbBudget;
  category: DbCategory | undefined;
  spent: number;
  remaining: number;
  percentage: number;
  status: BudgetStatus;
};

export function useBudgets(month: string, userId = OFFLINE_USER_ID) {
  const [data, setData] = useState<BudgetWithUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const [year, mo] = month.split("-").map(Number);
    const startDate = `${month}-01`;
    const lastDay = new Date(year, mo, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

    const sub = liveQuery(async () => {
      const [budgets, txs, cats] = await Promise.all([
        db.budgets.where("[userId+month]").equals([userId, month]).toArray(),
        db.transactions
          .where("date")
          .between(startDate, endDate, true, true)
          .filter((t) => t.userId === userId && t.type === "expense")
          .toArray(),
        db.categories.where("userId").equals(userId).toArray(),
      ]);

      const catMap = new Map(cats.map((c) => [c.id, c]));
      const spentMap = new Map<number, number>();
      for (const tx of txs) {
        spentMap.set(tx.categoryId, (spentMap.get(tx.categoryId) ?? 0) + tx.amount);
      }

      return budgets.map((budget) => {
        const spent = spentMap.get(budget.categoryId) ?? 0;
        const remaining = budget.amount - spent;
        const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        const status: BudgetStatus =
          percentage > 100 ? "over"
          : percentage > 90 ? "critical"
          : percentage > 70 ? "warning"
          : "normal";
        return { budget, category: catMap.get(budget.categoryId), spent, remaining, percentage, status };
      });
    }).subscribe({
      next: (items) => {
        if (!active) return;
        setData(items);
        setLoading(false);
      },
      error: () => {
        if (!active) return;
        setData([]);
        setLoading(false);
      },
    });
    return () => {
      active = false;
      sub.unsubscribe();
    };
  }, [month, userId]);

  return { data, loading };
}

// ─── useDashboardData ─────────────────────────────────────────────────────────

export type DashboardRecentTx = {
  id: number;
  name: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  walletName: string;
  amount: number;
  type: TransactionType;
  date: string;
};

export type DashboardTopCategory = {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  total: number;
  percentage: number;
};

export type DashboardData = {
  netWorth: number;
  monthIncome: number;
  monthExpenses: number;
  netSavings: number;
  savingsRate: number;
  incomeTrend: number;
  expensesTrend: number;
  savingsTrend: number;
  chartData: Array<{ month: string; income: number; expenses: number }>;
  topCategories: DashboardTopCategory[];
  spendingCategories: {
    week: DashboardTopCategory[];
    month: DashboardTopCategory[];
    year: DashboardTopCategory[];
  };
  recentTransactions: DashboardRecentTx[];
  wallets: DbWallet[];
  bills: Array<{ id: string; title: string; amount: number; dueDate: string; status: BillStatus; isRecurring: boolean; recurringId?: string | null }>;
  billSummary: {
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
  debtSummary: {
    totalPayable: number;
    totalCollectible: number;
    overdueCount: number;
    overdueAmount: number;
  };
  goals: Array<{
    id: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    progress: number;
  }>;
};

function monthRange(month: string): { start: string; end: string } {
  const [year, mo] = month.split("-").map(Number);
  const lastDay = new Date(year, mo, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
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

function sumByType(txs: DbTransaction[], type: TransactionType): number {
  return txs.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function weekRange(): { start: string; end: string } {
  const today = new Date(todayIso() + "T00:00:00");
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setDate(today.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function yearRange(month: string): { start: string; end: string } {
  const [year] = month.split("-").map(Number);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function summarizeSpendingCategories(
  txs: DbTransaction[],
  cats: DbCategory[],
  start: string,
  end: string
): DashboardTopCategory[] {
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const expenses = txs.filter((tx) => tx.type === "expense" && tx.date >= start && tx.date <= end);
  const totalExpenses = expenses.reduce((sum, tx) => sum + tx.amount, 0);
  const catTotals = new Map<number, number>();

  for (const tx of expenses) {
    catTotals.set(tx.categoryId, (catTotals.get(tx.categoryId) ?? 0) + tx.amount);
  }

  return [...catTotals.entries()]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([catId, total]) => {
      const cat = catMap.get(catId);
      return {
        categoryId: catId,
        name: cat?.name ?? "Unknown",
        icon: cat?.icon ?? "Tag",
        color: cat?.color ?? "zinc",
        total,
        percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
      };
    });
}

function summarizeLocalBills(bills: DbBill[], month: string) {
  const { start: monthStart, end: monthEnd } = monthRange(month);
  const today = new Date().toISOString().split("T")[0];
  const upcomingEndDate = new Date(today + "T00:00:00");
  upcomingEndDate.setDate(upcomingEndDate.getDate() + 30);
  const upcomingEnd = upcomingEndDate.toISOString().split("T")[0];
  const normalized = bills.map((bill) => ({
    ...bill,
    effectiveStatus: bill.status === "paid" ? "paid" : bill.dueDate < today ? "overdue" : bill.status,
  }));
  const active = normalized.filter((bill) => bill.effectiveStatus !== "paid");
  const dueThisMonth = active.filter((bill) => bill.dueDate >= monthStart && bill.dueDate <= monthEnd);
  const upcoming = active.filter((bill) => bill.dueDate >= today && bill.dueDate <= upcomingEnd);
  const overdue = active.filter((bill) => bill.effectiveStatus === "overdue");
  const paidThisMonth = normalized.filter((bill) => bill.status === "paid" && bill.dueDate >= monthStart && bill.dueDate <= monthEnd);
  const visibleBills = active
    .filter((bill) => bill.effectiveStatus === "overdue" || (bill.dueDate >= today && bill.dueDate <= upcomingEnd))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)
    .map((bill) => ({
      id: String(bill.id),
      title: bill.title,
      amount: bill.amount,
      dueDate: bill.dueDate,
      status: bill.effectiveStatus as BillStatus,
      isRecurring: bill.isRecurring,
      recurringId: bill.recurringId != null ? String(bill.recurringId) : null,
    }));

  return {
    bills: visibleBills,
    billSummary: {
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
  };
}

function summarizeLocalDebts(debts: DbDebt[]) {
  const active = debts
    .filter((debt) => !debt.isDeleted)
    .map((debt) => ({ ...debt, status: effectiveDebtStatus(debt) }))
    .filter((debt) => debt.status !== "paid" && debt.remainingBalance > 0);
  const payable = active.filter((debt) => debt.debtType === "i_owe");
  const collectible = active.filter((debt) => debt.debtType === "owes_me");
  const overdue = active.filter((debt) => debt.status === "overdue");

  return {
    totalPayable: payable.reduce((sum, debt) => sum + debt.remainingBalance, 0),
    totalCollectible: collectible.reduce((sum, debt) => sum + debt.remainingBalance, 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, debt) => sum + debt.remainingBalance, 0),
  };
}

export function useDashboardData(month: string, userId = OFFLINE_USER_ID) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
      const { start: monthStart, end: monthEnd } = monthRange(month);
      const prevMonth = addMonths(month, -1);
      const { start: prevStart, end: prevEnd } = monthRange(prevMonth);
      const week = weekRange();
      const year = yearRange(month);

    const sub = liveQuery(async () => {
      await syncRecurringMonthlyBills(userId);
      await updateOverdueLocalBills(userId);
      await updateOverdueLocalDebts(userId);

      const [allTxs, wallets, cats, bills, debts, goals] = await Promise.all([
        db.transactions.orderBy("date").toArray(),
        db.wallets.where("userId").equals(userId).filter((w) => !w.isArchived).toArray(),
        db.categories.where("userId").equals(userId).toArray(),
        db.bills.where("userId").equals(userId).filter((bill) => !bill.isDeleted).toArray(),
        db.debts.where("userId").equals(userId).filter((debt) => !debt.isDeleted).toArray(),
        db.goals.where("userId").equals(userId).toArray(),
      ]);
      const scopedTxs = allTxs.filter((tx) => tx.userId === userId);

      const catMap = new Map(cats.map((c) => [c.id, c]));
      const walMap = new Map(wallets.map((w) => [w.id, w]));

      const inRange = (t: DbTransaction, s: string, e: string) =>
        t.date >= s && t.date <= e;

      const currentTxs = scopedTxs.filter((t) => inRange(t, monthStart, monthEnd));
      const prevTxs    = scopedTxs.filter((t) => inRange(t, prevStart,  prevEnd));

      const monthIncome   = sumByType(currentTxs, "income");
      const monthExpenses = sumByType(currentTxs, "expense");
      const prevIncome    = sumByType(prevTxs,    "income");
      const prevExpenses  = sumByType(prevTxs,    "expense");
      const netSavings    = monthIncome - monthExpenses;
      const prevSavings   = prevIncome  - prevExpenses;
      const savingsRate   = monthIncome > 0 ? (netSavings / monthIncome) * 100 : 0;
      const netWorth      = wallets.reduce((s, w) => s + w.balance, 0);

      // 6-month chart
      const chartData = Array.from({ length: 6 }, (_, i) => {
        const m = addMonths(month, -(5 - i));
        const { start, end } = monthRange(m);
        const txs = scopedTxs.filter((t) => inRange(t, start, end));
        return {
          month:    shortMonthLabel(m),
          income:   sumByType(txs, "income"),
          expenses: sumByType(txs, "expense"),
        };
      });

      // Top spending categories this month
      const catTotals = new Map<number, number>();
      for (const tx of currentTxs.filter((t) => t.type === "expense")) {
        catTotals.set(tx.categoryId, (catTotals.get(tx.categoryId) ?? 0) + tx.amount);
      }
      const topCategories: DashboardTopCategory[] = [...catTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([catId, total]) => {
          const cat = catMap.get(catId);
          return {
            categoryId: catId,
            name:       cat?.name  ?? "Unknown",
            icon:       cat?.icon  ?? "Tag",
            color:      cat?.color ?? "zinc",
            total,
            percentage: monthExpenses > 0 ? (total / monthExpenses) * 100 : 0,
          };
        });

      // Recent 8 transactions (across all time, sorted newest first)
      const recentTransactions: DashboardRecentTx[] = [...scopedTxs]
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        .slice(0, 8)
        .map((tx) => {
          const cat    = catMap.get(tx.categoryId);
          const wallet = walMap.get(tx.walletId);
          return {
            id:            tx.id,
            name:          tx.name,
            categoryName:  cat?.name    ?? "Unknown",
            categoryIcon:  cat?.icon    ?? "Tag",
            categoryColor: cat?.color   ?? "zinc",
            walletName:    wallet?.name ?? "Unknown",
            amount:        tx.amount,
            type:          tx.type,
            date:          tx.date,
          };
        });

      const billData = summarizeLocalBills(bills, month);
      const debtSummary = summarizeLocalDebts(debts);
      const activeGoals = goals
        .filter((goal) => goal.status === "active")
        .sort((a, b) => b.currentAmount / Math.max(b.targetAmount, 1) - a.currentAmount / Math.max(a.targetAmount, 1))
        .slice(0, 3)
        .map((goal) => ({
          id: String(goal.id),
          name: goal.name,
          currentAmount: goal.currentAmount,
          targetAmount: goal.targetAmount,
          progress: Math.min((goal.currentAmount / Math.max(goal.targetAmount, 1)) * 100, 100),
        }));

      return {
        netWorth,
        monthIncome,
        monthExpenses,
        netSavings,
        savingsRate,
        incomeTrend:   pctChange(monthIncome,   prevIncome),
        expensesTrend: pctChange(monthExpenses, prevExpenses),
        savingsTrend:  pctChange(netSavings,    prevSavings),
        chartData,
        topCategories,
        spendingCategories: {
          week: summarizeSpendingCategories(scopedTxs, cats, week.start, week.end),
          month: topCategories,
          year: summarizeSpendingCategories(scopedTxs, cats, year.start, year.end),
        },
        recentTransactions,
        bills: billData.bills,
        billSummary: billData.billSummary,
        debtSummary,
        goals: activeGoals,
        wallets,
      };
    }).subscribe({
      next:  (d) => { setData(d); setLoading(false); },
      error: ()  => setLoading(false),
    });

    return () => sub.unsubscribe();
  }, [month, userId]);

  return { data, loading };
}

// ─── useRecurringTransactions ─────────────────────────────────────────────────

export function useRecurringTransactions(userId = OFFLINE_USER_ID) {
  const [recurring, setRecurring] = useState<DbRecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.recurringTransactions.where("userId").equals(userId).sortBy("nextRunDate")
    ).subscribe({
      next: (items) => { setRecurring(items); setLoading(false); },
      error: () => setLoading(false),
    });
    return () => sub.unsubscribe();
  }, [userId]);

  return { recurring, loading };
}

// ─── useGoals ─────────────────────────────────────────────────────────────────

export function useGoals(userId = OFFLINE_USER_ID) {
  const [goals, setGoals] = useState<DbGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.goals.where("userId").equals(userId).sortBy("targetDate")
    ).subscribe({
      next: (items) => { setGoals(items); setLoading(false); },
      error: () => setLoading(false),
    });
    return () => sub.unsubscribe();
  }, [userId]);

  return { goals, loading };
}
