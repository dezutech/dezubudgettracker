export type BaseCurrency = "PHP" | "USD" | "JPY" | "EUR" | "GBP" | "SGD" | "HKD" | "AUD" | "CAD";

export const DEFAULT_CURRENCY: BaseCurrency = "PHP";

export const CURRENCY_OPTIONS: Array<{ value: BaseCurrency; label: string; symbol: string }> = [
  { value: "PHP", label: "PHP - Philippine Peso", symbol: "\u20b1" },
  { value: "USD", label: "USD - US Dollar", symbol: "$" },
  { value: "JPY", label: "JPY - Japanese Yen", symbol: "\u00a5" },
  { value: "EUR", label: "EUR - Euro", symbol: "\u20ac" },
  { value: "GBP", label: "GBP - British Pound", symbol: "\u00a3" },
  { value: "SGD", label: "SGD - Singapore Dollar", symbol: "S$" },
  { value: "HKD", label: "HKD - Hong Kong Dollar", symbol: "HK$" },
  { value: "AUD", label: "AUD - Australian Dollar", symbol: "A$" },
  { value: "CAD", label: "CAD - Canadian Dollar", symbol: "C$" },
];

export const CURRENCY_SYMBOLS: Record<BaseCurrency, string> = Object.fromEntries(
  CURRENCY_OPTIONS.map((option) => [option.value, option.symbol])
) as Record<BaseCurrency, string>;

export function normalizeCurrency(value: string | null | undefined): BaseCurrency {
  return CURRENCY_OPTIONS.some((option) => option.value === value)
    ? (value as BaseCurrency)
    : DEFAULT_CURRENCY;
}

export function formatCurrencyValue(
  value: number | string,
  currency: BaseCurrency,
  options?: {
    decimals?: number;
    absolute?: boolean;
    code?: boolean;
  }
) {
  const amount = Number(value) || 0;
  const decimals = options?.decimals ?? 2;
  const displayAmount = options?.absolute === false ? amount : Math.abs(amount);
  const formatted = displayAmount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${options?.code ? `${currency} ` : CURRENCY_SYMBOLS[currency]}${formatted}`;
}
