"use client";

import { CheckCircle2, ChevronDown, Coins, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useCurrency } from "@/context/currency-context";
import { CURRENCY_OPTIONS, type BaseCurrency } from "@/lib/currency";

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleChange(nextCurrency: BaseCurrency) {
    if (nextCurrency === currency || saving) return;
    setSaving(true);
    setError("");
    try {
      await setCurrency(nextCurrency);
      setToast("Currency updated.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save currency.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      {toast && (
        <div className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-popover px-4 py-3 text-sm font-medium text-emerald-400 shadow-2xl">
          <CheckCircle2 className="size-4" strokeWidth={2} />
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-6xl rounded-xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-xl sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Coins className="size-4 text-[var(--theme-primary)]" strokeWidth={1.75} />
              <h2 className="text-base font-semibold tracking-tight text-card-foreground">
                Base Currency
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              This changes the currency symbol only. It does not convert existing amounts.
            </p>
          </div>

          <div className="w-full sm:w-80">
            <label htmlFor="base-currency" className="sr-only">
              Base Currency
            </label>
            <div className="relative">
              <select
                id="base-currency"
                value={currency}
                disabled={saving}
                onChange={(event) => void handleChange(event.target.value as BaseCurrency)}
                className="h-11 w-full appearance-none rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 pr-10 text-sm font-medium text-foreground shadow-sm outline-none transition-colors hover:border-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/25 disabled:cursor-not-allowed disabled:bg-[var(--theme-muted)] disabled:text-[var(--theme-muted-foreground)]"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {saving ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                ) : (
                  <ChevronDown className="size-4" strokeWidth={2} />
                )}
              </div>
            </div>

            {error && (
              <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
