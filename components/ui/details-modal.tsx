"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function DetailsModalShell({
  open,
  eyebrow,
  title,
  onClose,
  children,
  footer,
  className,
}: {
  open: boolean;
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className={cn("theme-surface relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border", className)}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-card-foreground sm:text-lg">{title}</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-5 sm:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function DetailRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border/70 rounded-xl border border-border bg-card/70", className)}>{children}</div>;
}

export function DetailRow({
  label,
  value,
  accent,
  multiline = false,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  multiline?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]", multiline && "items-start")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className={cn("min-w-0 text-right font-medium text-card-foreground sm:text-left", accent, multiline && "whitespace-pre-wrap break-words text-left leading-relaxed")}>
        {value}
      </div>
    </div>
  );
}
