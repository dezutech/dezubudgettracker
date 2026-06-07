type SupabaseLikeError = {
  message: string;
};

type SafeTimeoutResult = {
  data: unknown[];
  error: SupabaseLikeError;
  timedOut: true;
};

type SafeFailureResult = {
  data: unknown[];
  error: SupabaseLikeError;
  timedOut?: false;
};

export function withSupabaseTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  timeoutMs = 8000
): Promise<T> {
  return new Promise<T>((resolve) => {
    console.log(`START ${label}`);
    const timeoutId = window.setTimeout(() => {
      console.log(`TIMEOUT ${label}`);
      resolve({
        data: [],
        error: { message: `${label} timed out after ${timeoutMs}ms.` },
        timedOut: true,
      } as T);
    }, timeoutMs);

    Promise.resolve(promise)
      .then((result) => {
        console.log(`END ${label}`);
        resolve(result);
      })
      .catch((error) => {
        console.log(`END ${label}`);
        resolve({
          data: [],
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
          timedOut: false,
        } as T);
      })
      .finally(() => window.clearTimeout(timeoutId));
  });
}

export async function loggedSupabase<T>(
  label: string,
  promise: PromiseLike<T>,
  timeoutMs = 8000
): Promise<T> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  console.info(`[supabase:${label}] started`);
  const result = await withSupabaseTimeout(promise, label, timeoutMs);
  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const durationMs = Math.round(endedAt - startedAt);
  const maybeError = result && typeof result === "object" && "error" in result
    ? (result as { error?: { message?: string } | null }).error
    : null;
  const timedOut = result && typeof result === "object" && "timedOut" in result
    ? Boolean((result as { timedOut?: boolean }).timedOut)
    : false;

  if (maybeError) {
    console.warn(`[supabase:${label}] warning in ${durationMs}ms`, {
      message: maybeError.message ?? maybeError,
      timedOut,
    });
  } else if (durationMs > 2000) {
    console.warn(`[supabase:${label}] slow query in ${durationMs}ms`);
  } else {
    console.info(`[supabase:${label}] done in ${durationMs}ms`);
  }

  return result;
}

export function settledError(result: PromiseSettledResult<unknown>): string | null {
  if (result.status === "rejected") {
    return result.reason instanceof Error ? result.reason.message : String(result.reason);
  }

  const value = result.value;
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: { message?: string } | null }).error;
    return error?.message ?? null;
  }

  return null;
}

export type { SafeFailureResult, SafeTimeoutResult };
