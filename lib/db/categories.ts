import { db } from "./database";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import type { DbCategory, CreateCategoryInput, UpdateCategoryInput } from "./schema";

function now() {
  return new Date().toISOString();
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getCategories(userId = OFFLINE_USER_ID): Promise<DbCategory[]> {
  return db.categories.where("userId").equals(userId).sortBy("sortOrder");
}

export async function getCategoryById(
  id: number
): Promise<DbCategory | undefined> {
  return db.categories.get(id);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCategory(
  input: CreateCategoryInput
): Promise<number> {
  const ts = now();
  return db.categories.add({
    ...input,
    userId: input.userId ?? OFFLINE_USER_ID,
    createdAt: ts,
    updatedAt: ts,
  } as DbCategory);
}

/**
 * Returns the next sortOrder value for a user-created category.
 * System defaults use 1–99; user categories start at 100.
 */
export async function getNextSortOrder(): Promise<number> {
  const last = await db.categories.orderBy("sortOrder").last();
  return Math.max(last?.sortOrder ?? 0, 99) + 10;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateCategory(
  id: number,
  input: UpdateCategoryInput
): Promise<void> {
  await db.categories.update(id, { ...input, updatedAt: now() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Hard-delete a category.
 * Existing transactions keep their categoryId but it becomes an orphan.
 * Only call this for non-default (user-created) categories.
 */
export async function deleteCategory(id: number): Promise<void> {
  await db.categories.delete(id);
}

/** Count how many transactions use a given category. */
export async function countTransactionsByCategory(
  categoryId: number,
  userId = OFFLINE_USER_ID
): Promise<number> {
  return db.transactions.where("categoryId").equals(categoryId).filter((tx) => tx.userId === userId).count();
}
