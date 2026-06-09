"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db/database";
import type { Database } from "@/lib/supabase/types";
import type {
  DbBill,
  DbBudget,
  DbCategory,
  DbGoal,
  DbRecurringTransaction,
  DbTransaction,
  DbWallet,
} from "@/lib/db/schema";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

export type SyncCountKey = "wallets" | "transactions" | "budgets" | "bills" | "goals" | "recurring" | "transfers";
export type SyncCounts = Record<SyncCountKey, number>;
export type SyncAction = "add" | "merge" | "replace" | "sync";
export type SyncTableStatus = Partial<Record<SyncCountKey, { state: "idle" | "pending" | "done" | "error"; message?: string }>>;

export const SYNC_COUNT_KEYS: SyncCountKey[] = ["wallets", "transactions", "budgets", "bills", "goals", "recurring", "transfers"];
export const EMPTY_SYNC_COUNTS: SyncCounts = {
  wallets: 0,
  transactions: 0,
  budgets: 0,
  bills: 0,
  goals: 0,
  recurring: 0,
  transfers: 0,
};

const BACKUP_PREFIX = "dezu-offline-cloud-sync-backup";
const MIGRATED_KEY = "dezu-offline-data-migrated";
const IGNORED_KEY = "dezu-offline-data-ignored";

type AnySupabase = SupabaseClient<Database>;
type IdMap = Map<number, string>;
type TableName = keyof Database["public"]["Tables"];
type CloudRow = Record<string, unknown> & {
  id: string;
  user_id?: string;
  local_id?: string | null;
  updated_at?: string | null;
  is_deleted?: boolean;
};

type OfflineSnapshot = {
  createdAt: string;
  wallets: DbWallet[];
  categories: DbCategory[];
  transactions: DbTransaction[];
  budgets: DbBudget[];
  bills: DbBill[];
  goals: DbGoal[];
  recurring: DbRecurringTransaction[];
  syncQueue: unknown[];
};

type CloudData = {
  wallets: CloudRow[];
  categories: CloudRow[];
  transactions: CloudRow[];
  budgets: CloudRow[];
  bills: CloudRow[];
  goals: CloudRow[];
  recurring: CloudRow[];
};

type SyncContext = {
  supabase: AnySupabase;
  userId: string;
  mode: Exclude<SyncAction, "sync">;
  offline: OfflineSnapshot;
  cloud: CloudData;
  walletMap: IdMap;
  categoryMap: IdMap;
  goalMap: IdMap;
  recurringMap: IdMap;
  report: (key: SyncCountKey, state: "idle" | "pending" | "done" | "error", message?: string) => void;
};

export function totalSyncCount(counts: SyncCounts) {
  return SYNC_COUNT_KEYS.reduce((sum, key) => sum + counts[key], 0);
}

export function markOfflineDataIgnored() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IGNORED_KEY, new Date().toISOString());
}

export async function markOfflineDataMigrated() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  }
  const now = new Date().toISOString();
  const queue = await db.syncQueue.where("userId").equals(OFFLINE_USER_ID).toArray();
  await Promise.all(queue.map((item) => db.syncQueue.update(item.id, { status: "done", processedAt: now, lastError: undefined })));
}

export async function getOfflineSyncSnapshot(): Promise<OfflineSnapshot> {
  const [wallets, categories, transactions, budgets, bills, goals, recurring, syncQueue] = await Promise.all([
    db.wallets.where("userId").equals(OFFLINE_USER_ID).filter((item) => !item.isArchived).toArray(),
    db.categories.where("userId").equals(OFFLINE_USER_ID).toArray(),
    db.transactions.where("userId").equals(OFFLINE_USER_ID).toArray(),
    db.budgets.where("userId").equals(OFFLINE_USER_ID).toArray(),
    db.bills.where("userId").equals(OFFLINE_USER_ID).filter((item) => !item.isDeleted).toArray(),
    db.goals.where("userId").equals(OFFLINE_USER_ID).toArray(),
    db.recurringTransactions.where("userId").equals(OFFLINE_USER_ID).toArray(),
    db.syncQueue.where("userId").equals(OFFLINE_USER_ID).toArray(),
  ]);

  return {
    createdAt: new Date().toISOString(),
    wallets,
    categories,
    transactions,
    budgets,
    bills,
    goals,
    recurring,
    syncQueue,
  };
}

