import { Wallet, TrendingDown, Scale } from "lucide-react";
import type { WalletDisplay } from "./wallet-card";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/context/currency-context";

export function WalletSummary({ wallets }: { wallets: WalletDisplay[] }) {
  const { formatCurrency } = useCurrency();
  const assets   = wallets.filter((w) => w.balance > 0).reduce((s, w) => s + w.balance, 0);
  const debt     = wallets.filter((w) => w.balance < 0).reduce((s, w) => s + Math.abs(w.balance), 0);
  const netWorth = assets - debt;

  const items = [
    {
      label:      "Total Assets",
      value:      formatCurrency(assets),
      valueColor: "text-emerald-400",
      icon:       Wallet,
      iconColor:  "text-emerald-400",
      iconBg:     "bg-emerald-500/10",
      sub:        `${wallets.filter((w) => w.balance >= 0).length} account${wallets.filter((w) => w.balance >= 0).length !== 1 ? "s" : ""}`,
    },
    {
      label:      "Total Debt",
      value:      formatCurrency(debt),
      valueColor: "text-rose-400",
      icon:       TrendingDown,
      iconColor:  "text-rose-400",
      iconBg:     "bg-rose-500/10",
      sub:        `${wallets.filter((w) => w.balance < 0).length} credit card`,
    },
    {
      label:      "Net Worth",
      value:      formatCurrency(netWorth, { absolute: false }),
      valueColor: netWorth >= 0 ? "text-card-foreground" : "text-rose-400",
      icon:       Scale,
      iconColor:  "text-sky-400",
      iconBg:     "bg-sky-500/10",
      sub:        "Assets minus debt",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={cn(
              "dezu-card flex items-center gap-2.5 rounded-[1.15rem] bg-card/90 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4",
              index === 2 && "col-span-2 sm:col-span-1"
            )}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${item.iconBg}`}>
              <Icon size={15} className={item.iconColor} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-muted-foreground">{item.label}</p>
              <p className={`mt-0.5 truncate text-sm font-bold tracking-tight min-[380px]:text-base sm:text-lg ${item.valueColor}`}>{item.value}</p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
