"use client";

import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { type AppTheme, useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: Array<{
  value: AppTheme;
  label: string;
  description: string;
  swatch: string;
  icon: typeof Monitor;
}> = [
  {
    value: "system",
    label: "System",
    description: "Match device",
    swatch: "from-zinc-200 to-zinc-800",
    icon: Monitor,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Deep contrast",
    swatch: "from-zinc-900 to-emerald-700",
    icon: Moon,
  },
  {
    value: "light",
    label: "Light",
    description: "Crisp contrast",
    swatch: "from-white to-slate-100",
    icon: Sun,
  },
  {
    value: "emerald-accent",
    label: "Emerald",
    description: "Growth accent",
    swatch: "from-emerald-500 via-teal-500 to-cyan-500",
    icon: Palette,
  },
  {
    value: "rose-accent",
    label: "Rose",
    description: "Warm accent",
    swatch: "from-rose-500 via-pink-500 to-fuchsia-500",
    icon: Palette,
  },
  {
    value: "ocean-accent",
    label: "Ocean",
    description: "Calm accent",
    swatch: "from-sky-500 via-blue-500 to-indigo-500",
    icon: Palette,
  },
  {
    value: "lavender-accent",
    label: "Lavender",
    description: "Premium accent",
    swatch: "from-violet-500 via-purple-500 to-fuchsia-500",
    icon: Palette,
  },
  {
    value: "sunset-accent",
    label: "Sunset",
    description: "Lively accent",
    swatch: "from-orange-500 via-rose-500 to-amber-500",
    icon: Palette,
  },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-6xl rounded-xl border border-border bg-card/80 p-3 shadow-sm backdrop-blur-xl sm:p-5">
        <div className="mb-3 flex flex-col gap-0.5 sm:mb-4 sm:gap-1">
          <h2 className="text-base font-semibold tracking-tight text-card-foreground">
            Appearance
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Choose how Dezu Budget looks on this device.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = option.value === theme;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  "group flex min-h-16 items-center gap-2 rounded-lg border p-2 text-left transition-all sm:min-h-20 sm:gap-3 sm:p-3",
                  "hover:-translate-y-0.5 hover:bg-accent/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "border-primary/50 bg-primary/10 shadow-sm"
                    : "border-border bg-background/55"
                )}
                aria-pressed={active}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ring-1 ring-black/5 sm:size-11",
                    option.swatch
                  )}
                >
                  <Icon className="size-3.5 text-zinc-700 sm:size-4" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground sm:text-sm">
                    {option.label}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground sm:text-xs">
                    {option.description}
                  </span>
                </span>
                {active && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground sm:size-5">
                    <Check className="size-2.5 sm:size-3" strokeWidth={2.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
