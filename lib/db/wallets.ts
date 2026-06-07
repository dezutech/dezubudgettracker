import { db } from "./database";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import type {
  DbWallet,
  CreateWalletInput,
  UpdateWalletInput,
} from "./schema";

// ─── helpers ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** All non-archived wallets for a user, ordered by creation date. */
export async function getWallets(userId = OFFLINE_USER_ID): Promise<DbWallet[]> {
  return db.wallets
    .filter((w) => w.userId === userId && !w.isArchived)
    .toArray()
    .then((ws) => ws.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
}

/** Single wallet by primary key. */
export async function getWalletById(id: number): Promise<DbWallet | undefined> {
  return db.wallets.get(id);
}

/** Sum of all non-archived wallet balances (assets minus credit-card debt). */
export async function getNetWorth(): Promise<number> {
  const wallets = await getWallets();
  return wallets.reduce((sum, w) => sum + w.balance, 0);
}

/** Total liquid assets (positive balances only). */
export async function getTotalAssets(): Promise<number> {
  const wallets = await getWallets();
  return wallets
    .filter((w) => w.balance > 0)
    .reduce((sum, w) => sum + w.balance, 0);
}

/** Total debt (sum of absolute values of negative balances). */
export async function getTotalDebt(): Promise<number> {
  const wallets = await getWallets();
  return wallets
    .filter((w) => w.balance < 0)
    .reduce((sum, w) => sum + Math.abs(w.balance), 0);
}

// ─── Create ───────────────────────────────────────────────────────────────────

/** Add a new wallet. Returns the auto-assigned id. */
export async function createWallet(input: CreateWalletInput): Promise<number> {
  const ts = now();
  return db.wallets.add({
    ...input,
    userId: input.userId ?? OFFLINE_USER_ID,
    createdAt: ts,
    updatedAt: ts,
  } as DbWallet);
}

// ─── Update ───────────────────────────────────────────────────────────────────

/** Partially update wallet fields (except id / timestamps). */
export async function updateWallet(
  id: number,
  input: UpdateWalletInput
): Promise<void> {
  await db.wallets.update(id, { ...input, updatedAt: now() });
}

/**
 * Atomically adjust a wallet's balance by `delta`.
 * Positive delta = credit (income / transfer-in).
 * Negative delta = debit (expense / transfer-out).
 */
export async function adjustWalletBalance(
  walletId: number,
  delta: number
): Promise<void> {
  await db.transaction("rw", db.wallets, async () => {
    const wallet = await db.wallets.get(walletId);
    if (!wallet) throw new Error(`Wallet not found: id=${walletId}`);
    await db.wallets.update(walletId, {
      balance: wallet.balance + delta,
      updatedAt: now(),
    });
  });
}

// ─── Delete / Archive ─────────────────────────────────────────────────────────

/**
 * Soft-delete: mark wallet as archived.
 * Archived wallets are excluded from queries but transactions are preserved.
 */
export async function archiveWallet(id: number): Promise<void> {
  await db.wallets.update(id, { isArchived: true, updatedAt: now() });
}

/**
 * Hard-delete: permanently remove the wallet row.
 * WARNING: does NOT delete associated transactions. Use archiveWallet unless
 * you also clean up transactions separately.
 */
export async function deleteWallet(id: number): Promise<void> {
  await db.wallets.delete(id);
}