export function countOfflineSnapshot(snapshot: OfflineSnapshot): SyncCounts {
  return {
    wallets: snapshot.wallets.length,
    transactions: snapshot.transactions.filter((item) => item.type !== "transfer").length,
    transfers: snapshot.transactions.filter((item) => item.type === "transfer").length,
    budgets: snapshot.budgets.length,
    bills: snapshot.bills.length,
    goals: snapshot.goals.length,
    recurring: snapshot.recurring.length,
  };
}

export async function getOfflineSyncCounts() {
  return countOfflineSnapshot(await getOfflineSyncSnapshot());
}

export async function backupOfflineData(reason: string, snapshot?: OfflineSnapshot) {
  if (typeof window === "undefined") return "";
  const data = snapshot ?? await getOfflineSyncSnapshot();
  const key = `${BACKUP_PREFIX}:${Date.now()}`;
  window.localStorage.setItem(key, JSON.stringify({ reason, ...data }));
  return key;
}

async function fetchTable(supabase: AnySupabase, userId: string, table: string) {
  const { data, error } = await supabase
    .from(table as TableName)
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false);
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudRow[];
}

export async function getCloudSyncData(supabase: AnySupabase, userId: string): Promise<CloudData> {
  const [wallets, categories, transactions, budgets, bills, goals, recurring] = await Promise.all([
    fetchTable(supabase, userId, "wallets"),
    fetchTable(supabase, userId, "categories"),
    fetchTable(supabase, userId, "transactions"),
    fetchTable(supabase, userId, "budgets"),
    fetchTable(supabase, userId, "bills"),
    fetchTable(supabase, userId, "goals"),
    fetchTable(supabase, userId, "recurring_transactions"),
  ]);
  return { wallets, categories, transactions, budgets, bills, goals, recurring };
}

export function countCloudData(data: CloudData): SyncCounts {
  return {
    wallets: data.wallets.length,
    transactions: data.transactions.filter((item) => item.transaction_type !== "transfer").length,
    transfers: data.transactions.filter((item) => item.transaction_type === "transfer").length,
    budgets: data.budgets.length,
    bills: data.bills.length,
    goals: data.goals.length,
    recurring: data.recurring.length,
  };
}

