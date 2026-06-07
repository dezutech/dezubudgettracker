import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const DASHBOARD_PATH = "/dashboard";
const GUEST_MODE_COOKIE = "dezu_guest_mode";

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/callback",
];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function copyAuthCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));

  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  }

  return target;
}

function isSafeNextPath(value: string | null): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return false;
  if (value === "/") return false;
  if (isPublicRoute(value)) return false;
  if (/\.[^/]+$/.test(value)) return false;
  return true;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicRoute(pathname);
  const isGuest = request.cookies.get(GUEST_MODE_COOKIE)?.value === "1";
  const { response, user } = await updateSession(request);

  console.log("[auth:middleware]", {
    pathname,
    isPublic,
    hasUser: Boolean(user),
    isGuest,
    userId: user?.id ?? null,
    cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
    next: request.nextUrl.searchParams.get("next"),
    redirectTarget: null,
  });

  if (!user && !isGuest && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    console.log("[auth:middleware] redirect unauthenticated", {
      from: pathname,
      to: loginUrl.pathname + loginUrl.search,
      hasUser: false,
      userId: null,
      cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
      redirectTarget: loginUrl.pathname + loginUrl.search,
    });
    return copyAuthCookies(response, NextResponse.redirect(loginUrl));
  }

  if (user && isPublic && pathname !== "/auth/callback" && pathname !== "/verify-email") {
    const next = request.nextUrl.searchParams.get("next");
    const destination = isSafeNextPath(next) ? next : DASHBOARD_PATH;
    console.log("[auth:middleware] redirect authenticated auth route", {
      from: pathname,
      to: destination,
      hasUser: true,
      userId: user.id,
      cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
      redirectTarget: destination,
    });
    return copyAuthCookies(
      response,
      NextResponse.redirect(new URL(destination, request.url))
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every path EXCEPT:
     *   - _next/static  (Next.js build output)
     *   - _next/image   (image optimisation)
     *   - favicon / icons / manifest / service-worker
     *   - api routes (no Supabase auth needed for internal APIs)
     */
    "/((?!_next/static|_next/image|_next/|favicon\\.ico|icon\\.svg|icons|manifest\\.json|sw\\.js|api|.*\\.[^/]+$).*)",
  ],
};
