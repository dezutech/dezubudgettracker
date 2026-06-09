import { Building2, Banknote, Smartphone, CreditCard, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrency } from "@/context/currency-context";
import type { LucideIcon } from "lucide-react";

type WalletDisplay = {
  id: string | number;
  name: string;
  type: string;
  balance: number;
  color: string | null;
  limit?: number;
  logo_url?: string | null;
};

type WalletColor = "emerald" | "amber" | "violet" | "sky" | "rose";

const walletTypeIcon: Record<string, LucideIcon> = {
  "Bank Account": Building2,
  Cash:           Banknote,
  "E-Wallet":     Smartphone,
  "Credit Card":  CreditCard,
  BNPL:           ShoppingBag,
};

const colorMap: Record<WalletColor, { icon: string; bg: string; bar: string; hex: string }> = {
  emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/10", bar: "bg-emerald-400", hex: "#34d399" },
  amber:   { icon: "text-amber-400",   bg: "bg-amber-500/10",   bar: "bg-amber-400",   hex: "#fbbf24" },
  violet:  { icon: "text-violet-400",  bg: "bg-violet-500/10",  bar: "bg-violet-400",  hex: "#a78bfa" },
  sky:     { icon: "text-sky-400",     bg: "bg-sky-500/10",     bar: "bg-sky-400",     hex: "#38bdf8" },
  rose:    { icon: "text-rose-400",    bg: "bg-rose-500/10",    bar: "bg-rose-400",    hex: "#fb7185" },
};

function normalizeColor(color: string | null | undefined): WalletColor {
  if (color === "emerald" || color === "amber" || color === "violet" || color === "sky" || color === "rose") {
    return color;
  }
  if (color?.toLowerCase() === "#10b981") return "emerald";
  return "amber";
}

function isHexColor(color: string | null | undefined) {
  return Boolean(color && /^#[0-9a-f]{6}$/i.test(color));
}

function walletAccent(color: string | null | undefined) {
  if (isHexColor(color)) {
    return { icon: "", bg: "", bar: "", hex: color!, custom: true };
  }
  return { ...colorMap[normalizeColor(color)], custom: false };
}

function normalizeWalletType(type: string): string {
  const value = type.toLowerCase();
  if (value === "gcash" || value === "maya" || value === "e-wallet" || value === "ewallet") return "E-Wallet";
  if (value === "bnpl" || value === "buy now pay later" || value === "buy now, pay later") return "BNPL";
  if (value === "credit card" || value === "credit") return "Credit Card";
  if (value === "bank account" || value === "bank" || value === "savings") return "Bank Account";
  return "Cash";
}

type WalletOverviewProps = { wallets: WalletDisplay[] };

export function WalletOverview({ wallets }: WalletOverviewProps) {
  const { formatCurrency } = useCurrency();
  const isCreditWallet = (wallet: WalletDisplay) => {
    const type = normalizeWalletType(wallet.type);
    return type === "Credit Card" || type === "BNPL";
  };
  const totalAssets = wallets.filter((w) => !isCreditWallet(w) && w.balance > 0).reduce((s, w) => s + w.balance, 0);
  const netTotal    = wallets.reduce((s, w) => s + w.balance, 0);
  const visibleWallets = wallets.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallets</CardTitle>
        <CardAction>
          <Link
            href="/wallets"
            className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:gap-3">
        {wallets.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4 text-center">No wallets yet</p>
        ) : (
          visibleWallets.map((wallet) => {
            const Icon   = walletTypeIcon[normalizeWalletType(wallet.type)] ?? Banknote;
            const colors = walletAccent(wallet.color);
            const walletType = normalizeWalletType(wallet.type);
            const isCreditWallet = walletType === "Credit Card" || walletType === "BNPL";
            const isDebt = wallet.balance < 0;
            const creditLimit = wallet.limit ?? 0;
            const creditUsed = isCreditWallet ? Math.abs(wallet.balance) : 0;
            const availableCredit = Math.max(0, creditLimit - creditUsed);
            const pct = isCreditWallet
              ? creditLimit > 0 ? Math.min(100, Math.round((creditUsed / creditLimit) * 100)) : 0
              : totalAssets > 0 ? Math.round((wallet.balance / totalAssets) * 100) : 0;

            return (
              <div
                key={wallet.id}
                className="flex items-center gap-2.5 rounded-xl bg-muted/40 p-2.5 transition-colors hover:bg-muted/70 sm:gap-3 sm:p-3"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:h-9 sm:w-9 ${colors.bg}`} style={colors.custom ? { backgroundColor: `${colors.hex}24` } : undefined}>
                  {wallet.logo_url ? (
                    <img src={wallet.logo_url} alt={`${wallet.name} logo`} className="h-full w-full object-contain p-1" />
                  ) : (
                    <Icon size={14} className={colors.custom ? "" : colors.icon} style={colors.custom ? { color: colors.hex } : undefined} strokeWidth={1.75} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-card-foreground truncate">
                      {wallet.name}
                    </span>
                    <span className={`ml-2 shrink-0 text-xs font-semibold sm:text-sm ${isCreditWallet || isDebt ? "text-rose-400" : "text-card-foreground"}`}>
                      {isCreditWallet ? formatCurrency(creditUsed) : `${isDebt ? "-" : ""}${formatCurrency(Math.abs(wallet.balance))}`}
                    </span>
                  </div>
                  {isCreditWallet && (
                    <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">Available {formatCurrency(availableCredit)}</span>
                      <span className="shrink-0">{pct}% used</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${pct}%`, backgroundColor: colors.custom ? colors.hex : undefined }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div className="mt-1 flex items-center justify-between border-t border-border pt-2 sm:pt-3">
          <span className="text-xs text-muted-foreground">Net worth</span>
          <span className="text-sm font-bold text-card-foreground">{formatCurrency(netTotal, { absolute: false })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
