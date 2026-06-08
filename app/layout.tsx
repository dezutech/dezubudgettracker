import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DbInitializer } from "@/components/db-initializer";
import { OfflineSyncPrompt } from "@/components/offline-sync-prompt";
import { SwRegister } from "@/components/pwa/sw-register";
import { AuthProvider } from "@/context/auth-context";
import { CurrencyProvider } from "@/context/currency-context";
import { ThemeProvider } from "@/context/theme-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitScript = `
(function () {
  try {
    var themes = ["system","dark","light","green-gradient","pink-gradient","blue-gradient","purple-gradient","amber-gradient","coral-gradient"];
    var theme = localStorage.getItem("dezu-theme") || "system";
    if (themes.indexOf(theme) === -1) theme = "system";
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
    var root = document.documentElement;
    root.classList.remove("dark", "light");
    themes.forEach(function (item) { root.classList.remove("theme-" + item); });
    root.classList.add(resolved === "dark" ? "dark" : "light");
    root.classList.add("theme-" + theme);
    if (theme !== "system") root.classList.add("theme-" + resolved);
  } catch (error) {}
})();
`;

// ─── PWA / SEO metadata ───────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: "Dezu Budget Tracker",
    template: "%s · Dezu Budget",
  },
  description:
    "Offline-first personal finance tracker. Track wallets, budgets, goals and recurring transactions — all stored locally on your device.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Budget Tracker",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    title: "Dezu Budget Tracker",
    description: "Offline-first personal finance tracker",
    siteName: "Dezu Budget",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: "#10b981" },
    { media: "(prefers-color-scheme: light)", color: "#10b981" },
  ],
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Budget Tracker" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#10b981" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <CurrencyProvider>
              <DbInitializer />
              <SwRegister />
              <OfflineSyncPrompt />
              {children}
            </CurrencyProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
