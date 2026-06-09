"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-config";

function isRouteActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const bottomNavItems = navItems.filter((item) =>
    ["/dashboard", "/wallets", "/transactions", "/bills"].includes(item.href)
  );
  const moreItems = navItems.filter((item) =>
    ["/recurring", "/debts", "/goals", "/settings"].includes(item.href)
  );
  const moreActive = moreItems.some((item) => isRouteActive(item.href, pathname));

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close more menu"
            className="absolute inset-0 bg-background/55 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-3 bottom-[calc(4.35rem+env(safe-area-inset-bottom))] overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl ring-1 ring-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">More</p>
              <button
                type="button"
                aria-label="Close more menu"
                onClick={() => setMoreOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-12 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors",
                      active ? "theme-selected" : "theme-hover bg-[var(--theme-card)] text-muted-foreground ring-1 ring-border"
                    )}
                  >
                    <Icon size={18} strokeWidth={active ? 2.25 : 1.9} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card/90 border-t border-border backdrop-blur-xl transition-colors supports-[backdrop-filter]:bg-card/75">
        <div className="grid grid-cols-5 px-1 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom))]">
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

          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 transition-colors",
              moreActive || moreOpen ? "theme-selected" : "text-muted-foreground hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
            )}
          >
            <MoreHorizontal
              size={22}
              strokeWidth={moreActive || moreOpen ? 2.25 : 1.9}
              className="shrink-0"
            />
            <span className="max-w-full truncate text-[9px] font-semibold leading-none">
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
