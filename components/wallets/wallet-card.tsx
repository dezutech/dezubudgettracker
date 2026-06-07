import {
  Building2,
  Banknote,
  Smartphone,
  CreditCard,
  ShoppingBag,
  MoreHorizontal,
  Plus,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { useCurrency } from "@/context/currency-context";

export type WalletDisplay = {
  id: string | number;
  name: string;
  type: string;
  balance: number;
  color: string | null;
  currency?: string;
  limit?: number;
  icon?: string | null;
  logo_url?: string | null;
};

type WalletType = "Bank Account" | "Cash" | "E-Wallet" | "Credit Card" | "BNPL";
type WalletColor = "sky" | "amber" | "violet" | "emerald" | "rose";

// ─── config ───────────────────────────────────────────────────────────────────

type TypeConfig = { icon: LucideIcon; label: string };

const typeConfig: Record<WalletType, TypeConfig> = {
  "Bank Account": { icon: Building2,  label: "Bank Account" },
  Cash:           { icon: Banknote,   label: "Cash"         },
  "E-Wallet":     { icon: Smartphone, label: "E-Wallet"     },
  "Credit Card":  { icon: CreditCard, label: "Credit Card"  },
  BNPL:           { icon: ShoppingBag, label: "BNPL"        },
};

type ColorConfig = { icon: string; bg: string; badge: string; bar: string; hex: string };

const colorConfig: Record<WalletColor, ColorConfig> = {
  sky:     { icon: "text-sky-400",     bg: "bg-sky-500/10",     badge: "bg-sky-500/10 text-sky-400",         bar: "bg-sky-400",     hex: "#38bdf8" },
  amber:   { icon: "text-amber-400",   bg: "bg-amber-500/10",   badge: "bg-amber-500/10 text-amber-400",     bar: "bg-amber-400",   hex: "#fbbf24" },
  violet:  { icon: "text-violet-400",  bg: "bg-violet-500/10",  badge: "bg-violet-500/10 text-violet-400",   bar: "bg-violet-400",  hex: "#a78bfa" },
  emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/10", badge: "bg-emerald-500/10 text-emerald-400", bar: "bg-emerald-400", hex: "#34d399" },
  rose:    { icon: "text-rose-400",    bg: "bg-rose-500/10",    badge: "bg-rose-500/10 text-rose-400",       bar: "bg-rose-400",    hex: "#fb7185" },
};

function normalizeType(type: string): WalletType {
  const value = type.toLowerCase();
  if (value === "bank account" || value === "bank" || value === "savings") return "Bank Account";
  if (value === "gcash" || value === "maya" || value === "e-wallet" || value === "ewallet") return "E-Wallet";
  if (value === "credit card" || value === "credit") return "Credit Card";
  if (value === "bnpl" || value === "buy now pay later" || value === "buy now, pay later") return "BNPL";
  return "Cash";
}

function normalizeColor(color: string | null | undefined, type: WalletType): WalletColor {
  if (color === "sky" || color === "amber" || color === "violet" || color === "emerald" || color === "rose") {
    return color;
  }
  if (color?.toLowerCase() === "#10b981") return "emerald";
  if (type === "Bank Account") return "sky";
  if (type === "E-Wallet") return "violet";
  if (type === "Credit Card") return "rose";
  if (type === "BNPL") return "rose";
  return "amber";
}

function isHexColor(color: string | null | undefined) {
  return Boolean(color && /^#[0-9a-f]{6}$/i.test(color));
}

function walletAccent(color: string | null | undefined, type: WalletType) {
  if (isHexColor(color)) {
    return {
      icon: "",
      bg: "",
      badge: "",
      bar: "",
      hex: color!,
      custom: true,
    };
  }

  return { ...colorConfig[normalizeColor(color, type)], custom: false };
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const full = value.length === 3
    ? value.split("").map((part) => part + part).join("")
    : value;
  const parsed = Number.parseInt(full, 16);
  if (Number.isNaN(parsed)) return { r: 52, g: 211, b: 153 };
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function walletGradientStyle(hex: string): CSSProperties {
  const { r, g, b } = hexToRgb(hex);
  return {
    borderColor: `rgba(${r}, ${g}, ${b}, 0.34)`,
    background: [
      "linear-gradient(180deg, color-mix(in oklch, var(--card) 72%, transparent), color-mix(in oklch, var(--card) 46%, transparent))",
      `radial-gradient(circle at 88% 0%, rgba(${r}, ${g}, ${b}, 0.28), transparent 42%)`,
      `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.24), rgba(${r}, ${g}, ${b}, 0.10) 44%, var(--card) 100%)`,
    ].join(", "),
    boxShadow: `0 18px 45px rgba(${r}, ${g}, ${b}, 0.14), var(--shadow-card)`,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

// ─── WalletCard ───────────────────────────────────────────────────────────────

type WalletCardProps = {
  wallet: WalletDisplay;
  txCount: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onTransfer?: () => void;
};

export function WalletCard({
  wallet,
  txCount,
  monthlyIncome,
  monthlyExpenses,
  onEdit,
  onDelete,
  onTransfer,
}: WalletCardProps) {
  const { currency, formatCurrency } = useCurrency();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const walletType = normalizeType(wallet.type);
  const { icon: Icon, label } = typeConfig[walletType];
  const colors = walletAccent(wallet.color, walletType);
  const isDebt = wallet.balance < 0;

  const creditUsed     = wallet.limit ? Math.abs(wallet.balance) : 0;
  const creditAvailable = wallet.limit ? wallet.limit - creditUsed : 0;
  const utilizationPct = wallet.limit
    ? Math.min(100, Math.round((creditUsed / wallet.limit) * 100))
    : 0;

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  return (
    <Card className="relative flex min-h-[148px] flex-col py-0 sm:min-h-[220px]" style={walletGradientStyle(colors.hex)}>
      <CardContent className="flex flex-1 flex-col gap-2.5 p-3 sm:gap-4 sm:p-5">
        {/* icon + badge + menu */}
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card/70 ring-1 ring-white/20 backdrop-blur sm:h-10 sm:w-10"
              style={{ backgroundColor: `${colors.hex}22` }}
            >
              {wallet.logo_url ? (
                <img src={wallet.logo_url} alt={`${wallet.name} logo`} className="h-full w-full object-contain p-1.5" />
              ) : (
                <Icon size={18} className={colors.custom ? "" : colors.icon} style={colors.custom ? { color: colors.hex } : undefined} strokeWidth={1.75} />
              )}
            </div>
            <span
              className="max-w-[74px] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold sm:max-w-none sm:text-[11px]"
              style={{ backgroundColor: `${colors.hex}1f`, color: colors.hex }}
            >
              {label}
            </span>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card/70 hover:text-foreground sm:h-7 sm:w-7"
              aria-label={`Open ${wallet.name} wallet actions`}
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onTransfer?.();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-sky-300 hover:bg-sky-500/10"
                >
                  <ArrowLeftRight size={12} />
                  Transfer
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit?.();
                  }}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-popover-foreground hover:bg-muted"
                >
                  Edit Wallet
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete?.();
                  }}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-rose-400 hover:bg-rose-500/10"
                >
                  Delete Wallet
                </button>
              </div>
            )}
          </div>
        </div>

        {/* name + balance */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{wallet.name}</p>
          <p className={`truncate text-lg font-bold tracking-tight sm:text-2xl ${isDebt ? "text-rose-500 dark:text-rose-300" : "text-card-foreground"}`}>
            {isDebt ? "-" : ""}{formatCurrency(wallet.balance)}
          </p>
        </div>

        {/* credit card utilization */}
        {(walletType === "Credit Card" || walletType === "BNPL") && wallet.limit && (
          <div className="hidden flex-col gap-2 sm:flex">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {formatCurrency(creditAvailable)} available
              </span>
              <span className={`font-semibold ${utilizationPct > 70 ? "text-rose-400" : "text-muted-foreground"}`}>
                {utilizationPct}% used
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${utilizationPct > 70 ? "bg-rose-400" : "bg-rose-500/60"}`}
                style={{ width: `${utilizationPct}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {formatCurrency(creditUsed)} of {formatCurrency(wallet.limit)} limit
            </p>
          </div>
        )}

        {/* monthly activity – non-CC wallets */}
        {walletType !== "Credit Card" && walletType !== "BNPL" && (monthlyIncome > 0 || monthlyExpenses > 0) && (
          <div className="hidden items-center gap-3 sm:flex">
            {monthlyIncome > 0 && (
              <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                <ArrowDownLeft size={11} strokeWidth={2.5} />
                <span>{formatCurrency(monthlyIncome)}</span>
              </div>
            )}
            {monthlyExpenses > 0 && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowUpRight size={11} strokeWidth={2.5} />
                <span>{formatCurrency(monthlyExpenses)}</span>
              </div>
            )}
          </div>
        )}

        {/* footer */}
        <div className="mt-auto hidden items-center justify-between border-t border-border/70 pt-3 sm:flex">
          <span className="text-[11px] text-muted-foreground">
            {txCount === 0
              ? "No transactions yet"
              : `${txCount} transaction${txCount !== 1 ? "s" : ""}`}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">
            {wallet.currency ?? currency}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AddWalletCard ────────────────────────────────────────────────────────────

export function AddWalletCard({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="dezu-card group flex min-h-[148px] w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[1.15rem] border-2 border-dashed border-border/80 bg-card/70 p-3 text-left transition-all hover:border-primary/40 hover:bg-card/80 sm:min-h-[220px] sm:gap-3 sm:p-8"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted transition-colors group-hover:bg-primary/10 sm:h-10 sm:w-10">
        <Plus size={18} className="text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={2} />
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground sm:text-sm">
          Add Wallet
        </p>
        <p className="mt-0.5 hidden text-[11px] text-muted-foreground transition-colors group-hover:text-foreground/70 sm:block">
          Cash, bank, e-wallet &amp; more
        </p>
      </div>
    </button>
  );
}
