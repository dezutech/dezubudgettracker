import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the OAuth / magic-link / email-confirmation code exchange.
 *
 * Supabase redirects here with ?code=... after:
 *   - Email confirmation from signUp
 *   - Password reset link from resetPasswordForEmail
 *   - OAuth provider if enabled later
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(new URL("/verify-email?status=error", origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const isRecovery =
        searchParams.get("type") === "recovery" ||
        next.startsWith("/reset-password");

      const destination = isRecovery
        ? "/reset-password"
        : "/verify-email?status=success";

      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  return NextResponse.redirect(new URL("/verify-email?status=error", origin));
}
