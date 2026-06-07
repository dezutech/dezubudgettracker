import { createClient } from "@/lib/supabase/client";
import { loggedSupabase } from "@/lib/supabase/query";

export type SupabaseCategory = {
  id: string;
  user_id: string;
  name: string;
  type: "income" | "expense";
  icon: string | null;
  color: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  is_deleted: boolean;
};

type DefaultCategory = {
  name: string;
  type: "income" | "expense";
  icon: string;
  color: string;
  is_default: true;
};

export const DEFAULT_SUPABASE_CATEGORIES: DefaultCategory[] = [
  { name: "Food & Dining", type: "expense", icon: "Utensils", color: "orange", is_default: true },
  { name: "Groceries", type: "expense", icon: "ShoppingCart", color: "lime", is_default: true },
  { name: "Transport", type: "expense", icon: "Car", color: "sky", is_default: true },
  { name: "Utilities", type: "expense", icon: "Zap", color: "yellow", is_default: true },
  { name: "Entertainment", type: "expense", icon: "Tv", color: "purple", is_default: true },
  { name: "Shopping", type: "expense", icon: "ShoppingBag", color: "pink", is_default: true },
  { name: "Health", type: "expense", icon: "Heart", color: "rose", is_default: true },
  { name: "Education", type: "expense", icon: "BookOpen", color: "indigo", is_default: true },
  { name: "Rent / Housing", type: "expense", icon: "Home", color: "amber", is_default: true },
  { name: "Subscriptions", type: "expense", icon: "Repeat", color: "violet", is_default: true },
  { name: "Others", type: "expense", icon: "Tag", color: "zinc", is_default: true },
  { name: "Salary", type: "income", icon: "Briefcase", color: "emerald", is_default: true },
  { name: "Freelance", type: "income", icon: "Laptop", color: "teal", is_default: true },
  { name: "Investment", type: "income", icon: "TrendingUp", color: "sky", is_default: true },
  { name: "Gift", type: "income", icon: "Gift", color: "pink", is_default: true },
  { name: "Other Income", type: "income", icon: "CirclePlus", color: "emerald", is_default: true },
];

export async function loadSupabaseCategories(userId?: string | null): Promise<SupabaseCategory[]> {
  if (!userId) return [];

  const supabase = createClient();
  const { data, error } = await loggedSupabase(
    "categories",
    supabase
      .from("categories")
      .select("id,user_id,name,type,icon,color,is_default,created_at,updated_at,synced_at,is_deleted")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .order("type", { ascending: true })
      .order("name", { ascending: true })
  );

  if (error) return [];
  return (data ?? []) as SupabaseCategory[];
}

export async function ensureSupabaseDefaultCategories(userId?: string | null): Promise<SupabaseCategory[]> {
  if (!userId) return [];

  const supabase = createClient();
  const existing = await loadSupabaseCategories(userId);
  if (existing.length > 0) return existing;

  const payload = DEFAULT_SUPABASE_CATEGORIES.map((category) => ({
    ...category,
    user_id: userId,
  }));

  const { error: insertError } = await loggedSupabase(
    "categories seed defaults",
    supabase.from("categories").insert(payload)
  );

  if (insertError && insertError.code !== "23505") return [];

  return loadSupabaseCategories(userId);
}
