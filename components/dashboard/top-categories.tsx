import { Tag, Flame } from "lucide-react";
import {
  Utensils, ShoppingCart, Car, Zap, Tv, ShoppingBag,
  Heart, BookOpen, Home, Repeat, Briefcase, Laptop,
  TrendingUp, Gift, CirclePlus, Music, Film, Coffee,
  Plane, Coins, PiggyBank, Wallet, CreditCard, Banknote,
  Dumbbell, Pizza, Bus, Smartphone, Globe, Package,
  GraduationCap, Stethoscope, Fuel, Building2, Store,
  UtensilsCrossed, Bike,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/context/currency-context";

export type DashboardTopCategory = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  percentage: number;
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
  ["Gift", Gift], ["CirclePlus", CirclePlus],
]);

const COLOR_MAP = new Map<string, { text: string; bg: string; bar: string }>([
  ["orange",  { text: "text-orange-400",  bg: "bg-orange-500/10",  bar: "bg-orange-400"  }],
  ["amber",   { text: "text-amber-400",   bg: "bg-amber-500/10",   bar: "bg-amber-400"   }],
  ["yellow",  { text: "text-yellow-400",  bg: "bg-yellow-500/10",  bar: "bg-yellow-400"  }],
  ["lime",    { text: "text-lime-400",    bg: "bg-lime-500/10",    bar: "bg-lime-400"    }],
  ["emerald", { text: "text-emerald-400", bg: "bg-emerald-500/10", bar: "bg-emerald-400" }],
  ["teal",    { text: "text-teal-400",    bg: "bg-teal-500/10",    bar: "bg-teal-400"    }],
  ["sky",     { text: "text-sky-400",     bg: "bg-sky-500/10",     bar: "bg-sky-400"     }],
  ["blue",    { text: "text-blue-400",    bg: "bg-blue-500/10",    bar: "bg-blue-400"    }],
  ["indigo",  { text: "text-indigo-400",  bg: "bg-indigo-500/10",  bar: "bg-indigo-400"  }],
  ["violet",  { text: "text-violet-400",  bg: "bg-violet-500/10",  bar: "bg-violet-400"  }],
  ["purple",  { text: "text-purple-400",  bg: "bg-purple-500/10",  bar: "bg-purple-400"  }],
  ["pink",    { text: "text-pink-400",    bg: "bg-pink-500/10",    bar: "bg-pink-400"    }],
  ["rose",    { text: "text-rose-400",    bg: "bg-rose-500/10",    bar: "bg-rose-400"    }],
  ["zinc",    { text: "text-zinc-400",    bg: "bg-zinc-500/10",    bar: "bg-zinc-400"    }],
]);

const RANK_COLORS = ["text-amber-400", "text-zinc-300", "text-amber-700", "text-zinc-500", "text-zinc-500"];

type TopCategoriesProps = {
  categories: DashboardTopCategory[];
  totalExpenses: number;
};

export function TopCategories({ categories, totalExpenses }: TopCategoriesProps) {
  const { formatCurrency } = useCurrency();

  if (categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Spending Categories</CardTitle>
          <CardDescription>Where your money goes this month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
              <Tag size={20} className="text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-500">No expenses this month</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const highest = categories[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Spending Categories</CardTitle>
        <CardDescription>
          {highest
            ? <>Highest: <span className="text-zinc-300 font-medium">{highest.name}</span> at {formatCurrency(highest.total, { decimals: 0 })}</>
            : "Where your money goes this month"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 sm:gap-3">
        {categories.map((cat, i) => {
          const Icon      = ICON_MAP.get(cat.icon) ?? Tag;
          const colorInfo = COLOR_MAP.get(cat.color) ?? { text: "text-zinc-400", bg: "bg-zinc-500/10", bar: "bg-zinc-400" };
          const isTop     = i === 0;

          return (
            <div key={cat.categoryId} className="flex items-center gap-2.5 sm:gap-3">
              {/* rank */}
              <span className={cn("text-xs font-bold w-4 text-center tabular-nums shrink-0", RANK_COLORS[i])}>
                {i + 1}
              </span>

              {/* icon */}
              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8", colorInfo.bg)}>
                <Icon size={13} className={colorInfo.text} strokeWidth={1.75} />
              </div>

              {/* name + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-zinc-100 truncate">{cat.name}</span>
                    {isTop && (
                      <Flame size={12} className="text-amber-400 shrink-0" strokeWidth={2} />
                    )}
                  </div>
                  <div className="ml-2 flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <span className="text-xs text-zinc-400 tabular-nums">
                      {cat.percentage.toFixed(1)}%
                    </span>
                    <span className="text-xs font-semibold text-zinc-100 tabular-nums sm:text-sm">
                      {formatCurrency(cat.total, { decimals: 0 })}
                    </span>
                  </div>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-zinc-800 sm:h-1.5">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", colorInfo.bar)}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div className="mt-1 flex items-center justify-between border-t border-border pt-2 sm:pt-3">
          <span className="text-xs text-muted-foreground">Total expenses</span>
          <span className="text-sm font-bold text-card-foreground">
            {formatCurrency(totalExpenses, { decimals: 0 })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

