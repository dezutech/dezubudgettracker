import Dexie, { type EntityTable } from "dexie";
import type {
  DbWallet,
  DbTransaction,
  DbCategory,
  DbBudget,
  DbSyncQueueItem,
  DbRecurringTransaction,
  DbGoal,
  DbBill,
  DbDebt,
} from "./schema";

// ─── Database class ───────────────────────────────────────────────────────────

class DesuBudgetDB extends Dexie {
  wallets!: EntityTable<DbWallet, "id">;
  transactions!: EntityTable<DbTransaction, "id">;
  categories!: EntityTable<DbCategory, "id">;
  budgets!: EntityTable<DbBudget, "id">;
  syncQueue!: EntityTable<DbSyncQueueItem, "id">;
  recurringTransactions!: EntityTable<DbRecurringTransaction, "id">;
  goals!: EntityTable<DbGoal, "id">;
  bills!: EntityTable<DbBill, "id">;
  debts!: EntityTable<DbDebt, "id">;

  constructor() {
    super("dezuBudgetDB");

    this.version(1).stores({
      // Dexie index syntax:
      //   ++id       → auto-increment primary key
      //   name       → non-unique index
      //   &name      → unique index
      //   [a+b]      → compound index
      //   *tags      → multi-entry index
      wallets:
        "++id, name, type, isArchived",

      transactions:
        "++id, walletId, categoryId, type, date, syncId, [walletId+date], [type+date]",

      categories:
        "++id, name, type, isDefault, sortOrder",

      budgets:
        "++id, categoryId, walletId, period, isActive",

      syncQueue:
        "++id, table, recordId, status, [table+status], createdAt",
    });

    // Version 2: replace budget schema (month-based, no period/walletId/isActive)
    this.version(2).stores({
      budgets: "++id, categoryId, month, [categoryId+month]",
    });

    // Version 3: add recurringTransactions table
    this.version(3).stores({
      recurringTransactions: "++id, nextRunDate, isActive, walletId, categoryId",
    });

    // Version 4: add goals table
    this.version(4).stores({
      goals: "++id, status, targetDate, walletId",
    });

    // Version 5: scope all local data by mode/account.
    // Existing unscoped rows are intentionally left unscoped so guest mode
    // cannot accidentally display data from a previous session.
    this.version(5).stores({
      wallets: "++id, userId, name, type, isArchived, [userId+isArchived]",
      transactions: "++id, userId, walletId, categoryId, type, date, syncId, [userId+date], [userId+type+date], [walletId+date], [type+date]",
      categories: "++id, userId, name, type, isDefault, sortOrder, [userId+sortOrder]",
      budgets: "++id, userId, categoryId, month, [userId+month], [categoryId+month]",
      syncQueue: "++id, userId, table, recordId, status, [userId+table+status], [table+status], createdAt",
      recurringTransactions: "++id, userId, nextRunDate, isActive, walletId, categoryId, [userId+nextRunDate]",
      goals: "++id, userId, status, targetDate, walletId, [userId+targetDate]",
    });

    this.version(6).stores({
      bills: "++id, userId, dueDate, status, recurringId, isDeleted, [userId+dueDate], [userId+status], [userId+recurringId+dueDate]",
    });

    this.version(7).stores({
      debts: "++id, userId, debtType, status, dueDate, isDeleted, [userId+status], [userId+debtType], [userId+dueDate]",
    });

    this.version(8).stores({
      transactions: "++id, userId, walletId, categoryId, type, date, syncId, debtId, [userId+date], [userId+type+date], [userId+debtId], [walletId+date], [type+date]",
      debts: "++id, userId, debtType, walletId, status, dueDate, isDeleted, [userId+status], [userId+debtType], [userId+dueDate]",
    });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
// Dexie / IndexedDB is browser-only.
// This module should only be imported by "use client" components or lib files
// that are themselves only called from client components.

export const db = new DesuBudgetDB();

export type { DesuBudgetDB };
