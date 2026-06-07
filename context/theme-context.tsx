"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";

export type AppTheme =
  | "system"
  | "dark"
  | "light"
  | "emerald-accent"
  | "rose-accent"
  | "ocean-accent"
  | "lavender-accent"
  | "sunset-accent";

const STORAGE_KEY = "dezu-theme";

const THEME_CLASSES: AppTheme[] = [
  "system",
  "dark",
  "light",
  "emerald-accent",
  "rose-accent",
  "ocean-accent",
  "lavender-accent",
  "sunset-accent",
];

const LEGACY_THEME_CLASSES = [
  "green-gradient",
  "pink-gradient",
  "blue-gradient",
  "purple-gradient",
  "amber-gradient",
  "coral-gradient",
] as const;

const LEGACY_THEME_MAP: Record<(typeof LEGACY_THEME_CLASSES)[number], AppTheme> = {
  "green-gradient": "emerald-accent",
  "pink-gradient": "rose-accent",
  "blue-gradient": "ocean-accent",
  "purple-gradient": "lavender-accent",
  "amber-gradient": "sunset-accent",
  "coral-gradient": "sunset-accent",
};

type ThemeContextType = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
});

function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.classList.remove(
    "dark",
    "light",
    ...THEME_CLASSES.map((item) => `theme-${item}`),
    ...LEGACY_THEME_CLASSES.map((item) => `theme-${item}`)
  );

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  root.classList.add(resolved === "dark" ? "dark" : "light");
  root.classList.add(`theme-${theme}`);
  if (theme !== "system") root.classList.add(`theme-${resolved}`);
}

function normalizeTheme(theme: string | null): AppTheme {
  if (!theme) return "system";
  if (THEME_CLASSES.includes(theme as AppTheme)) return theme as AppTheme;
  if (theme in LEGACY_THEME_MAP) return LEGACY_THEME_MAP[theme as keyof typeof LEGACY_THEME_MAP];
  return "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window === "undefined") return "system";
    return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const current = normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
      if (current === "system") applyTheme("system");
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    setThemeState(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [setTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
