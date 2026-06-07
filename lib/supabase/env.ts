const PLACEHOLDER_VALUES = [
  "your-project-ref",
  "your-anon-public-key-here",
  "your-supabase-url",
  "your-supabase-anon-key",
];

function assertConfigured(
  name: string,
  value: string | undefined
): asserts value is string {
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  const lowerValue = value.toLowerCase();
  const hasPlaceholder = PLACEHOLDER_VALUES.some((placeholder) =>
    lowerValue.includes(placeholder)
  );

  if (hasPlaceholder) {
    throw new Error(`${name} still contains a placeholder value.`);
  }
}

function normalizeSupabaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use http or https.");
  }

  return url.origin;
}

export function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  assertConfigured("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
  assertConfigured("NEXT_PUBLIC_SUPABASE_ANON_KEY", supabaseAnonKey);

  return {
    supabaseUrl: normalizeSupabaseUrl(supabaseUrl),
    supabaseAnonKey,
  };
}
