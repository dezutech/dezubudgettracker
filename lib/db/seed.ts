/**
 * Seed the local IndexedDB with default categories only.
 * This intentionally does not create wallets or transactions.
 */

import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { db } from "./database";
import type { DbCategory } from "./schema";

const DEFAULT_CATEGORIES: Omit<DbCategory, "id" | "userId">[] = [
  { name: "Food & Dining", type: "expense", icon: "Utensils", color: "orange", isDefault: true, sortOrder: 1, createdAt: "", updatedAt: "" },
  { name: "Groceries", type: "expense", icon: "ShoppingCart", color: "lime", isDefault: true, sortOrder: 2, createdAt: "", updatedAt: "" },
  { name: "Transport", type: "expense", icon: "Car", color: "sky", isDefault: true, sortOrder: 3, createdAt: "", updatedAt: "" },
  { name: "Utilities", type: "expense", icon: "Zap", color: "yellow", isDefault: true, sortOrder: 4, createdAt: "", updatedAt: "" },
  { name: "Entertainment", type: "expense", icon: "Tv", color: "purple", isDefault: true, sortOrder: 5, createdAt: "", updatedAt: "" },
  { name: "Shopping", type: "expense", icon: "ShoppingBag", color: "pink", isDefault: true, sortOrder: 6, createdAt: "", updatedAt: "" },
  { name: "Health", type: "expense", icon: "Heart", color: "rose", isDefault: true, sortOrder: 7, createdAt: "", updatedAt: "" },
  { name: "Education", type: "expense", icon: "BookOpen", color: "indigo", isDefault: true, sortOrder: 8, createdAt: "", updatedAt: "" },
  { name: "Rent / Housing", type: "expense", icon: "Home", color: "amber", isDefault: true, sortOrder: 9, createdAt: "", updatedAt: "" },
  { name: "Subscriptions", type: "expense", icon: "Repeat", color: "violet", isDefault: true, sortOrder: 10, createdAt: "", updatedAt: "" },
  { name: "Others", type: "expense", icon: "MoreHorizontal", color: "zinc", isDefault: true, sortOrder: 11, createdAt: "", updatedAt: "" },
  { name: "Salary", type: "income", icon: "Briefcase", color: "emerald", isDefault: true, sortOrder: 20, createdAt: "", updatedAt: "" },
  { name: "Freelance", type: "income", icon: "Laptop", color: "teal", isDefault: true, sortOrder: 21, createdAt: "", updatedAt: "" },
  { name: "Investment", type: "income", icon: "TrendingUp", color: "sky", isDefault: true, sortOrder: 22, createdAt: "", updatedAt: "" },
  { name: "Gift", type: "income", icon: "Gift", color: "pink", isDefault: true, sortOrder: 23, createdAt: "", updatedAt: "" },
  { name: "Other Income", type: "income", icon: "CirclePlus", color: "emerald", isDefault: true, sortOrder: 24, createdAt: "", updatedAt: "" },
];

export async function seedDatabase(userId = OFFLINE_USER_ID): Promise<void> {
  const existingCount = await db.categories.where("userId").equals(userId).count();
  if (existingCount > 0) return;

  const ts = new Date().toISOString();

  await db.transaction("rw", [db.categories], async () => {
    for (const category of DEFAULT_CATEGORIES) {
      await db.categories.add({
        ...category,
        userId,
        createdAt: ts,
        updatedAt: ts,
      } as DbCategory);
    }
  });
}

export async function resetDatabase(userId = OFFLINE_USER_ID): Promise<void> {
  await db.transaction(
    "rw",
    [db.categories, db.wallets, db.transactions, db.budgets, db.syncQueue, db.recurringTransactions, db.goals, db.debts],
    async () => {
      await Promise.all([
        db.categories.where("userId").equals(userId).delete(),
        db.wallets.where("userId").equals(userId).delete(),
        db.transactions.where("userId").equals(userId).delete(),
        db.budgets.where("userId").equals(userId).delete(),
        db.syncQueue.where("userId").equals(userId).delete(),
        db.recurringTransactions.where("userId").equals(userId).delete(),
        db.goals.where("userId").equals(userId).delete(),
        db.debts.where("userId").equals(userId).delete(),
      ]);
    }
  );
}
