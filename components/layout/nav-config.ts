import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Target,
  ReceiptText,
  Repeat,
  Trophy,
  Settings,
  HandCoins,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/wallets",     label: "Wallets",      icon: Wallet          },
  { href: "/transactions",label: "Transactions", icon: ArrowLeftRight  },
  { href: "/budgets",     label: "Budgets",      icon: Target          },
  { href: "/bills",       label: "Bills",        icon: ReceiptText     },
  { href: "/debts",       label: "Debts",        icon: HandCoins       },
  { href: "/recurring",   label: "Recurring",    icon: Repeat          },
  { href: "/goals",       label: "Goals",        icon: Trophy          },
  { href: "/settings",    label: "Settings",     icon: Settings        },
];

export const mainNavItems  = navItems.slice(0, 8);
export const settingsNavItem = navItems[8];
