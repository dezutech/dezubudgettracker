import { db } from "./database";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import type {
  DbTransaction,
  DbSyncQueueItem,
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionQuery,
} from "./schema";

// ─── helpers ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function generateSyncId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments where crypto.randomUUID isn't available
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Balance delta for a transaction: positive = wallet gains, negative = wallet loses. */
function balanceDelta(type: DbTransaction["type"], amount: number): number {
  if (type === "income") return amount;
  if (type === "expense") return -amount;
  return 0; // transfer handled separately (two-wallet update)
}

function buildSyncEntry(
  userId: string,
  action: DbSyncQueueItem["action"],
  table: DbSyncQueueItem["table"],
  recordId: number,
  payload: object
): Omit<DbSyncQueueItem, "id"> {
  return {
    action,
    userId,
    table,
    recordId,
    payload: JSON.stringify(payload),
    status: "pending",
    retryCount: 0,
    createdAt: now(),
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** All transactions matching optional query filters, newest-first. */
export async function getTransactions(
  query: TransactionQuery = {}
): Promise<DbTransaction[]> {
  const userId = query.userId ?? OFFLINE_USER_ID;
  let results = await db.transactions.orderBy("date").reverse().toArray();
  results = results.filter((t) => t.userId === userId);

  if (query.walletId !== undefined)
    results = results.filter((t) => t.walletId === query.walletId);

  if (query.categoryId !== undefined)
    results = results.filter((t) => t.categoryId === query.categoryId);

  if (query.type !== undefined)
    results = results.filter((t) => t.type === query.type);

  if (query.startDate !== undefined)
    results = results.filter((t) => t.date >= query.startDate!);

  if (query.endDate !== undefined)
    results = results.filter((t) => t.date <= query.endDate!);

  const offset = query.offset ?? 0;
  if (query.limit !== undefined)
    results = results.slice(offset, offset + query.limit);
  else if (offset > 0)
    results = results.slice(offset);

  return results;
}

/** Single transaction by primary key. */
export async function getTransactionById(
  id: number
): Promise<DbTransaction | undefined> {
  return db.transactions.get(id);
}

/** Transactions for a specific wallet, newest-first. */
export async function getTransactionsByWallet(
  walletId: number
): Promise<DbTransaction[]> {
  return db.transactions
    .where("[walletId+date]")
    .between([walletId, ""], [walletId, "9999-99-99"], true, true)
    .reverse()
    .toArray();
}

/** Sum income and expenses for a date range. */
export async function getMonthlyTotals(
  year: number,
  month: number // 1-12
): Promise<{ income: number; expenses: number }> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const end = `${year}-${pad(month)}-31`;

  const txs = await getTransactions({ startDate: start, endDate: end });

  const income = txs
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);

  const expenses = txs
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  return { income, expenses };
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Add a transaction and update the wallet balance atomically.
 * For transfers, pass `toWalletId` — both wallets are updated in the same Dexie transaction.
 * Returns the new transaction id.
 */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<number> {
  const ts = now();
  const userId = input.userId ?? OFFLINE_USER_ID;

  return db.transaction(
    "rw",
    [db.transactions, db.wallets, db.syncQueue],
    async () => {
      // 1. Persist transaction
      const newTx: Omit<DbTransaction, "id"> = {
        ...input,
        userId,
        syncId: generateSyncId(),
        createdAt: ts,
        updatedAt: ts,
      };
      const id = await db.transactions.add(newTx as DbTransaction);

      // 2. Update source wallet balance
      const sourceWallet = await db.wallets.get(input.walletId);
      if (!sourceWallet)
        throw new Error(`Source wallet not found: id=${input.walletId}`);

      await db.wallets.update(input.walletId, {
        balance: sourceWallet.balance + balanceDelta(input.type, input.amount),
        updatedAt: ts,
      });

      // 3. If transfer: credit the destination wallet too
      if (input.type === "transfer" && input.toWalletId != null) {
        const destWallet = await db.wallets.get(input.toWalletId);
        if (!destWallet)
          throw new Error(`Destination wallet not found: id=${input.toWalletId}`);
        await db.wallets.update(input.toWalletId, {
          balance: destWallet.balance + input.amount,
          updatedAt: ts,
        });
      }

      // 4. Queue for future sync
      await db.syncQueue.add(
        buildSyncEntry(userId, "create", "transactions", id, {
          ...newTx,
          id,
        }) as DbSyncQueueItem
      );

      return id;
    }
  );
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Update a transaction and reconcile wallet balances atomically.
 * Reverses the old transaction's balance effect, then applies the new one.
 * Handles wallet changes (e.g. moving a transaction to a different wallet).
 */
export async function updateTransaction(
  id: number,
  input: UpdateTransactionInput
): Promise<void> {
  const ts = now();

  await db.transaction(
    "rw",
    [db.transactions, db.wallets, db.syncQueue],
    async () => {
      // Fetch current state
      const existing = await db.transactions.get(id);
      if (!existing) throw new Error(`Transaction not found: id=${id}`);

      // ── Step 1: reverse old balance effect ──
      const oldSourceWallet = await db.wallets.get(existing.walletId);
      if (oldSourceWallet) {
        await db.wallets.update(existing.walletId, {
          balance:
            oldSourceWallet.balance -
            balanceDelta(existing.type, existing.amount),
          updatedAt: ts,
        });
      }
      if (existing.type === "transfer" && existing.toWalletId != null) {
        const oldDest = await db.wallets.get(existing.toWalletId);
        if (oldDest) {
          await db.wallets.update(existing.toWalletId, {
            balance: oldDest.balance - existing.amount,
            updatedAt: ts,
          });
        }
      }

      // ── Step 2: apply new balance effect ──
      const updated: DbTransaction = {
        ...existing,
        ...input,
        updatedAt: ts,
      };

      const newSourceWallet = await db.wallets.get(updated.walletId);
      if (newSourceWallet) {
        await db.wallets.update(updated.walletId, {
          balance:
            newSourceWallet.balance +
            balanceDelta(updated.type, updated.amount),
          updatedAt: ts,
        });
      }
      if (updated.type === "transfer" && updated.toWalletId != null) {
        const newDest = await db.wallets.get(updated.toWalletId);
        if (newDest) {
          await db.wallets.update(updated.toWalletId, {
            balance: newDest.balance + updated.amount,
            updatedAt: ts,
          });
        }
      }

      // ── Step 3: persist updated transaction ──
      await db.transactions.put(updated);

      // ── Step 4: queue for sync ──
      await db.syncQueue.add(
        buildSyncEntry(existing.userId ?? OFFLINE_USER_ID, "update", "transactions", id, updated) as DbSyncQueueItem
      );
    }
  );
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a transaction and reverse its wallet balance effect atomically.
 */
export async function deleteTransaction(id: number): Promise<void> {
  const ts = now();

  await db.transaction(
    "rw",
    [db.transactions, db.wallets, db.syncQueue],
    async () => {
      const tx = await db.transactions.get(id);
      if (!tx) return; // already gone

      // Reverse balance on source wallet
      const sourceWallet = await db.wallets.get(tx.walletId);
      if (sourceWallet) {
        await db.wallets.update(tx.walletId, {
          balance:
            sourceWallet.balance - balanceDelta(tx.type, tx.amount),
          updatedAt: ts,
        });
      }

      // Reverse balance on transfer destination
      if (tx.type === "transfer" && tx.toWalletId != null) {
        const destWallet = await db.wallets.get(tx.toWalletId);
        if (destWallet) {
          await db.wallets.update(tx.toWalletId, {
            balance: destWallet.balance - tx.amount,
            updatedAt: ts,
          });
        }
      }

      await db.transactions.delete(id);

      await db.syncQueue.add(
        buildSyncEntry(tx.userId ?? OFFLINE_USER_ID, "delete", "transactions", id, {
          id,
        }) as DbSyncQueueItem
      );
    }
  );
}
