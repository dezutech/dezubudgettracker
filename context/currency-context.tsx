"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useAuth } from "@/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  CURRENCY_SYMBOLS,
  DEFAULT_CURRENCY,
  formatCurrencyValue,
  normalizeCurrency,
  type BaseCurrency,
} from "@/lib/currency";

const STORAGE_KEY = "dezu-base-currency";

type CurrencyContextType = {
  currency: BaseCurrency;
  symbol: string;
  setCurrency: (currency: BaseCurrency) => Promise<void>;
  formatCurrency: (value: number | string, options?: { decimals?: number; absolute?: boolean; code?: boolean }) => string;
};

const CurrencyContext = createContext<CurrencyContextType>({
  currency: DEFAULT_CURRENCY,
  symbol: CURRENCY_SYMBOLS[DEFAULT_CURRENCY],
  setCurrency: async () => {},
  formatCurrency: (value, options) => formatCurrencyValue(value, DEFAULT_CURRENCY, options),
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isGuest, loading } = useAuth();
  const lastProfileCurrency = useRef<BaseCurrency | null>(null);
  const [currency, setCurrencyState] = useState<BaseCurrency>(() => {
    if (typeof window === "undefined") return DEFAULT_CURRENCY;
    return normalizeCurrency(window.localStorage.getItem(STORAGE_KEY));
  });

  useEffect(() => {
    if (loading) return;
    const profileCurrency = normalizeCurrency(profile?.base_currency);
    if (user && !isGuest && profile && lastProfileCurrency.current !== profileCurrency) {
      lastProfileCurrency.current = profileCurrency;
      setCurrencyState(profileCurrency);
      window.localStorage.setItem(STORAGE_KEY, profileCurrency);
    }
    if (!user || isGuest) {
      lastProfileCurrency.current = null;
    }
  }, [isGuest, loading, profile?.base_currency, user]);

  const setCurrency = useCallback(async (nextCurrency: BaseCurrency) => {
    const normalized = normalizeCurrency(nextCurrency);
    setCurrencyState(normalized);
    window.localStorage.setItem(STORAGE_KEY, normalized);

    if (!user || isGuest) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, base_currency: normalized }, { onConflict: "id" });
    if (error) throw error;
  }, [isGuest, user]);

  const formatCurrency = useCallback(
    (value: number | string, options?: { decimals?: number; absolute?: boolean; code?: boolean }) =>
      formatCurrencyValue(value, currency, options),
    [currency]
  );

  const value = useMemo(() => ({
    currency,
    symbol: CURRENCY_SYMBOLS[currency],
    setCurrency,
    formatCurrency,
  }), [currency, formatCurrency, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
