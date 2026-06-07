import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { SupabaseDebugClient } from "./supabase-debug-client";

export const dynamic = "force-dynamic";

function maskKey(value: string) {
  return `${value.slice(0, 12)}...${value.slice(-8)} (${value.length} chars)`;
}

export default async function SupabaseDebugPage() {
  const supabase = await createClient();
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  const [sessionResult, userResult] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  return (
    <SupabaseDebugClient
      serverSession={sessionResult.data.session}
      serverSessionError={sessionResult.error?.message ?? null}
      serverUser={userResult.data.user}
      serverUserError={userResult.error?.message ?? null}
      envStatus={{
        supabaseUrl,
        anonKey: maskKey(supabaseAnonKey),
      }}
    />
  );
}
