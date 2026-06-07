"use client";

import { usePathname } from "next/navigation";
import { navItems } from "./nav-config";
import { UserButton } from "@/components/auth/user-button";

function getPageTitle(pathname: string): string {
  if (pathname === "/" || pathname === "/dashboard") return "Dashboard";
  const match = navItems.find(
    (item) => item.href !== "/" && pathname.startsWith(item.href)
  );
  return match?.label ?? "Dezu Budget";
}

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="md:hidden fixed top-0 inset-x-0 z-50 h-14 bg-card/90 border-b border-border backdrop-blur-xl flex items-center gap-2.5 px-4 transition-colors supports-[backdrop-filter]:bg-card/75">
      {/* Logo */}
      <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-zinc-950 shrink-0">
        D
      </div>
      {/* Page title */}
      <span className="flex-1 text-sm font-semibold text-foreground tracking-tight">
        {getPageTitle(pathname)}
      </span>
      {/* User avatar button (collapsed — shows only avatar, opens dropdown) */}
      <UserButton collapsed />
    </header>
  );
}
