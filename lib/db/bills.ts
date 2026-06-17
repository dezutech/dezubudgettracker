import { db } from "./database";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { createTransaction } from "./transactions";
import { nextOccurrence } from "./recurring";
import type { BillStatus, CreateBillInput, DbBill, UpdateBillInput } from "./schema";

function now() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function toIsoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function monthEndIso(date = new Date()) {
  return toIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function generatedStatus(dueDate: string): BillStatus {
  return dueDate > todayIso() ? "scheduled" : "unpaid";
}

export async function getBills(userId = OFFLINE_USER_ID): Promise<DbBill[]> {
  return db.bills
    .where("userId")
    .equals(userId)
    .filter((bill) => !bill.isDeleted)
    .sortBy("dueDate");
}

export async function createBill(input: CreateBillInput): Promise<number> {
  const ts = now();
  return db.bills.add({
    ...input,
    userId: input.userId ?? OFFLINE_USER_ID,
    isDeleted: input.isDeleted ?? false,
    createdAt: ts,
    updatedAt: ts,
  } as DbBill);
}

export async function updateBill(id: number, input: UpdateBillInput): Promise<void> {
  await db.bills.update(id, { ...input, updatedAt: now() });
}

export async function archiveBill(id: number): Promise<void> {
  await db.bills.update(id, { isDeleted: true, updatedAt: now() });
}

export async function updateOverdueLocalBills(userId = OFFLINE_USER_ID): Promise<void> {
  const today = todayIso();
  const due = await db.bills
    .where("userId")
    .equals(userId)
    .filter((bill) => !bill.isDeleted && bill.status !== "paid" && bill.dueDate < today)
    .toArray();

  await Promise.all(due.map((bill) => db.bills.update(bill.id, { status: "overdue", updatedAt: now() })));
}

export async function markBillPaid(id: number, userId = OFFLINE_USER_ID): Promise<void> {
  const bill = await db.bills.get(id);
  if (!bill || bill.userId !== userId || bill.isDeleted) throw new Error("Bill was not found.");
  if (bill.status === "paid") return;
  if (!bill.walletId) throw new Error("Select a wallet before marking this bill as paid.");
  if (!bill.categoryId) throw new Error("Select a category before marking this bill as paid.");

  await createTransaction({
    userId,
    walletId: bill.walletId,
    categoryId: bill.categoryId,
    type: "expense",
    amount: bill.amount,
    date: todayIso(),
    name: `Bill payment: ${bill.title}`,
    notes: bill.notes,
  });
  await db.bills.update(id, { status: "paid", updatedAt: now() });
}

export async function syncRecurringMonthlyBills(userId = OFFLINE_USER_ID): Promise<void> {
  const end = monthEndIso();
  const recurring = await db.recurringTransactions
    .where("userId")
    .equals(userId)
    .filter((item) =>
      item.isActive &&
      item.type === "expense" &&
      item.frequency === "monthly" &&
      item.nextRunDate <= end
    )
    .toArray();

  for (const item of recurring) {
    let dueDate = item.nextRunDate;
    let guard = 0;
    while (dueDate <= end && guard < 12) {
      const exists = await db.bills
        .where("[userId+recurringId+dueDate]")
        .equals([userId, item.id, dueDate])
        .filter((bill) => !bill.isDeleted)
        .first();

      if (!exists) {
        const billId = await createBill({
          userId,
          title: item.title,
          amount: item.amount,
          dueDate,
          categoryId: item.categoryId,
          walletId: item.walletId,
          status: generatedStatus(dueDate),
          notes: "Generated from recurring transaction",
          isRecurring: true,
          recurringId: item.id,
          generatedOccurrenceDate: dueDate,
          isDeleted: false,
        });
        await db.bills.update(billId, { billId, updatedAt: now() });
      }

      dueDate = nextOccurrence(dueDate, "monthly");
      guard += 1;
    }
  }
}
