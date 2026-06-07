"use client";

import { useRouter } from "next/navigation";
import { User, Settings, LogOut, WifiOff, LogIn } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

// ─── Avatar ───────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return (email ?? "?")[0].toUpperCase();
}

function Avatar({
  url, name, email, size = 32,
}: {
  url?: string | null; name?: string | null; email?: string | null; size?: number;
}) {
  const initials  = getInitials(name, email);
  const fontSize  = Math.max(10, Math.round(size * 0.37));

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? "Avatar"}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-emerald-500 flex items-center justify-center text-zinc-950 font-bold shrink-0"
      style={{ width: size, height: size, fontSize }}
    >
      {initials}
    </div>
  );
}

// ─── UserButton ───────────────────────────────────────────────────────────────

export function UserButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const { user, profile, signOut, isGuest } = useAuth();

  if (!user && !isGuest) return null;

  if (isGuest) {
    const displayName = profile?.display_name ?? "Offline User";
    const avatarUrl = profile?.avatar_url ?? null;

    async function handleExitOffline() {
      await signOut();
      router.push("/login");
      router.refresh();
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center rounded-lg transition-colors shrink-0",
            "focus:outline-none focus:ring-2 focus:ring-amber-500/30",
            "hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]",
            collapsed ? "h-8 w-8 justify-center p-0" : "w-full gap-2.5 px-3 py-2 text-left"
          )}
          title={collapsed ? "Offline Mode" : undefined}
        >
          <Avatar url={avatarUrl} name={displayName} email="offline@device.local" size={collapsed ? 30 : 28} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight text-zinc-100">{displayName}</p>
              <p className="truncate text-[10px] leading-tight text-zinc-500">Offline Mode</p>
            </div>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent side={collapsed ? "bottom" : "top"} align={collapsed ? "end" : "start"} className="min-w-56">
          <div className="px-1.5 py-1.5">
            <div className="flex items-center gap-2.5">
              <Avatar url={avatarUrl} name={displayName} email="offline@device.local" size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{displayName}</p>
                <p className="truncate text-xs text-zinc-500">Offline Mode</p>
              </div>
            </div>
            <div className="sr-only">
              <p className="text-sm font-semibold text-zinc-100">Offline Mode</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                Start tracking your finances right away. Your data will be saved on this device, and you can sign in later to back it up and access it from other devices.
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/settings")} className="flex cursor-pointer items-center gap-2">
            <Settings size={14} strokeWidth={1.75} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/login")} className="flex cursor-pointer items-center gap-2">
            <LogIn size={14} strokeWidth={1.75} />
            Sign in to sync
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleExitOffline} className="flex cursor-pointer items-center gap-2">
            <LogOut size={14} strokeWidth={1.75} />
            Exit offline mode
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!user) return null;

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const email       = user.email ?? "";
  const avatarUrl   = profile?.avatar_url ?? null;

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      {/*
        collapsed = true  → small circular avatar for the mobile top-bar
        collapsed = false → full-width row with name + email for the sidebar footer
      */}
      <DropdownMenuTrigger
        className={cn(
          "flex items-center rounded-lg transition-colors shrink-0",
          "focus:outline-none focus:ring-2 focus:ring-emerald-500/30",
            "hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]",
          collapsed
            ? "w-8 h-8 justify-center p-0"          // compact circle for header
            : "gap-2.5 w-full text-left px-3 py-2"   // full row for sidebar
        )}
        title={collapsed ? displayName : undefined}
      >
        <Avatar url={avatarUrl} name={displayName} email={email} size={collapsed ? 30 : 28} />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-100 truncate leading-tight">
              {displayName}
            </p>
            <p className="text-[10px] text-zinc-500 truncate leading-tight">{email}</p>
          </div>
        )}
      </DropdownMenuTrigger>

      {/*
        Sidebar (collapsed=false): opens above the trigger, left-aligned.
        Header  (collapsed=true):  opens below the trigger, right-aligned.
      */}
      <DropdownMenuContent
        side={collapsed ? "bottom" : "top"}
        align={collapsed ? "end" : "start"}
        className="min-w-52"
      >
        {/* User info header */}
        <div className="px-1.5 py-1.5">
          <div className="flex items-center gap-2.5">
            <Avatar url={avatarUrl} name={displayName} email={email} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-100">{displayName}</p>
              <p className="truncate text-xs text-zinc-500">{email}</p>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => router.push("/profile")}
          className="flex items-center gap-2 cursor-pointer"
        >
          <User size={14} strokeWidth={1.75} />
          Profile
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => router.push("/settings")}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Settings size={14} strokeWidth={1.75} />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={handleSignOut}
          className="flex items-center gap-2 cursor-pointer"
        >
          <LogOut size={14} strokeWidth={1.75} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