function localId(id: number) {
  return String(id);
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function dateMonth(value: string) {
  return value.length === 7 ? `${value}-01` : value;
}

function newer(localUpdatedAt: string, cloudUpdatedAt: string | null | undefined) {
  if (!cloudUpdatedAt) return true;
  return new Date(localUpdatedAt).getTime() > new Date(cloudUpdatedAt).getTime();
}

function byLocalId(rows: CloudRow[], id: number) {
  return rows.find((row) => row.local_id != null && String(row.local_id) === localId(id));
}

async function insertRow(supabase: AnySupabase, table: string, row: Record<string, unknown>) {
  const { data, error } = await supabase.from(table as TableName).insert(row as never).select("*").single();
  if (error) throw new Error(error.message);
  return data as CloudRow;
}

async function updateRow(supabase: AnySupabase, table: string, id: string, row: Record<string, unknown>) {
  const { data, error } = await supabase.from(table as TableName).update(row as never).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as CloudRow;
}

async function deleteUserRows(supabase: AnySupabase, userId: string, table: string) {
  const { error } = await supabase.from(table as TableName).delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

function walletPayload(userId: string, wallet: DbWallet) {
  return {
    user_id: userId,
    local_id: localId(wallet.id),
    name: wallet.name,
    type: wallet.type,
    balance: wallet.balance,
    credit_limit: wallet.limit ?? null,
    color: wallet.color ?? null,
    icon: wallet.icon ?? null,
    logo_url: wallet.logoUrl ?? null,
    created_at: wallet.createdAt,
    updated_at: wallet.updatedAt,
    synced_at: new Date().toISOString(),
    is_deleted: false,
  };
}

function categoryPayload(userId: string, category: DbCategory) {
  return {
    user_id: userId,
    local_id: localId(category.id),
    name: category.name,
    type: category.type === "income" ? "income" : "expense",
    icon: category.icon ?? null,
    color: category.color ?? null,
    is_default: category.isDefault,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
    synced_at: new Date().toISOString(),
    is_deleted: false,
  };
}

function transactionPayload(ctx: SyncContext, tx: DbTransaction) {
  const walletId = ctx.walletMap.get(tx.walletId);
  if (!walletId) throw new Error(`Missing cloud wallet for local transaction ${tx.id}.`);
  const destinationWalletId = tx.toWalletId != null ? ctx.walletMap.get(tx.toWalletId) : null;
  if (tx.toWalletId != null && !destinationWalletId) throw new Error(`Missing destination wallet for local transfer ${tx.id}.`);
  const goalId = tx.goalId != null ? ctx.goalMap.get(tx.goalId) ?? null : null;
  const categoryId = tx.type === "transfer" ? null : ctx.categoryMap.get(tx.categoryId) ?? null;

  return {
    user_id: ctx.userId,
    local_id: localId(tx.id),
    wallet_id: walletId,
    destination_wallet_id: destinationWalletId,
    goal_id: goalId,
    category_id: categoryId,
    amount: tx.amount,
    transaction_type: tx.type,
    description: tx.name,
    notes: tx.notes ?? null,
    transaction_date: tx.date,
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
    synced_at: new Date().toISOString(),
    is_deleted: false,
  };
}

function budgetPayload(ctx: SyncContext, budget: DbBudget) {
  const categoryId = ctx.categoryMap.get(budget.categoryId);
  if (!categoryId) throw new Error(`Missing cloud category for local budget ${budget.id}.`);
  return {
    user_id: ctx.userId,
    local_id: localId(budget.id),
    category_id: categoryId,
    amount: budget.amount,
    month: dateMonth(budget.month),
    created_at: budget.createdAt,
    updated_at: budget.updatedAt,
    synced_at: new Date().toISOString(),
    is_deleted: false,
  };
}

function goalPayload(ctx: SyncContext, goal: DbGoal) {
  return {
    user_id: ctx.userId,
    local_id: localId(goal.id),
    name: goal.name,
    target_amount: goal.targetAmount,
    current_amount: goal.currentAmount,
    wallet_id: goal.walletId != null ? ctx.walletMap.get(goal.walletId) ?? null : null,
    target_date: goal.targetDate || null,
    status: goal.status,
    created_at: goal.createdAt,
    updated_at: goal.updatedAt,
    synced_at: new Date().toISOString(),
    is_deleted: false,
  };
}

function recurringPayload(ctx: SyncContext, recurring: DbRecurringTransaction) {
  return {
    user_id: ctx.userId,
    local_id: localId(recurring.id),
    wallet_id: ctx.walletMap.get(recurring.walletId) ?? null,
    category_id: ctx.categoryMap.get(recurring.categoryId) ?? null,
    title: recurring.title,
    amount: recurring.amount,
    transaction_type: recurring.type === "income" ? "income" : "expense",
    frequency: recurring.frequency,
    next_run_date: recurring.nextRunDate,
    is_active: recurring.isActive,
    created_at: recurring.createdAt,
    updated_at: recurring.updatedAt,
    synced_at: new Date().toISOString(),
    is_deleted: false,
  };
}

function billPayload(ctx: SyncContext, bill: DbBill) {
  const recurringId = bill.recurringId != null ? ctx.recurringMap.get(bill.recurringId) ?? null : null;
  return {
    user_id: ctx.userId,
    local_id: localId(bill.id),
    title: bill.title,
    amount: bill.amount,
    due_date: bill.dueDate,
    category_id: bill.categoryId != null ? ctx.categoryMap.get(bill.categoryId) ?? null : null,
    wallet_id: bill.walletId != null ? ctx.walletMap.get(bill.walletId) ?? null : null,
    status: bill.status,
    notes: bill.notes ?? null,
    is_recurring: Boolean(bill.isRecurring && recurringId),
    recurring_id: recurringId,
    created_at: bill.createdAt,
    updated_at: bill.updatedAt,
    synced_at: new Date().toISOString(),
    is_deleted: false,
  };
}

function findWallet(cloud: CloudRow[], wallet: DbWallet) {
  return byLocalId(cloud, wallet.id)
    ?? cloud.find((row) => normalized(row.name) === normalized(wallet.name) && normalized(row.type) === normalized(wallet.type));
}

function findCategory(cloud: CloudRow[], category: DbCategory) {
  const type = category.type === "income" ? "income" : "expense";
  return byLocalId(cloud, category.id)
    ?? cloud.find((row) => normalized(row.name) === normalized(category.name) && String(row.type) === type);
}

function findTransaction(ctx: SyncContext, tx: DbTransaction) {
  const walletId = ctx.walletMap.get(tx.walletId);
  const destId = tx.toWalletId != null ? ctx.walletMap.get(tx.toWalletId) ?? null : null;
  const categoryId = tx.type === "transfer" ? null : ctx.categoryMap.get(tx.categoryId) ?? null;
  return byLocalId(ctx.cloud.transactions, tx.id)
    ?? ctx.cloud.transactions.find((row) =>
      String(row.wallet_id) === walletId &&
      (row.destination_wallet_id != null ? String(row.destination_wallet_id) : null) === destId &&
      (row.category_id != null ? String(row.category_id) : null) === categoryId &&
      row.transaction_type === tx.type &&
      Number(row.amount) === tx.amount &&
      row.transaction_date === tx.date &&
      normalized(row.description).startsWith(normalized(tx.name))
    );
}

function findBudget(ctx: SyncContext, budget: DbBudget) {
  const categoryId = ctx.categoryMap.get(budget.categoryId);
  return byLocalId(ctx.cloud.budgets, budget.id)
    ?? ctx.cloud.budgets.find((row) => String(row.category_id) === categoryId && row.month === dateMonth(budget.month));
}

function findGoal(ctx: SyncContext, goal: DbGoal) {
  return byLocalId(ctx.cloud.goals, goal.id)
    ?? ctx.cloud.goals.find((row) =>
      normalized(row.name) === normalized(goal.name) &&
      Number(row.target_amount) === goal.targetAmount &&
      (row.target_date ?? "") === (goal.targetDate || "")
    );
}

function findRecurring(ctx: SyncContext, recurring: DbRecurringTransaction) {
  return byLocalId(ctx.cloud.recurring, recurring.id)
    ?? ctx.cloud.recurring.find((row) =>
      normalized(row.title) === normalized(recurring.title) &&
      Number(row.amount) === recurring.amount &&
      row.frequency === recurring.frequency &&
      row.next_run_date === recurring.nextRunDate
    );
}

function findBill(ctx: SyncContext, bill: DbBill) {
  return byLocalId(ctx.cloud.bills, bill.id)
    ?? ctx.cloud.bills.find((row) =>
      normalized(row.title) === normalized(bill.title) &&
      Number(row.amount) === bill.amount &&
      row.due_date === bill.dueDate
    );
}

async function syncOne(
  ctx: SyncContext,
  table: string,
  payload: Record<string, unknown>,
  existing: CloudRow | undefined,
  localUpdatedAt: string
) {
  if (!existing) return insertRow(ctx.supabase, table, payload);
  if (ctx.mode === "merge" && newer(localUpdatedAt, existing.updated_at)) {
    return updateRow(ctx.supabase, table, existing.id, payload);
  }
  return existing;
}

async function syncWallets(ctx: SyncContext) {
  ctx.report("wallets", "pending", "uploading");
  for (const wallet of ctx.offline.wallets) {
    const existing = findWallet(ctx.cloud.wallets, wallet);
    const row = await syncOne(ctx, "wallets", walletPayload(ctx.userId, wallet), existing, wallet.updatedAt);
    ctx.walletMap.set(wallet.id, row.id);
    if (!ctx.cloud.wallets.some((item) => item.id === row.id)) ctx.cloud.wallets.push(row);
  }
  ctx.report("wallets", "done", `${ctx.offline.wallets.length} ready`);
}

async function syncCategories(ctx: SyncContext) {
  for (const category of ctx.offline.categories) {
    const existing = findCategory(ctx.cloud.categories, category);
    const row = await syncOne(ctx, "categories", categoryPayload(ctx.userId, category), existing, category.updatedAt);
    ctx.categoryMap.set(category.id, row.id);
    if (!ctx.cloud.categories.some((item) => item.id === row.id)) ctx.cloud.categories.push(row);
  }
}

async function syncTransactions(ctx: SyncContext) {
  ctx.report("transactions", "pending", "uploading");
  ctx.report("transfers", "pending", "uploading");
  let regular = 0;
  let transfers = 0;
  for (const tx of ctx.offline.transactions) {
    const row = await syncOne(ctx, "transactions", transactionPayload(ctx, tx), findTransaction(ctx, tx), tx.updatedAt);
    if (!ctx.cloud.transactions.some((item) => item.id === row.id)) ctx.cloud.transactions.push(row);
    if (tx.type === "transfer") transfers += 1;
    else regular += 1;
  }
  ctx.report("transactions", "done", `${regular} ready`);
  ctx.report("transfers", "done", `${transfers} ready`);
}

async function syncBudgets(ctx: SyncContext) {
  ctx.report("budgets", "pending", "uploading");
  for (const budget of ctx.offline.budgets) {
    const row = await syncOne(ctx, "budgets", budgetPayload(ctx, budget), findBudget(ctx, budget), budget.updatedAt);
    if (!ctx.cloud.budgets.some((item) => item.id === row.id)) ctx.cloud.budgets.push(row);
  }
  ctx.report("budgets", "done", `${ctx.offline.budgets.length} ready`);
}

async function syncGoals(ctx: SyncContext) {
  ctx.report("goals", "pending", "uploading");
  for (const goal of ctx.offline.goals) {
    const row = await syncOne(ctx, "goals", goalPayload(ctx, goal), findGoal(ctx, goal), goal.updatedAt);
    ctx.goalMap.set(goal.id, row.id);
    if (!ctx.cloud.goals.some((item) => item.id === row.id)) ctx.cloud.goals.push(row);
  }
  ctx.report("goals", "done", `${ctx.offline.goals.length} ready`);
}

async function syncRecurring(ctx: SyncContext) {
  ctx.report("recurring", "pending", "uploading");
  for (const recurring of ctx.offline.recurring) {
    const row = await syncOne(ctx, "recurring_transactions", recurringPayload(ctx, recurring), findRecurring(ctx, recurring), recurring.updatedAt);
    ctx.recurringMap.set(recurring.id, row.id);
    if (!ctx.cloud.recurring.some((item) => item.id === row.id)) ctx.cloud.recurring.push(row);
  }
  ctx.report("recurring", "done", `${ctx.offline.recurring.length} ready`);
}

async function syncBills(ctx: SyncContext) {
  ctx.report("bills", "pending", "uploading");
  for (const bill of ctx.offline.bills) {
    const row = await syncOne(ctx, "bills", billPayload(ctx, bill), findBill(ctx, bill), bill.updatedAt);
    if (!ctx.cloud.bills.some((item) => item.id === row.id)) ctx.cloud.bills.push(row);
  }
  ctx.report("bills", "done", `${ctx.offline.bills.length} ready`);
}

async function replaceCloudData(supabase: AnySupabase, userId: string) {
  await deleteUserRows(supabase, userId, "bills");
  await deleteUserRows(supabase, userId, "recurring_transactions");
  await deleteUserRows(supabase, userId, "transactions");
  await deleteUserRows(supabase, userId, "budgets");
  await deleteUserRows(supabase, userId, "goals");
  await deleteUserRows(supabase, userId, "categories");
  await deleteUserRows(supabase, userId, "wallets");
}

export async function syncOfflineDataToCloud({
  supabase,
  userId,
  action,
  onStatus,
}: {
  supabase: AnySupabase;
  userId: string;
  action: SyncAction;
  onStatus?: (key: SyncCountKey, state: "idle" | "pending" | "done" | "error", message?: string) => void;
}) {
  const mode: Exclude<SyncAction, "sync"> = action === "sync" ? "add" : action;
  const offline = await getOfflineSyncSnapshot();
  const backupKey = await backupOfflineData(action, offline);

  let cloud = await getCloudSyncData(supabase, userId);
  if (mode === "replace") {
    for (const key of SYNC_COUNT_KEYS) onStatus?.(key, "pending", "replacing");
    await replaceCloudData(supabase, userId);
    cloud = { wallets: [], categories: [], transactions: [], budgets: [], bills: [], goals: [], recurring: [] };
  }

  const ctx: SyncContext = {
    supabase,
    userId,
    mode,
    offline,
    cloud,
    walletMap: new Map(),
    categoryMap: new Map(),
    goalMap: new Map(),
    recurringMap: new Map(),
    report: (key, state, message) => onStatus?.(key, state, message),
  };

  try {
    await syncWallets(ctx);
    await syncCategories(ctx);
    await syncGoals(ctx);
    await syncTransactions(ctx);
    await syncBudgets(ctx);
    await syncRecurring(ctx);
    await syncBills(ctx);
    await markOfflineDataMigrated();
    return { backupKey, counts: countOfflineSnapshot(offline), cloud: await getCloudSyncData(supabase, userId) };
  } catch (error) {
    for (const key of SYNC_COUNT_KEYS) onStatus?.(key, "error", key === "wallets" ? "failed" : "not completed");
    throw error;
  }
}
