"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Download, WifiOff, RefreshCw, Share } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

// Chrome / Android exposes this before the browser install UI fires.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ─── Service Worker registration ──────────────────────────────────────────────

function useServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker,   setWaitingWorker]   = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      Promise.allSettled([
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.allSettled(registrations.map((registration) => registration.unregister()))
          ),
        "caches" in window
          ? caches.keys().then((keys) => Promise.allSettled(keys.map((key) => caches.delete(key))))
          : Promise.resolve(),
      ])
        .then(() => {
          console.info("[SW] Disabled in development.");
          if (navigator.serviceWorker.controller && sessionStorage.getItem("sw-dev-reloaded") !== "1") {
            sessionStorage.setItem("sw-dev-reloaded", "1");
            window.location.reload();
          }
        })
        .catch((err) => console.warn("[SW] Development cleanup warning:", err));
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // A new SW is waiting (already installed but not yet active).
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateAvailable(true);
        }

        // Future updates.
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(installing);
              setUpdateAvailable(true);
            }
          });
        });
      })
      .catch((err) => console.warn("[SW] Registration warning:", err));

    // When the new SW takes control, reload to get fresh assets.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setUpdateAvailable(false);
    setWaitingWorker(null);
  }, [waitingWorker]);

  return { updateAvailable, applyUpdate };
}

// ─── Online / offline detection ───────────────────────────────────────────────

function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  return online;
}

// ─── Install prompt detection ────────────────────────────────────────────────

function useInstallPrompt() {
  const [prompt,      setPrompt]      = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos,       setIsIos]       = useState(false);

  useEffect(() => {
    // Already running in standalone = already installed.
    const iosStandalone =
      "standalone" in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      iosStandalone ||
      window.localStorage.getItem("pwa-installed") === "1";

    if (standalone) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS Safari (no beforeinstallprompt, needs manual install).
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !("MSStream" in window);
    setIsIos(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      window.localStorage.setItem("pwa-installed", "1");
      setIsInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      window.localStorage.setItem("pwa-installed", "1");
      setIsInstalled(true);
    }
    setPrompt(null);
    return true;
  }, [prompt]);

  return { prompt, isInstalled, isIos, triggerInstall };
}

// ─── Offline Banner ───────────────────────────────────────────────────────────

function OfflineBanner({ online }: { online: boolean }) {
  const [visible, setVisible] = useState(false);

  // Small delay so it doesn't flash on first render.
  useEffect(() => {
    const id = setTimeout(() => setVisible(!online), 400);
    return () => clearTimeout(id);
  }, [online]);

  if (online) return null;

  return (
    <div
      className={cn(
        "fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2",
        "bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs font-medium text-amber-400",
        "transition-transform duration-300",
        visible ? "translate-y-0" : "-translate-y-full"
      )}
    >
      <WifiOff size={12} strokeWidth={2} />
      Offline — your data is saved locally
    </div>
  );
}

// ─── Update Banner ────────────────────────────────────────────────────────────

function UpdateBanner({
  available,
  onUpdate,
}: {
  available: boolean;
  onUpdate: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (!available || dismissed) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 inset-x-0 z-[99] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-card text-card-foreground ring-1 ring-border rounded-2xl px-4 py-3 shadow-2xl max-w-sm w-full">
        <RefreshCw size={16} className="text-emerald-400 shrink-0" strokeWidth={2} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Update available</p>
          <p className="text-xs text-muted-foreground">A new version of the app is ready.</p>
        </div>
        <button
          onClick={onUpdate}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold transition-colors"
        >
          Update
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Install Banner ───────────────────────────────────────────────────────────

function InstallBanner({
  prompt,
  isIos,
  isInstalled,
  onInstall,
}: {
  prompt: BeforeInstallPromptEvent | null;
  isIos: boolean;
  isInstalled: boolean;
  onInstall: () => Promise<boolean>;
}) {
  const [dismissed,    setDismissed]    = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [installMessage, setInstallMessage] = useState("");

  // Persist dismissal so it doesn't re-show on every page.
  useEffect(() => {
    if (window.localStorage.getItem("pwa-install-dismissed") === "1") {
      setDismissed(true);
    }
  }, []);

  function dismiss() {
    window.localStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
  }

  async function handleInstall() {
    setInstallMessage("");
    const prompted = await onInstall();
    if (!prompted) {
      setInstallMessage("Install is not available here. Use your browser menu to add this app.");
    }
  }

  // Don't show if: already installed, dismissed, and nothing to show.
  if (isInstalled || dismissed) return null;
  if (!prompt && !isIos) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] md:bottom-6 z-[60] flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-[calc(100%_-_24px)] max-w-[420px] overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-border shadow-2xl md:max-w-md">
        <div className="flex items-start gap-2.5 p-3">
          <img
            src="/icons/icon.svg"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 shrink-0 rounded-lg bg-emerald-500/10"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-5 text-foreground">Install Dezu Budget</p>
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                  {isIos
                    ? "Add to Home Screen for offline access."
                    : "Faster access with offline support."}
                </p>
              </div>

              <button
                type="button"
                aria-label="Dismiss install banner"
                onClick={dismiss}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            {/* iOS step-by-step guide */}
            {isIos && showIosGuide && (
              <div className="mt-2 flex flex-col gap-1.5 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">1</span>
                  Tap the <Share size={12} className="text-sky-400 inline shrink-0" /> Share button in Safari
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">2</span>
                  Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong>
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">3</span>
                  Tap <strong className="text-foreground">Add</strong> in the top-right corner
                </p>
              </div>
            )}

            {installMessage && (
              <p className="mt-2 rounded-lg bg-muted px-2.5 py-2 text-xs leading-4 text-muted-foreground">
                {installMessage}
              </p>
            )}

            <div className="mt-2 flex justify-end">
              {isIos ? (
                <button
                  type="button"
                  onClick={() => setShowIosGuide((v) => !v)}
                  className="min-h-9 rounded-lg bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-400 ring-1 ring-sky-500/20 transition-colors hover:bg-sky-500/20"
                >
                  {showIosGuide ? "Hide steps" : "How to install"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleInstall}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
                >
                  <Download size={13} strokeWidth={2.5} />
                  Install
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SwRegister (root export) ─────────────────────────────────────────────────

/**
 * Mount once in root layout.
 * Handles: SW registration, update notifications, offline banner, install prompt.
 */
export function SwRegister() {
  const online                        = useOnlineStatus();
  const { updateAvailable, applyUpdate } = useServiceWorker();
  const { prompt, isInstalled, isIos, triggerInstall } = useInstallPrompt();

  return (
    <>
      <OfflineBanner online={online} />
      <UpdateBanner available={updateAvailable} onUpdate={applyUpdate} />
      <InstallBanner
        prompt={prompt}
        isIos={isIos}
        isInstalled={isInstalled}
        onInstall={triggerInstall}
      />
    </>
  );
}
