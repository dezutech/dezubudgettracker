import { db } from "./database";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { createTransaction } from "./transactions";
import type {
  DbRecurringTransaction,
  CreateRecurringInput,
  UpdateRecurringInput,
  RecurringFrequency,
} from "./schema";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function todayIso(): string {
  return toIsoDate(new Date());
}

export function nextOccurrence(date: string, frequency: RecurringFrequency): string {
  const d = new Date(date + "T00:00:00");
  switch (frequency) {
    case "daily":   d.setDate(d.getDate() + 1);          break;
    case "weekly":  d.setDate(d.getDate() + 7);          break;
    case "monthly": d.setMonth(d.getMonth() + 1);        break;
    case "yearly":  d.setFullYear(d.getFullYear() + 1);  break;
  }
  return toIsoDate(d);
}

function now() {
  return new Date().toISOString();
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getRecurringTransactions(userId = OFFLINE_USER_ID): Promise<DbRecurringTransaction[]> {
  return db.recurringTransactions.where("userId").equals(userId).sortBy("nextRunDate");
}

export async function getRecurringById(
  id: number
): Promise<DbRecurringTransaction | undefined> {
  return db.recurringTransactions.get(id);
}

/** Recurring transactions due within the next `days` days (active only). */
export async function getUpcomingRecurring(
  days = 30,
  userId = OFFLINE_USER_ID
): Promise<DbRecurringTransaction[]> {
  const today   = todayIso();
  const future  = new Date();
  future.setDate(future.getDate() + days);
  const futureStr = toIsoDate(future);

  return db.recurringTransactions
    .where("userId")
    .equals(userId)
    .filter((r) => r.isActive && r.nextRunDate >= today && r.nextRunDate <= futureStr)
    .toArray();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createRecurring(
  input: CreateRecurringInput
): Promise<number> {
  const ts = now();
  return db.recurringTransactions.add({
    ...input,
    userId: input.userId ?? OFFLINE_USER_ID,
    createdAt: ts,
    updatedAt: ts,
  } as DbRecurringTransaction);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateRecurring(
  id: number,
  input: UpdateRecurringInput
): Promise<void> {
  await db.recurringTransactions.update(id, { ...input, updatedAt: now() });
}

export async function toggleRecurring(
  id: number,
  isActive: boolean
): Promise<void> {
  await db.recurringTransactions.update(id, { isActive, updatedAt: now() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRecurring(id: number): Promise<void> {
  await db.recurringTransactions.delete(id);
}

// ─── Auto-generation ──────────────────────────────────────────────────────────

/**
 * Scan all active recurring transactions whose nextRunDate is today or earlier.
 * For each one, generate the actual transaction(s) and advance nextRunDate.
 *
 * Generates up to MAX_PER_ITEM transactions per recurring entry (safety cap for
 * cases where the app was offline for a long time).
 *
 * Returns the total number of transactions created.
 */
export async function processRecurringTransactions(userId = OFFLINE_USER_ID): Promise<number> {
  const today = todayIso();
  const MAX_PER_ITEM = 24;

  const due = await db.recurringTransactions
    .filter((r) => r.userId === userId && r.isActive && r.nextRunDate <= today)
    .toArray();

  let totalCreated = 0;

  for (const r of due) {
    let runDate = r.nextRunDate;
    let created = 0;

    while (runDate <= today && created < MAX_PER_ITEM) {
      try {
        await createTransaction({
          userId:     r.userId ?? userId,
          walletId:   r.walletId,
          categoryId: r.categoryId,
          type:       r.type,
          amount:     r.amount,
          date:       runDate,
          name:       r.title,
          notes:      r.notes,
        });
      } catch {
        // If wallet/category doesn't exist, skip this occurrence
        break;
      }
      runDate = nextOccurrence(runDate, r.frequency);
      created++;
    }

    // Always advance nextRunDate so we don't re-process on next boot
    await db.recurringTransactions.update(r.id, {
      nextRunDate: runDate,
      updatedAt:   now(),
    });

    totalCreated += created;
  }

  return totalCreated;
}
