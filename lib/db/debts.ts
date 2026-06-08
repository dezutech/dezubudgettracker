import { OFFLINE_USER_ID } from "@/lib/offline/constants";
import { db } from "./database";
import type { CreateDebtInput, DbDebt, DebtStatus, UpdateDebtInput } from "./schema";

function now() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function effectiveDebtStatus(debt: Pick<DbDebt, "status" | "remainingBalance" | "dueDate">): DebtStatus {
  if (debt.status === "paid" || debt.remainingBalance <= 0) return "paid";
  if (debt.dueDate && debt.dueDate < todayIso()) return "overdue";
  return "active";
}

export async function getDebts(userId = OFFLINE_USER_ID): Promise<DbDebt[]> {
  const debts = await db.debts
    .where("userId")
    .equals(userId)
    .filter((debt) => !debt.isDeleted)
    .toArray();

  return debts
    .map((debt) => ({ ...debt, status: effectiveDebtStatus(debt) }))
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
}

export async function createDebt(input: CreateDebtInput): Promise<number> {
  const ts = now();
  const remainingBalance = Math.max(0, input.remainingBalance ?? input.originalAmount);
  return db.debts.add({
    ...input,
    userId: input.userId ?? OFFLINE_USER_ID,
    remainingBalance,
    status: remainingBalance <= 0 ? "paid" : effectiveDebtStatus({ ...input, remainingBalance }),
    isDeleted: input.isDeleted ?? false,
    createdAt: ts,
    updatedAt: ts,
  } as DbDebt);
}

export async function updateDebt(id: number, input: UpdateDebtInput): Promise<void> {
  const current = await db.debts.get(id);
  if (!current || current.isDeleted) throw new Error("Debt was not found.");
  const next = { ...current, ...input };
  const remainingBalance = Math.max(0, Number(next.remainingBalance));
  await db.debts.update(id, {
    ...input,
    remainingBalance,
    status: input.status ?? effectiveDebtStatus({ ...next, remainingBalance }),
    updatedAt: now(),
  });
}

export async function archiveDebt(id: number): Promise<void> {
  await db.debts.update(id, { isDeleted: true, updatedAt: now() });
}

export async function addDebtPayment(id: number, amount: number, userId = OFFLINE_USER_ID): Promise<void> {
  const debt = await db.debts.get(id);
  if (!debt || debt.userId !== userId || debt.isDeleted) throw new Error("Debt was not found.");
  if (amount <= 0) throw new Error("Enter a payment amount greater than 0.");

  const remainingBalance = Math.max(0, debt.remainingBalance - amount);
  await db.debts.update(id, {
    remainingBalance,
    status: remainingBalance <= 0 ? "paid" : effectiveDebtStatus({ ...debt, remainingBalance }),
    updatedAt: now(),
  });
}

export async function markDebtPaid(id: number, userId = OFFLINE_USER_ID): Promise<void> {
  const debt = await db.debts.get(id);
  if (!debt || debt.userId !== userId || debt.isDeleted) throw new Error("Debt was not found.");
  await db.debts.update(id, {
    remainingBalance: 0,
    status: "paid",
    updatedAt: now(),
  });
}

export async function updateOverdueLocalDebts(userId = OFFLINE_USER_ID): Promise<void> {
  const today = todayIso();
  const due = await db.debts
    .where("userId")
    .equals(userId)
    .filter((debt) => !debt.isDeleted && debt.status !== "paid" && debt.remainingBalance > 0 && !!debt.dueDate && debt.dueDate < today)
    .toArray();

  await Promise.all(due.map((debt) => db.debts.update(debt.id, { status: "overdue", updatedAt: now() })));
}
