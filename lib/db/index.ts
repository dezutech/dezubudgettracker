// ─── Database singleton ───────────────────────────────────────────────────────
export { db } from "./database";

// ─── Schema / types ───────────────────────────────────────────────────────────
export type {
  // Entities
  DbWallet,
  DbTransaction,
  DbCategory,
  DbBudget,
  DbSyncQueueItem,
  // Enums
  WalletType,
  WalletColor,
  TransactionType,
  CategoryType,
  SyncAction,
  SyncTable,
  SyncStatus,
  // Enums (continued)
  RecurringFrequency,
  // Entities (continued)
  DbRecurringTransaction,
  // Input helpers
  CreateWalletInput,
  UpdateWalletInput,
  CreateTransactionInput,
  UpdateTransactionInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateBudgetInput,
  UpdateBudgetInput,
  CreateRecurringInput,
  UpdateRecurringInput,
  GoalStatus,
  DbGoal,
  CreateGoalInput,
  UpdateGoalInput,
  BillStatus,
  DbBill,
  CreateBillInput,
  UpdateBillInput,
  // Query helpers
  TransactionQuery,
} from "./schema";

// ─── Wallet CRUD ──────────────────────────────────────────────────────────────
export {
  getWallets,
  getWalletById,
  getNetWorth,
  getTotalAssets,
  getTotalDebt,
  createWallet,
  updateWallet,
  adjustWalletBalance,
  archiveWallet,
  deleteWallet,
} from "./wallets";

// ─── Transaction CRUD ─────────────────────────────────────────────────────────
export {
  getTransactions,
  getTransactionById,
  getTransactionsByWallet,
  getMonthlyTotals,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "./transactions";

// ─── Category CRUD ────────────────────────────────────────────────────────────
export {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getNextSortOrder,
  countTransactionsByCategory,
} from "./categories";

// ─── Budget CRUD ──────────────────────────────────────────────────────────────
export {
  getBudgets,
  getBudgetById,
  getBudgetByCategoryMonth,
  createBudget,
  updateBudget,
  deleteBudget,
} from "./budgets";

// ─── Recurring CRUD ───────────────────────────────────────────────────────────
export {
  getRecurringTransactions,
  getRecurringById,
  getUpcomingRecurring,
  createRecurring,
  updateRecurring,
  toggleRecurring,
  deleteRecurring,
  processRecurringTransactions,
  nextOccurrence,
} from "./recurring";

// ─── Goal CRUD ────────────────────────────────────────────────────────────────
export {
  getGoals,
  getGoalById,
  getGoalsByStatus,
  createGoal,
  updateGoal,
  deleteGoal,
  addContribution,
  contributeToGoal,
} from "./goals";

export {
  getBills,
  createBill,
  updateBill,
  archiveBill,
  markBillPaid,
  updateOverdueLocalBills,
  syncRecurringMonthlyBills,
} from "./bills";

// ─── Seed / reset ─────────────────────────────────────────────────────────────
export { seedDatabase, resetDatabase } from "./seed";
