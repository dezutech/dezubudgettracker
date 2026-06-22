import { db } from "./database";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import type {
  DbGoal,
  DbSyncQueueItem,
  DbTransaction,
  GoalStatus,
  CreateGoalInput,
  UpdateGoalInput,
} from "./schema";

function now() {
  return new Date().toISOString();
}

function generateSyncId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function logWalletBalanceSync(action: string, details: Record<string, unknown>) {
  console.info("[wallet-balance-sync]", action, details);
}

function buildSyncEntry(
  userId: string,
  action: DbSyncQueueItem["action"],
  table: DbSyncQueueItem["table"],
  recordId: number,
  payload: object
): Omit<DbSyncQueueItem, "id"> {
  const ts = now();
  return {
    action,
    userId,
    table,
    recordId,
    payload: JSON.stringify(payload),
    status: "pending",
    retryCount: 0,
    createdAt: ts,
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getGoals(userId = OFFLINE_USER_ID): Promise<DbGoal[]> {
  return db.goals.where("userId").equals(userId).sortBy("targetDate");
}

export async function getGoalById(id: number): Promise<DbGoal | undefined> {
  return db.goals.get(id);
}

export async function getGoalsByStatus(status: GoalStatus, userId = OFFLINE_USER_ID): Promise<DbGoal[]> {
  return db.goals.where("userId").equals(userId).filter((goal) => goal.status === status).toArray();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createGoal(input: CreateGoalInput): Promise<number> {
  const ts = now();
  return db.goals.add({ ...input, userId: input.userId ?? OFFLINE_USER_ID, createdAt: ts, updatedAt: ts } as DbGoal);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateGoal(
  id: number,
  input: UpdateGoalInput
): Promise<void> {
  await db.goals.update(id, { ...input, updatedAt: now() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteGoal(id: number): Promise<void> {
  await db.goals.delete(id);
}

// ─── Contributions ────────────────────────────────────────────────────────────

/**
 * Add (positive) or withdraw (negative) from a goal's currentAmount.
 * Automatically transitions status:
 *   active → completed when currentAmount reaches targetAmount
 *   completed → active when currentAmount drops below targetAmount
 * currentAmount is always clamped to >= 0.
 */
export async function addContribution(
  id: number,
  amount: number
): Promise<void> {
  await db.transaction("rw", db.goals, async () => {
    const goal = await db.goals.get(id);
    if (!goal) throw new Error(`Goal not found: id=${id}`);

    const newAmount = Math.max(0, goal.currentAmount + amount);
    const updates: Record<string, unknown> = { currentAmount: newAmount, updatedAt: now() };

    // Auto-complete when target is first reached
    if (newAmount >= goal.targetAmount && goal.status === "active") {
      updates.status = "completed";
    }
    // Auto-reactivate if a withdrawal drops below target
    if (newAmount < goal.targetAmount && goal.status === "completed") {
      updates.status = "active";
    }

    await db.goals.update(id, updates);
  });
}

export async function contributeToGoal(input: {
  goalId: number;
  fromWalletId: number;
  amount: number;
  note?: string;
  allowNegativeBalance?: boolean;
}): Promise<void> {
  const ts = now();
  const userId = OFFLINE_USER_ID;

  await db.transaction("rw", [db.goals, db.wallets, db.transactions, db.syncQueue], async () => {
    const goal = await db.goals.get(input.goalId);
    if (!goal) throw new Error(`Goal not found: id=${input.goalId}`);

    const fromWallet = await db.wallets.get(input.fromWalletId);
    if (!fromWallet) throw new Error(`Source wallet not found: id=${input.fromWalletId}`);
    if (!input.allowNegativeBalance && fromWallet.balance < input.amount) {
      throw new Error("Insufficient balance in the selected wallet.");
    }

    const linkedWalletId = goal.walletId;
    const linkedWallet = linkedWalletId != null ? await db.wallets.get(linkedWalletId) : undefined;
    if (linkedWalletId != null && !linkedWallet) {
      throw new Error(`Linked wallet not found: id=${linkedWalletId}`);
    }

    const nextAmount = Math.max(0, goal.currentAmount + input.amount);
    const goalUpdates: Record<string, unknown> = {
      currentAmount: nextAmount,
      updatedAt: ts,
    };
    if (nextAmount >= goal.targetAmount && goal.status === "active") goalUpdates.status = "completed";
    if (nextAmount < goal.targetAmount && goal.status === "completed") goalUpdates.status = "active";

    if (linkedWallet?.id !== input.fromWalletId) {
      logWalletBalanceSync("dexie goal contribution source", {
        goalId: input.goalId,
        walletId: input.fromWalletId,
        type: "transfer",
        amount: input.amount,
        delta: -input.amount,
      });
      await db.wallets.update(input.fromWalletId, {
        balance: fromWallet.balance - input.amount,
        updatedAt: ts,
      });
    }

    if (linkedWallet && linkedWallet.id !== input.fromWalletId) {
      logWalletBalanceSync("dexie goal contribution destination", {
        goalId: input.goalId,
        walletId: linkedWallet.id,
        type: "transfer",
        amount: input.amount,
        delta: input.amount,
      });
      await db.wallets.update(linkedWallet.id, {
        balance: linkedWallet.balance + input.amount,
        updatedAt: ts,
      });
    }

    await db.goals.update(input.goalId, goalUpdates);

    const transaction: Omit<DbTransaction, "id"> = {
      userId,
      walletId: input.fromWalletId,
      toWalletId: linkedWalletId,
      categoryId: 0,
      goalId: input.goalId,
      type: "transfer",
      amount: input.amount,
      date: new Date().toISOString().slice(0, 10),
      name: `Goal contribution: ${goal.name}`,
      notes: input.note?.trim() || undefined,
      syncId: generateSyncId(),
      createdAt: ts,
      updatedAt: ts,
    };

    const transactionId = await db.transactions.add(transaction as DbTransaction);
    await db.syncQueue.add(
      buildSyncEntry(userId, "create", "transactions", transactionId, {
        ...transaction,
        id: transactionId,
      }) as DbSyncQueueItem
    );
    await db.syncQueue.add(
      buildSyncEntry(userId, "update", "goals", input.goalId, {
        ...goal,
        ...goalUpdates,
        id: input.goalId,
      }) as DbSyncQueueItem
    );
  });
}
