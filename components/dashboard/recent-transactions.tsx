import {
  ArrowLeftRight, Tag,
  Utensils, ShoppingCart, Car, Zap, Tv, ShoppingBag,
  Heart, BookOpen, Home, Repeat, Briefcase, Laptop,
  TrendingUp, Gift, CirclePlus, Music, Film, Coffee,
  Plane, Coins, PiggyBank, Wallet, CreditCard, Banknote,
  Dumbbell, Pizza, Bus, Smartphone, Globe, Package,
  GraduationCap, Stethoscope, Fuel, Building2, Store,
  UtensilsCrossed, Bike,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, CardAction,
} from "@/components/ui/card";
import { useCurrency } from "@/context/currency-context";

export type DashboardRecentTx = {
  id: string | number;
  name: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  walletName: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  date: string;
};

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
  ["Gift", Gift], ["CirclePlus", CirclePlus], ["ArrowLeftRight", ArrowLeftRight],
]);

const COLOR_MAP = new Map<string, { text: string; bg: string }>([
  ["orange",  { text: "text-orange-400",  bg: "bg-orange-500/10"  }],
  ["amber",   { text: "text-amber-400",   bg: "bg-amber-500/10"   }],
  ["yellow",  { text: "text-yellow-400",  bg: "bg-yellow-500/10"  }],
  ["lime",    { text: "text-lime-400",    bg: "bg-lime-500/10"    }],
  ["emerald", { text: "text-emerald-400", bg: "bg-emerald-500/10" }],
  ["teal",    { text: "text-teal-400",    bg: "bg-teal-500/10"    }],
  ["sky",     { text: "text-sky-400",     bg: "bg-sky-500/10"     }],
  ["blue",    { text: "text-blue-400",    bg: "bg-blue-500/10"    }],
  ["indigo",  { text: "text-indigo-400",  bg: "bg-indigo-500/10"  }],
  ["violet",  { text: "text-violet-400",  bg: "bg-violet-500/10"  }],
  ["purple",  { text: "text-purple-400",  bg: "bg-purple-500/10"  }],
  ["pink",    { text: "text-pink-400",    bg: "bg-pink-500/10"    }],
  ["rose",    { text: "text-rose-400",    bg: "bg-rose-500/10"    }],
  ["zinc",    { text: "text-zinc-400",    bg: "bg-zinc-500/10"    }],
]);

function shortDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type RecentTransactionsProps = {
  transactions: DashboardRecentTx[];
};

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  const { formatCurrency } = useCurrency();
  const visibleTransactions = transactions.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardAction>
          <Link
            href="/transactions"
            className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500 sm:py-8">No transactions yet</p>
        ) : (
          visibleTransactions.map((tx) => {
            const Icon = ICON_MAP.get(tx.categoryIcon) ?? Tag;
            const colorInfo = COLOR_MAP.get(tx.categoryColor) ?? { text: "text-zinc-400", bg: "bg-zinc-500/10" };
            const isIncome = tx.type === "income";
            const isTransfer = tx.type === "transfer";
            const amountClass = isIncome
              ? "text-emerald-400"
              : isTransfer
              ? "text-sky-400"
              : "text-card-foreground";
            const amountPrefix = isTransfer ? "" : isIncome ? "+" : "-";

            return (
              <div
                key={tx.id}
                className="-mx-3 flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors first:pt-0 last:pb-0 hover:bg-muted/30 sm:-mx-4 sm:gap-3 sm:px-4 sm:py-3"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl ${colorInfo.bg}`}>
                  <Icon size={14} className={colorInfo.text} strokeWidth={1.75} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-card-foreground truncate">{tx.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {tx.categoryName} - {tx.walletName}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className={`text-xs font-semibold tabular-nums sm:text-sm ${amountClass}`}>
                    {amountPrefix}{formatCurrency(tx.amount, { decimals: 0 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {shortDate(tx.date)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

