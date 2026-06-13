import { db } from "./database";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { createTransaction } from "./transactions";
import type {
  DbRecurringTransaction,
  CreateRecurringInput,
  UpdateRecurringInput,
  RecurringFrequency,
  RecurringStatus,
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

/** Derive effective status from a record, handling pre-v9 rows that have no status field. */
function effectiveStatus(r: DbRecurringTransaction): RecurringStatus {
  return r.status ?? (r.isActive ? "active" : "paused");
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
    .filter((r) => effectiveStatus(r) === "active" && r.nextRunDate >= today && r.nextRunDate <= futureStr)
    .toArray();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createRecurring(
  input: CreateRecurringInput
): Promise<number> {
  const ts = now();
  const status: RecurringStatus = input.status ?? "active";
  return db.recurringTransactions.add({
    ...input,
    userId: input.userId ?? OFFLINE_USER_ID,
    status,
    isActive: status === "active",
    endCondition: input.endCondition ?? "forever",
    occurrencesCount: input.occurrencesCount ?? 0,
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
  const status: RecurringStatus = isActive ? "active" : "paused";
  await db.recurringTransactions.update(id, { isActive, status, updatedAt: now() });
}

export async function setRecurringStatus(
  id: number,
  status: RecurringStatus
): Promise<void> {
  const isActive = status === "active";
  await db.recurringTransactions.update(id, { status, isActive, updatedAt: now() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRecurring(id: number): Promise<void> {
  await db.recurringTransactions.delete(id);
}

// ─── Auto-generation ──────────────────────────────────────────────────────────

/**
 * Scan all active recurring transactions whose nextRunDate is today or earlier.
 * For each one, generate the actual transaction(s) and advance nextRunDate.
 * Respects end conditions (end_date, occurrences) and marks items as completed
 * when their end condition is reached.
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
    .filter((r) => r.userId === userId && effectiveStatus(r) === "active" && r.nextRunDate <= today)
    .toArray();

  let totalCreated = 0;

  for (const r of due) {
    const endCondition = r.endCondition ?? "forever";
    let runDate = r.nextRunDate;
    let created = 0;
    let count = r.occurrencesCount ?? 0;
    let shouldComplete = false;

    while (runDate <= today && created < MAX_PER_ITEM) {
      // Pre-check: will this occurrence violate end conditions?
      if (endCondition === "end_date" && r.endDate && runDate > r.endDate) {
        shouldComplete = true;
        break;
      }
      if (endCondition === "occurrences" && r.maxOccurrences != null && count >= r.maxOccurrences) {
        shouldComplete = true;
        break;
      }

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
        count++;
      } catch {
        // If wallet/category doesn't exist, skip this occurrence
        break;
      }

      runDate = nextOccurrence(runDate, r.frequency);
      created++;

      // Post-check: did we hit the end condition on this new nextRunDate?
      if (endCondition === "occurrences" && r.maxOccurrences != null && count >= r.maxOccurrences) {
        shouldComplete = true;
        break;
      }
      if (endCondition === "end_date" && r.endDate && runDate > r.endDate) {
        shouldComplete = true;
        break;
      }
    }

    const updates: Partial<DbRecurringTransaction> & { updatedAt: string } = {
      nextRunDate: runDate,
      occurrencesCount: count,
      updatedAt: now(),
    };

    if (shouldComplete) {
      updates.status = "completed";
      updates.isActive = false;
    }

    await db.recurringTransactions.update(r.id, updates);
    totalCreated += created;
  }

  return totalCreated;
}
