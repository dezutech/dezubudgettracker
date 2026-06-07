"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type DebugResult = {
  action: string;
  ok: boolean;
  message: string;
  data?: unknown;
};

type BrowserAuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  sessionError: string | null;
  userError: string | null;
  authEvent: AuthChangeEvent | "manual-check" | null;
  cookieNames: string[];
  repairAttempted: boolean;
  repairError: string | null;
  timedOut: boolean;
  serverBrowserMismatch: boolean;
};

type EnvStatus = {
  supabaseUrl: string;
  anonKey: string;
};

type SupabaseDebugClientProps = {
  serverSession: Session | null;
  serverSessionError: string | null;
  serverUser: User | null;
  serverUserError: string | null;
  envStatus: EnvStatus;
};

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getBrowserCookieNames() {
  if (typeof document === "undefined" || !document.cookie) return [];

  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter(Boolean);
}

function waitForHydrationTick() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 5000) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function describeError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return String(error);
}

export function SupabaseDebugClient({
  serverSession,
  serverSessionError,
  serverUser,
  serverUserError,
  envStatus,
}: SupabaseDebugClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<"insert" | "read" | null>(null);
  const [results, setResults] = useState<DebugResult[]>([]);
  const [browserAuth, setBrowserAuth] = useState<BrowserAuthState>({
    loading: true,
    session: null,
    user: null,
    sessionError: null,
    userError: null,
    authEvent: null,
    cookieNames: [],
    repairAttempted: false,
    repairError: null,
    timedOut: false,
    serverBrowserMismatch: false,
  });

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    function finalizeBrowserAuth(nextState: Omit<BrowserAuthState, "loading">) {
      if (cancelled || settled) return false;
      settled = true;
      window.clearTimeout(fallbackId);
      setBrowserAuth({
        ...nextState,
        loading: false,
      });
      return true;
    }

    function addResult(result: DebugResult) {
      if (cancelled) return;
      setResults((current) => [result, ...current]);
    }

    const fallbackId = window.setTimeout(() => {
      const fallbackError = "Browser auth check timed out after 5000ms.";
      const didFinalize = finalizeBrowserAuth({
        session: null,
        user: null,
        sessionError: fallbackError,
        userError: null,
        authEvent: "manual-check",
        cookieNames: getBrowserCookieNames(),
        repairAttempted: false,
        repairError: null,
        timedOut: true,
        serverBrowserMismatch: Boolean(serverSession || serverUser),
      });
      if (!didFinalize) return;

      addResult({
        action: "Browser Auth Load",
        ok: false,
        message: serverSession
          ? "Server auth is authenticated, but browser auth did not resolve before the timeout."
          : fallbackError,
        data: {
          serverHasSession: Boolean(serverSession),
          serverUserId: serverUser?.id ?? null,
          browserHasSession: false,
          browserUserId: null,
          sessionError: fallbackError,
          userError: null,
          repairAttempted: false,
          repairError: null,
          timedOut: true,
          cookieNames: getBrowserCookieNames(),
        },
      });
    }, 5000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (session) {
        finalizeBrowserAuth({
          session,
          user: session.user,
          sessionError: null,
          userError: null,
          authEvent: event,
          cookieNames: getBrowserCookieNames(),
          repairAttempted: false,
          repairError: null,
          timedOut: false,
          serverBrowserMismatch: Boolean(serverUser?.id && serverUser.id !== session.user.id),
        });
        return;
      }

      setBrowserAuth((current) => ({
        ...current,
        loading: false,
        session: null,
        user: current.user,
        authEvent: event,
        cookieNames: getBrowserCookieNames(),
        serverBrowserMismatch: Boolean(serverUser?.id && current.user?.id && serverUser.id !== current.user.id),
      }));
    });

    async function loadBrowserAuth() {
      try {
        await waitForHydrationTick();

        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          "supabase.auth.getSession()"
        );
        const userResult = await withTimeout(
          supabase.auth.getUser(),
          "supabase.auth.getUser()"
        );

        let session = sessionResult.data.session;
        let user = userResult.data.user;
        let repairAttempted = false;
        let repairError: string | null = null;

        if (!session && serverSession?.access_token && serverSession.refresh_token) {
          repairAttempted = true;
          const repairResult = await withTimeout(
            supabase.auth.setSession({
              access_token: serverSession.access_token,
              refresh_token: serverSession.refresh_token,
            }),
            "supabase.auth.setSession()"
          );

          repairError = repairResult.error?.message ?? null;

          if (!repairResult.error) {
            const repairedSession = await withTimeout(
              supabase.auth.getSession(),
              "supabase.auth.getSession() after repair"
            );
            const repairedUser = await withTimeout(
              supabase.auth.getUser(),
              "supabase.auth.getUser() after repair"
            );
            session = repairedSession.data.session;
            user = repairedUser.data.user;
            repairError =
              repairedSession.error?.message ??
              repairedUser.error?.message ??
              null;
          }
        }

        const serverBrowserMismatch = Boolean(
          serverUser?.id && user?.id && serverUser.id !== user.id
        );
        const cookieNames = getBrowserCookieNames();

        const didFinalize = finalizeBrowserAuth({
          session,
          user,
          sessionError: sessionResult.error?.message ?? null,
          userError: userResult.error?.message ?? null,
          authEvent: "manual-check",
          cookieNames,
          repairAttempted,
          repairError,
          timedOut: false,
          serverBrowserMismatch,
        });
        if (!didFinalize) return;

        addResult({
          action: "Browser Auth Load",
          ok: Boolean(user) && !sessionResult.error && !userResult.error && !repairError,
          message:
            serverSession && !user
              ? "Server auth is authenticated, but browser auth did not return a user."
              : repairAttempted
                ? repairError
                  ? "Browser session was missing and repair failed."
                  : "Browser session was missing and was repaired from the server session."
                : "Browser auth loaded.",
          data: {
            serverHasSession: Boolean(serverSession),
            serverUserId: serverUser?.id ?? null,
            browserHasSession: Boolean(session),
            browserUserId: user?.id ?? null,
            sessionError: sessionResult.error,
            userError: userResult.error,
            repairAttempted,
            repairError,
            timedOut: false,
            serverBrowserMismatch,
            cookieNames,
          },
        });
      } catch (error) {
        const message = errorMessage(error);
        const isTimeout = message.includes("timed out");
        const cookieNames = getBrowserCookieNames();

        const didFinalize = finalizeBrowserAuth({
          session: null,
          user: null,
          sessionError: message,
          userError: null,
          authEvent: "manual-check",
          cookieNames,
          repairAttempted: false,
          repairError: null,
          timedOut: isTimeout,
          serverBrowserMismatch: Boolean(serverSession || serverUser),
        });
        if (!didFinalize) return;

        addResult({
          action: "Browser Auth Load",
          ok: false,
          message: serverSession
            ? "Server auth is authenticated, but browser auth failed."
            : "Browser auth failed.",
          data: {
            serverHasSession: Boolean(serverSession),
            serverUserId: serverUser?.id ?? null,
            browserHasSession: false,
            browserUserId: null,
            sessionError: message,
            userError: null,
            repairAttempted: false,
            repairError: null,
            timedOut: isTimeout,
            cookieNames,
          },
        });
      }
    }

    loadBrowserAuth();

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackId);
      subscription.unsubscribe();
    };
  }, [serverSession, serverUser, supabase]);

  async function testWalletInsert() {
    alert("Button clicked");
    setBusy("insert");

    try {
      setResults((current) => [
        {
          action: "Checkpoint",
          ok: true,
          message: "Button clicked and function started",
          data: { time: new Date().toISOString() },
        },
        ...current,
      ]);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      setResults((current) => [
        {
          action: "Session Check",
          ok: !sessionError && !!sessionData.session,
          message: sessionError?.message ?? (sessionData.session ? "Session found" : "No session"),
          data: { sessionData, sessionError },
        },
        ...current,
      ]);

      if (!sessionData.session?.user) return;

      const payload = {
        user_id: sessionData.session.user.id,
        name: "Test Wallet",
        type: "cash",
        balance: 1000,
        color: "#10b981",
        icon: "wallet",
      };

      setResults((current) => [
        {
          action: "Before Insert",
          ok: true,
          message: "About to insert wallet",
          data: { payload },
        },
        ...current,
      ]);

      const response = await supabase
        .from("wallets")
        .insert([payload])
        .select();

      setResults((current) => [
        {
          action: "Insert Response",
          ok: !response.error,
          message: response.error?.message ?? "Insert completed",
          data: response,
        },
        ...current,
      ]);
    } catch (error) {
      setResults((current) => [
        {
          action: "Caught Error",
          ok: false,
          message: error instanceof Error ? error.message : "Unknown error",
          data: { error: String(error) },
        },
        ...current,
      ]);
    } finally {
      setBusy(null);
    }
  }

  async function testWalletRead() {
    setBusy("read");

    try {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .order("created_at", { ascending: false });

      setResults((current) => [
        {
          action: "Test Wallet Read",
          ok: !error,
          message: error ? error.message : `Fetched ${data?.length ?? 0} wallet(s).`,
          data: error ?? data,
        },
        ...current,
      ]);
    } catch (error) {
      setResults((current) => [
        {
          action: "Test Wallet Read",
          ok: false,
          message: error instanceof Error ? error.message : "Unknown read error.",
          data: error,
        },
        ...current,
      ]);
    } finally {
      setBusy(null);
    }
  }

  const browserReady = !browserAuth.loading;
  const hasMatchingUsers =
    Boolean(serverUser?.id) &&
    Boolean(browserAuth.user?.id) &&
    serverUser?.id === browserAuth.user?.id;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Supabase Debug</h1>
        <p className="mt-1 text-sm text-zinc-400">Temporary auth and wallet table test page.</p>
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Environment</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">URL</dt>
            <dd className="break-all text-zinc-100">{envStatus.supabaseUrl}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Anon key</dt>
            <dd className="break-all text-zinc-100">{envStatus.anonKey}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Server Auth</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Session status</dt>
            <dd className={serverSession ? "text-emerald-400" : "text-rose-400"}>
              {serverSession ? "Authenticated session found" : "No server session"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">User ID</dt>
            <dd className="break-all text-zinc-100">{serverUser?.id ?? "None"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">User email</dt>
            <dd className="break-all text-zinc-100">{serverUser?.email ?? "None"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Errors</dt>
            <dd className="break-all text-zinc-100">
              {serverSessionError ?? serverUserError ?? "None"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Browser Auth</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Loading</dt>
            <dd className="text-zinc-100">{String(browserAuth.loading)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Session status</dt>
            <dd className={browserAuth.session ? "text-emerald-400" : "text-rose-400"}>
              {browserAuth.loading
                ? "Checking browser session..."
                : browserAuth.session
                  ? "Authenticated session found"
                  : "No active browser session"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">User ID</dt>
            <dd className="break-all text-zinc-100">{browserAuth.user?.id ?? "None"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">User email</dt>
            <dd className="break-all text-zinc-100">{browserAuth.user?.email ?? "None"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Auth event</dt>
            <dd className="break-all text-zinc-100">{browserAuth.authEvent ?? "None"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Cookie names</dt>
            <dd className="break-all text-zinc-100">
              {browserAuth.cookieNames.length ? browserAuth.cookieNames.join(", ") : "None visible to browser"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Errors</dt>
            <dd className="break-all text-zinc-100">
              {browserAuth.sessionError ?? browserAuth.userError ?? browserAuth.repairError ?? "None"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Repair attempted</dt>
            <dd className="text-zinc-100">{String(browserAuth.repairAttempted)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 text-zinc-500">Server/browser match</dt>
            <dd className={hasMatchingUsers ? "text-emerald-400" : "text-rose-400"}>
              {hasMatchingUsers ? "Same authenticated account" : "Not matched yet"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={testWalletInsert}
          disabled={busy !== null || !browserReady || !browserAuth.session}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "insert" ? "Inserting..." : "Test Wallet Insert"}
        </button>
        <button
          type="button"
          onClick={testWalletRead}
          disabled={busy !== null || !browserReady || !browserAuth.session}
          className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "read" ? "Reading..." : "Test Wallet Read"}
        </button>
        <button
          type="button"
          onClick={() => setResults([])}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100"
        >
          Clear Debug Results
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-100">Debug Results</h2>
        {results.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
            No debug results yet.
          </p>
        ) : (
          results.map((result, index) => (
            <article
              key={`${result.action}-${index}`}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">{result.action}</h3>
                <span className={result.ok ? "text-sm text-emerald-400" : "text-sm text-rose-400"}>
                  {result.ok ? "OK" : "Error"}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-300">{result.message}</p>
              <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-300">
                {formatJson(result.data)}
              </pre>
            </article>
          ))
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Raw Auth Objects</h2>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-300">
          {formatJson({
            serverSession,
            serverUser,
            serverSessionError,
            serverUserError,
            browserSession: browserAuth.session,
            browserUser: browserAuth.user,
            browserSessionError: browserAuth.sessionError,
            browserUserError: browserAuth.userError,
            browserRepairError: browserAuth.repairError,
          })}
        </pre>
      </section>
    </main>
  );
}
