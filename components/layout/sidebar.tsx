"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { mainNavItems, settingsNavItem } from "./nav-config";
import { UserButton } from "@/components/auth/user-button";

function isRouteActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 w-60 flex-col bg-sidebar/95 text-sidebar-foreground border-r border-sidebar-border backdrop-blur-xl transition-colors">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border shrink-0">
        <div className="w-7 h-7 rounded-md bg-[var(--theme-primary)] flex items-center justify-center text-xs font-bold text-[var(--theme-primary-foreground)] shrink-0">
          D
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-sidebar-foreground leading-tight truncate">
            Dezu Budget
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Finance Tracker
          </span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {mainNavItems.map((item) => {
          const Icon   = item.icon;
          const active = isRouteActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "theme-selected"
                  : "text-muted-foreground hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
              )}
            >
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section: Settings + User */}
      <div className="px-3 py-3 border-t border-sidebar-border flex flex-col gap-0.5 shrink-0">
        {/* Settings */}
        {(() => {
          const Icon   = settingsNavItem.icon;
          const active = isRouteActive(settingsNavItem.href, pathname);
          return (
            <Link
              href={settingsNavItem.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "theme-selected"
                  : "text-muted-foreground hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
              )}
            >
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              {settingsNavItem.label}
            </Link>
          );
        })()}

        {/* User account button (opens dropdown) */}
        <div className="mt-1">
          <UserButton />
        </div>
      </div>
    </aside>
  );
}
