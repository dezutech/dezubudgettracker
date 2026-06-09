"use client";

import { useCurrency } from "@/context/currency-context";
import { cn } from "@/lib/utils";

type CurrencyInputPrefixProps = {
  className?: string;
};

export function CurrencyInputPrefix({ className }: CurrencyInputPrefixProps) {
  const { symbol } = useCurrency();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground",
        className
      )}
    >
      {symbol}
    </span>
  );
}
