"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import { getCategories, getTransactions, type DbCategory, type DbTransaction } from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { cn } from "@/lib/utils";

type Period = "week" | "month" | "year";

type CategoryRow = {
  categoryId: string;
  name: string;
  total: number;
  percentage: number;
};

type TxRow = {
  category_id: string | null;
  amount: number;
  transaction_type: "income" | "expense" | "transfer";
  transaction_date: string;
};

type Category = {
  id: string;
  name: string;
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function toIsoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function periodRange(period: Period) {
  const today = new Date(todayIso() + "T00:00:00");
  if (period === "week") {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(today.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }
  if (period === "year") {
    return { start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31` };
  }
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function localTxToRow(tx: DbTransaction): TxRow {
  return {
    category_id: String(tx.categoryId),
    amount: tx.amount,
    transaction_type: tx.type,
    transaction_date: tx.date,
  };
}

function localCategoryToRow(category: DbCategory): Category {
  return { id: String(category.id), name: category.name };
}

function buildCategoryRows(transactions: TxRow[], categories: Category[], period: Period): CategoryRow[] {
  const range = periodRange(period);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.transaction_type !== "expense") continue;
    if (tx.transaction_date < range.start || tx.transaction_date > range.end) continue;
    const key = tx.category_id ?? "uncategorized";
    totals.set(key, (totals.get(key) ?? 0) + Number(tx.amount));
  }

  const totalExpenses = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([categoryId, total]) => ({
      categoryId,
      name: categoryMap.get(categoryId)?.name ?? "Uncategorized",
      total,
      percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
    }));
}

export function ReportsView() {
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const { formatCurrency } = useCurrency();
  const [period, setPeriod] = useState<Period>("month");
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (authLoading || isLoggingOut) return;
      if (isGuest) {
        const [localTransactions, localCategories] = await Promise.all([
          getTransactions(),
          getCategories(OFFLINE_USER_ID),
        ]);
        setTransactions(localTransactions.filter((tx) => tx.userId === OFFLINE_USER_ID).map(localTxToRow));
        setCategories(localCategories.map(localCategoryToRow));
        return;
      }
      if (!user?.id) {
        setTransactions([]);
        setCategories([]);
        return;
      }

      const supabase = createClient();
      const [txResult, categoryResult] = await Promise.all([
        supabase
          .from("transactions")
          .select("category_id,amount,transaction_type,transaction_date")
          .eq("user_id", user.id)
          .eq("is_deleted", false),
        supabase
          .from("categories")
          .select("id,name")
          .eq("user_id", user.id)
          .eq("is_deleted", false),
      ]);

      if (txResult.error) throw new Error(txResult.error.message);
      if (categoryResult.error) throw new Error(categoryResult.error.message);
      setTransactions((txResult.data ?? []).map((tx) => ({
        category_id: tx.category_id,
        amount: Number(tx.amount),
        transaction_type: tx.transaction_type,
        transaction_date: tx.transaction_date,
      })));
      setCategories((categoryResult.data ?? []) as Category[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, user?.id]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const rows = useMemo(() => buildCategoryRows(transactions, categories, period), [categories, period, transactions]);
  const periodOptions: Array<{ key: Period; label: string }> = [
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "year", label: "This Year" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Reports</h1>
        <p className="text-sm text-muted-foreground">Analyze where your money goes over time.</p>
      </div>

      <div className="dezu-card rounded-[1.15rem] bg-card/90 p-3 text-card-foreground sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 size={16} />
            </div>
            <div>
              <h2 className="font-heading text-base font-medium leading-snug">Spending by Category</h2>
              <p className="text-sm text-muted-foreground">Expenses grouped by category</p>
            </div>
          </div>
          <div className="theme-pill-list grid grid-cols-3 gap-1 rounded-lg p-1">
            {periodOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPeriod(option.key)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors sm:text-xs",
                  period === option.key ? "theme-selected" : "theme-pill"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-muted/40 py-8 text-sm text-muted-foreground">
              <Loader2 size={15} className="animate-spin" />
              Loading reports...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl bg-muted/50 py-8 text-center text-sm text-muted-foreground">
              No expenses for this period.
            </div>
          ) : (
            rows.map((category) => (
              <Link
                key={category.categoryId}
                href={`/transactions?category=${encodeURIComponent(category.name)}`}
                className="group rounded-xl p-2 transition-colors hover:bg-muted/40"
              >
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-card-foreground group-hover:text-primary">{category.name}</span>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-semibold tabular-nums text-card-foreground">{formatCurrency(category.total, { decimals: 0 })}</span>
                    <span className="ml-2 text-xs tabular-nums text-muted-foreground">{category.percentage.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(category.percentage, 100)}%` }} />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
