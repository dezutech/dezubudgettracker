import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  // Keep this immediately after createServerClient so refreshed cookies stay in sync.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  console.log("[auth:updateSession]", {
    pathname: request.nextUrl.pathname,
    hasUser: Boolean(user),
    userId: user?.id ?? null,
    error: error?.message ?? null,
    cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
  });

  return { response: supabaseResponse, user };
}
