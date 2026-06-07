import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/context/currency-context";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  badge?: React.ReactNode;
};

function StatCard({
  label, value, trend, trendLabel, icon: Icon, iconColor, iconBg, badge,
}: StatCardProps) {
  const up = (trend ?? 0) >= 0;
  const TrendIcon = up ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-3 sm:gap-3 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</span>
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8 ${iconBg}`}>
            <Icon size={14} className={iconColor} strokeWidth={1.75} />
          </div>
        </div>

        <div className="flex min-w-0 items-end gap-1.5 sm:gap-2">
          <p className="min-w-0 truncate text-base font-bold tracking-tight text-card-foreground min-[380px]:text-lg sm:text-2xl">
            {value}
          </p>
          {badge}
        </div>

        {trend !== undefined ? (
          <div className={`flex items-center gap-1 truncate text-[10px] font-medium sm:text-[11px] ${up ? "text-emerald-400" : "text-rose-400"}`}>
            <TrendIcon size={11} strokeWidth={2.5} />
            <span className="truncate">
              {up ? "+" : ""}{trend}% {trendLabel ?? "vs last month"}
            </span>
          </div>
        ) : (
          <div className="h-3 sm:h-4" />
        )}
      </CardContent>
    </Card>
  );
}

type StatCardsProps = {
  netWorth: number;
  monthIncome: number;
  monthExpenses: number;
  netSavings: number;
  savingsRate: number;
  incomeTrend: number;
  expensesTrend: number;
  savingsTrend: number;
};

export function StatCards({
  netWorth, monthIncome, monthExpenses, netSavings, savingsRate,
  incomeTrend, expensesTrend, savingsTrend,
}: StatCardsProps) {
  const { formatCurrency } = useCurrency();
  const savingsRateBadge = (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${
      savingsRate >= 30 ? "bg-emerald-500/15 text-emerald-400"
      : savingsRate >= 10 ? "bg-amber-500/15 text-amber-400"
      : "bg-rose-500/15 text-rose-400"
    }`}>
      {savingsRate.toFixed(1)}%
    </span>
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
      <StatCard
        label="Net Worth"
        value={formatCurrency(netWorth, { absolute: false })}
        icon={Wallet}
        iconColor="text-sky-400"
        iconBg="bg-sky-500/10"
      />
      <StatCard
        label="Monthly Income"
        value={formatCurrency(monthIncome, { absolute: false })}
        trend={incomeTrend}
        icon={ArrowDownLeft}
        iconColor="text-emerald-400"
        iconBg="bg-emerald-500/10"
      />
      <StatCard
        label="Monthly Expenses"
        value={formatCurrency(monthExpenses, { absolute: false })}
        trend={expensesTrend}
        icon={ArrowUpRight}
        iconColor="text-rose-400"
        iconBg="bg-rose-500/10"
      />
      <StatCard
        label="Net Savings"
        value={formatCurrency(netSavings, { absolute: false })}
        trend={savingsTrend}
        badge={savingsRateBadge}
        icon={PiggyBank}
        iconColor="text-violet-400"
        iconBg="bg-violet-500/10"
      />
    </div>
  );
}
