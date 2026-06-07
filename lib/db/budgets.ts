import { db } from "./database";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import type { DbBudget, CreateBudgetInput, UpdateBudgetInput } from "./schema";

function now() {
  return new Date().toISOString();
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getBudgets(month?: string, userId = OFFLINE_USER_ID): Promise<DbBudget[]> {
  const budgets = month
    ? await db.budgets.where("[userId+month]").equals([userId, month]).toArray()
    : await db.budgets.where("userId").equals(userId).toArray();
  return budgets;
}

export async function getBudgetById(id: number): Promise<DbBudget | undefined> {
  return db.budgets.get(id);
}

export async function getBudgetByCategoryMonth(
  categoryId: number,
  month: string,
  userId = OFFLINE_USER_ID
): Promise<DbBudget | undefined> {
  return db.budgets
    .where("[userId+month]")
    .equals([userId, month])
    .filter((budget) => budget.categoryId === categoryId)
    .first();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createBudget(input: CreateBudgetInput): Promise<number> {
  const ts = now();
  return db.budgets.add({ ...input, userId: input.userId ?? OFFLINE_USER_ID, createdAt: ts, updatedAt: ts } as DbBudget);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateBudget(
  id: number,
  input: UpdateBudgetInput
): Promise<void> {
  await db.budgets.update(id, { ...input, updatedAt: now() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteBudget(id: number): Promise<void> {
  await db.budgets.delete(id);
}
