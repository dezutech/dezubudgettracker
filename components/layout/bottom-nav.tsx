"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-config";

function isRouteActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const bottomNavItems = navItems.filter((item) =>
    ["/dashboard", "/wallets", "/transactions", "/budgets", "/bills", "/goals"].includes(item.href)
  );

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card/90 border-t border-border backdrop-blur-xl transition-colors supports-[backdrop-filter]:bg-card/75">
      <div className="grid grid-cols-6 px-1 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom))]">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = isRouteActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 transition-colors",
                active ? "theme-selected" : "text-muted-foreground hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
              )}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.25 : 1.9}
                className="shrink-0"
              />
              <span className="max-w-full truncate text-[9px] font-semibold leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
