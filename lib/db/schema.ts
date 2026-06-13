// ─── Wallet ───────────────────────────────────────────────────────────────────

export type WalletType =
  | "Bank Account"
  | "Cash"
  | "E-Wallet"
  | "Credit Card"
  | "BNPL";

export type WalletColor = "emerald" | "amber" | "violet" | "sky" | "rose";

export type DbWallet = {
  id: number;
  userId: string;
  name: string;
  type: WalletType;
  color: WalletColor | string;
  balance: number;    // maintained automatically on transaction CRUD
  currency: string;   // base currency code
  limit?: number | null; // credit cards only
  icon?: string;
  logoUrl?: string;
  isArchived: boolean;
  createdAt: string;  // ISO timestamp
  updatedAt: string;
};

// ─── Transaction ──────────────────────────────────────────────────────────────

export type TransactionType = "income" | "expense" | "transfer";

export type DbTransaction = {
  id: number;
  userId: string;
  walletId: number;
  categoryId: number;
  toWalletId?: number;  // transfer destination
  goalId?: number;
  debtId?: number;
  debtType?: DebtType;
  personName?: string;
  type: TransactionType;
  amount: number;       // always positive
  date: string;         // ISO date "2025-05-28"
  name: string;         // description / payee
  notes?: string;
  syncId: string;       // UUID — for future Supabase sync
  createdAt: string;
  updatedAt: string;
};

// ─── Category ────────────────────────────────────────────────────────────────

export type CategoryType = "income" | "expense" | "both";

export type DbCategory = {
  id: number;
  userId: string;
  name: string;
  type: CategoryType;
  icon: string;         // lucide icon name, e.g. "Utensils"
  color: string;        // tailwind color key, e.g. "orange"
  isDefault: boolean;   // system-seeded vs user-created
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

// ─── Budget ──────────────────────────────────────────────────────────────────

export type DbBudget = {
  id: number;
  userId: string;
  categoryId: number;
  amount: number;
  month: string;     // "YYYY-MM" e.g. "2026-05"
  createdAt: string;
  updatedAt: string;
};

// ─── RecurringTransaction ─────────────────────────────────────────────────────

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurringStatus = "active" | "paused" | "completed";
export type RecurringEndCondition = "forever" | "end_date" | "occurrences";

export type DbRecurringTransaction = {
  id: number;
  userId: string;
  title: string;
  amount: number;
  type: TransactionType;          // "income" | "expense" (no transfer for recurring)
  categoryId: number;
  walletId: number;
  frequency: RecurringFrequency;
  nextRunDate: string;            // ISO date "YYYY-MM-DD" — when to fire next
  isActive: boolean;              // kept for backward compat; derived from status
  status?: RecurringStatus;       // 'active' | 'paused' | 'completed'
  endCondition?: RecurringEndCondition; // how the schedule ends
  endDate?: string;               // ISO date — used when endCondition = 'end_date'
  maxOccurrences?: number;        // used when endCondition = 'occurrences'
  occurrencesCount?: number;      // how many transactions have been generated
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Goal ────────────────────────────────────────────────────────────────────

export type GoalStatus = "active" | "completed" | "paused";

export type DbGoal = {
  id: number;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;    // ISO date "YYYY-MM-DD"
  walletId?: number;     // optional wallet link for context
  status: GoalStatus;
  icon?: string;         // lucide icon name, e.g. "Target"
  color?: string;        // tailwind color key, e.g. "emerald"
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type BillStatus = "unpaid" | "paid" | "overdue" | "scheduled";

export type DbBill = {
  id: number;
  userId: string;
  title: string;
  amount: number;
  dueDate: string;
  categoryId: number | null;
  walletId: number | null;
  status: BillStatus;
  notes?: string;
  isRecurring: boolean;
  recurringId?: number | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DebtType = "i_owe" | "owes_me";
export type DebtStatus = "active" | "paid" | "overdue";

export type DbDebt = {
  id: number;
  userId: string;
  personName: string;
  debtType: DebtType;
  walletId: number | null;
  originalAmount: number;
  remainingBalance: number;
  borrowedDate: string;
  dueDate: string | null;
  notes?: string;
  status: DebtStatus;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};

// ─── SyncQueue ───────────────────────────────────────────────────────────────

export type SyncAction = "create" | "update" | "delete";
export type SyncTable = "wallets" | "transactions" | "categories" | "budgets" | "recurringTransactions" | "goals" | "bills" | "debts";
export type SyncStatus = "pending" | "syncing" | "done" | "failed";

export type DbSyncQueueItem = {
  id: number;
  userId: string;
  action: SyncAction;
  table: SyncTable;
  recordId: number;
  payload: string;        // JSON-serialised record snapshot
  status: SyncStatus;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  processedAt?: string;
};

// ─── Input helpers (strip auto-managed fields before insert) ─────────────────

export type CreateWalletInput = Omit<DbWallet, "id" | "createdAt" | "updatedAt">;
export type UpdateWalletInput = Partial<Omit<DbWallet, "id" | "createdAt" | "updatedAt">>;

export type CreateTransactionInput = Omit<DbTransaction, "id" | "syncId" | "createdAt" | "updatedAt">;
export type UpdateTransactionInput = Partial<Omit<DbTransaction, "id" | "syncId" | "createdAt" | "updatedAt">>;

export type CreateCategoryInput = Omit<DbCategory, "id" | "createdAt" | "updatedAt">;
export type UpdateCategoryInput = Partial<Omit<DbCategory, "id" | "createdAt" | "updatedAt">>;

export type CreateBudgetInput = Omit<DbBudget, "id" | "createdAt" | "updatedAt">;
export type UpdateBudgetInput = Partial<Omit<DbBudget, "id" | "createdAt" | "updatedAt">>;

export type CreateRecurringInput = Omit<DbRecurringTransaction, "id" | "createdAt" | "updatedAt">;
export type UpdateRecurringInput = Partial<Omit<DbRecurringTransaction, "id" | "createdAt" | "updatedAt">>;

// ─── Recurring helpers (re-exported for convenience) ─────────────────────────
// RecurringStatus and RecurringEndCondition are already exported above.

export type CreateGoalInput = Omit<DbGoal, "id" | "createdAt" | "updatedAt">;
export type UpdateGoalInput = Partial<Omit<DbGoal, "id" | "createdAt" | "updatedAt">>;

export type CreateBillInput = Omit<DbBill, "id" | "createdAt" | "updatedAt">;
export type UpdateBillInput = Partial<Omit<DbBill, "id" | "createdAt" | "updatedAt">>;

export type CreateDebtInput = Omit<DbDebt, "id" | "createdAt" | "updatedAt">;
export type UpdateDebtInput = Partial<Omit<DbDebt, "id" | "createdAt" | "updatedAt">>;

// ─── Query helpers ───────────────────────────────────────────────────────────

export type TransactionQuery = {
  userId?: string;
  walletId?: number;
  categoryId?: number;
  type?: TransactionType;
  startDate?: string; // ISO date inclusive
  endDate?: string;   // ISO date inclusive
  limit?: number;
  offset?: number;
};
