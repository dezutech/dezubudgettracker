"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { useCurrency } from "@/context/currency-context";

type ChartPoint = { month: string; income: number; expenses: number };

function CustomTooltip({
  active, payload, label,
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
        <div key={entry.name} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="capitalize text-muted-foreground">{entry.name}:</span>
          <span className="ml-auto pl-3 font-semibold text-foreground">
            {formatCurrency(entry.value, { decimals: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
}

type ExpenseChartProps = {
  chartData: ChartPoint[];
  loading?: boolean;
};

function ChartFallback({
  children,
  loading = false,
}: {
  children?: ReactNode;
  loading?: boolean;
}) {
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
      const next = {
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      };
      setSize((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
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

export function ExpenseChart({ chartData, loading = false }: ExpenseChartProps) {
  const { formatCurrency } = useCurrency();
  const { ref, size } = useChartSize();
  const hasData = chartData.length > 0 && chartData.some((d) => d.income > 0 || d.expenses > 0);
  const canRenderChart = !loading && hasData && size.width > 0 && size.height > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Overview</CardTitle>
        <CardDescription>Income vs expenses — last 6 months</CardDescription>
      </CardHeader>
      <CardContent className="pb-2 pt-1 sm:pt-2">
        <div ref={ref} className="h-44 min-h-44 w-full sm:h-60 sm:min-h-60">
          {loading ? (
            <ChartFallback loading />
          ) : !hasData ? (
            <ChartFallback>No transactions yet</ChartFallback>
          ) : !canRenderChart ? (
            <ChartFallback loading />
          ) : (
              <AreaChart width={size.width} height={size.height} data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-income)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--chart-income)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-expense)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--chart-expense)" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false} tickLine={false} dy={6}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${formatCurrency(Number(v) / 1000, { decimals: 0 })}k`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--ring)", strokeWidth: 1 }} />
                <Area
                  type="monotone" dataKey="income" name="Income"
                  stroke="var(--chart-income)" strokeWidth={2} fill="url(#fillIncome)"
                  dot={false} activeDot={{ r: 4, fill: "var(--chart-income)", strokeWidth: 0 }}
                />
                <Area
                  type="monotone" dataKey="expenses" name="Expenses"
                  stroke="var(--chart-expense)" strokeWidth={2} fill="url(#fillExpenses)"
                  dot={false} activeDot={{ r: 4, fill: "var(--chart-expense)", strokeWidth: 0 }}
                />
              </AreaChart>
          )}
        </div>

        <div className="mt-2 flex items-center gap-5 px-1 sm:mt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-0.5 w-2.5 rounded-full bg-[var(--chart-income)]" />
            Income
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-0.5 w-2.5 rounded-full bg-[var(--chart-expense)]" />
            Expenses
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

