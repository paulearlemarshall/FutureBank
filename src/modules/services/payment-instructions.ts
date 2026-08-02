import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  bankAccounts,
  beneficiaries,
  customerRestrictions,
  customers,
  paymentInstructionExecutions,
  paymentInstructions,
  paymentOrders,
  processingRuns,
  staffProfiles,
  user,
} from "@/db/schema";
import type {
  PaymentInstructionFrequency,
  PaymentInstructionType,
  SessionUser,
} from "@/modules/contracts";
import {
  isPaymentInstructionDue,
  nextPaymentInstructionDate,
  validatePaymentInstructionSchedule,
} from "@/modules/domain/payment-instruction-policy";
import { moneyToMinorUnits } from "@/modules/domain/transfer-policy";
import { BankingError } from "./errors";
import { bookExternalPayment, bookInternalTransfer } from "./payments";

type CreatePaymentInstructionInput = {
  type: PaymentInstructionType;
  paymentType: "INTERNAL" | "EXTERNAL";
  sourceAccountNumber: string;
  destinationAccountNumber?: string | null;
  beneficiaryId?: string | null;
  amount: string;
  description: string;
  frequency: PaymentInstructionFrequency;
  startDate: string;
  endDate?: string | null;
  today?: string;
};

type ClaimedInstruction = {
  instruction: typeof paymentInstructions.$inferSelect;
  sourceAccountNumber: string;
  destinationAccountNumber: string | null;
  executionId: string;
  paymentAlreadyExists: boolean;
};

function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function scheduleMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_DATE: "Enter valid instruction dates in YYYY-MM-DD format.",
    START_DATE_IN_PAST: "The first execution date cannot be in the past.",
    END_BEFORE_START: "The end date cannot be before the first execution date.",
    INVALID_FREQUENCY: "Scheduled payments are one-off; standing orders must be weekly or monthly.",
  };
  return messages[code] ?? "The payment schedule is invalid.";
}

export async function createPaymentInstruction(input: CreatePaymentInstructionInput, actor: SessionUser) {
  let amount: string;
  try {
    const minor = moneyToMinorUnits(input.amount);
    if (minor <= 0n) throw new Error("non-positive");
    amount = `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
  } catch {
    throw new BankingError("INVALID_AMOUNT", "Enter an amount greater than zero with no more than two decimal places.");
  }
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const schedule = validatePaymentInstructionSchedule({
    type: input.type,
    frequency: input.frequency,
    startDate: input.startDate,
    endDate: input.endDate,
    today,
  });
  if (!schedule.ok) throw new BankingError(schedule.code, scheduleMessage(schedule.code));
  if (!input.description.trim()) throw new BankingError("DESCRIPTION_REQUIRED", "Enter a payment description.");

  return db.transaction(async (tx) => {
    const sourceResult = await tx.execute(sql`
      select id, account_number, customer_id, currency, status, read_only
      from bank_accounts where account_number = ${input.sourceAccountNumber} for update
    `);
    const source = (sourceResult.rows as unknown as Array<{
      id: string; account_number: string; customer_id: string; currency: string; status: string; read_only: boolean;
    }>)[0];
    if (!source) throw new BankingError("ACCOUNT_NOT_FOUND", "The source account could not be found.");
    if (source.status !== "ACTIVE" || source.read_only) throw new BankingError("ACCOUNT_UNAVAILABLE", "The source account is not available for debit instructions.");
    const [customer] = await tx.select().from(customers).where(eq(customers.id, source.customer_id)).limit(1);
    const restrictions = await tx.select().from(customerRestrictions).where(and(
      eq(customerRestrictions.customerId, source.customer_id),
      eq(customerRestrictions.type, "DEBIT_BLOCK"),
      eq(customerRestrictions.active, true),
    ));
    if (!customer || ["REJECTED", "EXPIRED"].includes(customer.kycStatus) || restrictions.length) {
      throw new BankingError("DEBITS_RESTRICTED", "Customer debits are blocked by KYC controls.");
    }

    let destinationAccountId: string | null = null;
    let beneficiaryId: string | null = null;
    if (input.paymentType === "INTERNAL") {
      if (!input.destinationAccountNumber || input.destinationAccountNumber === input.sourceAccountNumber) {
        throw new BankingError("DESTINATION_REQUIRED", "Select a different destination account.");
      }
      const [destination] = await tx.select().from(bankAccounts).where(eq(bankAccounts.accountNumber, input.destinationAccountNumber)).limit(1);
      if (!destination || destination.status !== "ACTIVE") throw new BankingError("ACCOUNT_UNAVAILABLE", "The destination account is not active.");
      if (destination.currency !== source.currency) throw new BankingError("CURRENCY_MISMATCH", "Source and destination currencies must match.");
      destinationAccountId = destination.id;
    } else {
      if (!input.beneficiaryId) throw new BankingError("BENEFICIARY_REQUIRED", "Select an external beneficiary.");
      const [beneficiary] = await tx.select().from(beneficiaries).where(and(
        eq(beneficiaries.id, input.beneficiaryId),
        eq(beneficiaries.customerId, source.customer_id),
        eq(beneficiaries.status, "ACTIVE"),
      )).limit(1);
      if (!beneficiary) throw new BankingError("BENEFICIARY_NOT_FOUND", "The beneficiary could not be found or is inactive.");
      if (beneficiary.currency !== source.currency) throw new BankingError("CURRENCY_MISMATCH", "Source and beneficiary currencies must match.");
      beneficiaryId = beneficiary.id;
    }

    const instructionReference = reference("PIN");
    await tx.insert(paymentInstructions).values({
      reference: instructionReference,
      type: input.type,
      status: "ACTIVE",
      paymentType: input.paymentType,
      sourceAccountId: source.id,
      destinationAccountId,
      beneficiaryId,
      amount,
      currency: source.currency,
      description: input.description.trim(),
      frequency: input.frequency,
      anchorDay: schedule.anchorDay,
      startDate: schedule.startDate,
      nextExecutionDate: schedule.startDate,
      endDate: schedule.endDate,
      createdBy: actor.id,
    });
    await tx.insert(auditEvents).values({
      actorUserId: actor.id,
      actorUsername: actor.username,
      action: "PAYMENT_INSTRUCTION_CREATED",
      entityType: "PAYMENT_INSTRUCTION",
      entityReference: instructionReference,
      correlationId: crypto.randomUUID(),
      before: null,
      after: {
        type: input.type,
        paymentType: input.paymentType,
        sourceAccountNumber: source.account_number,
        amount,
        currency: source.currency,
        frequency: input.frequency,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
      },
    });
    return instructionReference;
  });
}

export async function cancelPaymentInstruction(input: {
  reference: string;
  expectedVersion: number;
  reason: string;
}, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      select id, reference, status, version from payment_instructions where reference = ${input.reference} for update
    `);
    const instruction = (result.rows as unknown as Array<{ id: string; reference: string; status: string; version: number }>)[0];
    if (!instruction) throw new BankingError("INSTRUCTION_NOT_FOUND", "The payment instruction could not be found.");
    if (!['ACTIVE', 'PAUSED'].includes(instruction.status)) throw new BankingError("INSTRUCTION_NOT_CANCELLABLE", "The payment instruction is no longer cancellable.");
    if (instruction.version !== input.expectedVersion) throw new BankingError("STALE_VERSION", "The payment instruction changed. Refresh and try again.");
    const [processing] = await tx.select({ id: paymentInstructionExecutions.id })
      .from(paymentInstructionExecutions)
      .where(and(eq(paymentInstructionExecutions.instructionId, instruction.id), eq(paymentInstructionExecutions.status, "PROCESSING")))
      .limit(1);
    if (processing) throw new BankingError("INSTRUCTION_PROCESSING", "An occurrence is currently processing; wait for it to finish before cancelling.");
    const reason = input.reason.trim();
    if (reason.length < 5) throw new BankingError("REASON_REQUIRED", "Enter a cancellation reason of at least five characters.");
    await tx.update(paymentInstructions).set({
      status: "CANCELLED",
      cancelledBy: actor.id,
      cancellationReason: reason,
      cancelledAt: new Date(),
      version: instruction.version + 1,
      updatedAt: new Date(),
    }).where(eq(paymentInstructions.id, instruction.id));
    await tx.insert(auditEvents).values({
      actorUserId: actor.id,
      actorUsername: actor.username,
      action: "PAYMENT_INSTRUCTION_CANCELLED",
      entityType: "PAYMENT_INSTRUCTION",
      entityReference: instruction.reference,
      correlationId: crypto.randomUUID(),
      before: { status: instruction.status, version: instruction.version },
      after: { status: "CANCELLED", version: instruction.version + 1, reason },
    });
    return instruction.reference;
  });
}

async function instructionCreator(userId: string): Promise<SessionUser> {
  const [row] = await db.select({ account: user, profile: staffProfiles }).from(user)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(eq(user.id, userId)).limit(1);
  if (!row?.profile.active) throw new BankingError("INSTRUCTION_CREATOR_INACTIVE", "The instruction creator is no longer an active staff user.");
  return {
    id: row.account.id,
    username: row.account.username ?? row.account.email,
    name: row.account.name,
    role: row.profile.role,
  };
}

async function claimInstruction(instructionId: string, businessDate: string, runId: string): Promise<ClaimedInstruction | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from payment_instructions where id = ${instructionId} for update`);
    const [locked] = await tx.select().from(paymentInstructions).where(eq(paymentInstructions.id, instructionId)).limit(1);
    if (!locked || locked.status !== "ACTIVE" || !isPaymentInstructionDue(locked.nextExecutionDate, businessDate)) return null;
    const idempotencyKey = `payment-instruction:${locked.id}:${locked.nextExecutionDate}`;
    const [existing] = await tx.select().from(paymentInstructionExecutions).where(and(
      eq(paymentInstructionExecutions.instructionId, locked.id),
      eq(paymentInstructionExecutions.scheduledFor, locked.nextExecutionDate),
    )).limit(1);
    if (existing && existing.status !== "PROCESSING") return null;
    if (existing) {
      const [payment] = await tx.select({ id: paymentOrders.id }).from(paymentOrders).where(eq(paymentOrders.idempotencyKey, idempotencyKey)).limit(1);
      const retryCutoff = Date.now() - 5 * 60_000;
      if (!payment && existing.attemptedAt.getTime() > retryCutoff) return null;
      await tx.update(paymentInstructionExecutions).set({ processingRunId: runId, attemptedAt: new Date() }).where(eq(paymentInstructionExecutions.id, existing.id));
      const [source] = await tx.select({ accountNumber: bankAccounts.accountNumber }).from(bankAccounts).where(eq(bankAccounts.id, locked.sourceAccountId)).limit(1);
      const [destination] = locked.destinationAccountId
        ? await tx.select({ accountNumber: bankAccounts.accountNumber }).from(bankAccounts).where(eq(bankAccounts.id, locked.destinationAccountId)).limit(1)
        : [];
      if (!source) throw new BankingError("ACCOUNT_NOT_FOUND", "The source account could not be found.");
      return { instruction: locked, sourceAccountNumber: source.accountNumber, destinationAccountNumber: destination?.accountNumber ?? null, executionId: existing.id, paymentAlreadyExists: Boolean(payment) };
    }
    const [execution] = await tx.insert(paymentInstructionExecutions).values({
      instructionId: locked.id,
      processingRunId: runId,
      scheduledFor: locked.nextExecutionDate,
      status: "PROCESSING",
      idempotencyKey,
    }).returning();
    const [source] = await tx.select({ accountNumber: bankAccounts.accountNumber }).from(bankAccounts).where(eq(bankAccounts.id, locked.sourceAccountId)).limit(1);
    const [destination] = locked.destinationAccountId
      ? await tx.select({ accountNumber: bankAccounts.accountNumber }).from(bankAccounts).where(eq(bankAccounts.id, locked.destinationAccountId)).limit(1)
      : [];
    if (!source) throw new BankingError("ACCOUNT_NOT_FOUND", "The source account could not be found.");
    return { instruction: locked, sourceAccountNumber: source.accountNumber, destinationAccountNumber: destination?.accountNumber ?? null, executionId: execution.id, paymentAlreadyExists: false };
  });
}

async function finishInstruction(
  claim: ClaimedInstruction,
  outcome: { status: "BOOKED" | "PENDING" | "FAILED"; paymentOrderId?: string; failureCode?: string; failureMessage?: string },
) {
  await db.transaction(async (tx) => {
    const result = await tx.execute(sql`select id, status, version from payment_instructions where id = ${claim.instruction.id} for update`);
    const current = (result.rows as unknown as Array<{ id: string; status: string; version: number }>)[0];
    if (!current) throw new BankingError("INSTRUCTION_NOT_FOUND", "The payment instruction could not be found.");
    const nextDate = nextPaymentInstructionDate(claim.instruction.nextExecutionDate, claim.instruction.frequency, claim.instruction.anchorDay);
    const scheduleComplete = !nextDate || Boolean(claim.instruction.endDate && nextDate > claim.instruction.endDate);
    const nextStatus = claim.instruction.frequency === "ONCE" && outcome.status === "FAILED"
      ? "FAILED"
      : scheduleComplete ? "COMPLETED" : current.status;
    await tx.update(paymentInstructionExecutions).set({
      status: outcome.status,
      paymentOrderId: outcome.paymentOrderId,
      failureCode: outcome.failureCode,
      failureMessage: outcome.failureMessage,
      completedAt: new Date(),
    }).where(eq(paymentInstructionExecutions.id, claim.executionId));
    await tx.update(paymentInstructions).set({
      status: nextStatus as "ACTIVE" | "CANCELLED" | "COMPLETED" | "FAILED" | "PAUSED",
      nextExecutionDate: nextDate ?? claim.instruction.nextExecutionDate,
      lastExecutionAt: new Date(),
      version: current.version + 1,
      updatedAt: new Date(),
    }).where(eq(paymentInstructions.id, claim.instruction.id));
  });
}

export async function runDuePaymentInstructions(input: { businessDate: string }, actor: SessionUser) {
  try {
    isPaymentInstructionDue(input.businessDate, input.businessDate);
  } catch {
    throw new BankingError("INVALID_DATE", "Enter a valid business date.");
  }
  const runReference = reference("RUN");
  const [run] = await db.insert(processingRuns).values({
    reference: runReference,
    type: "PAYMENT_INSTRUCTIONS",
    businessDate: input.businessDate,
    status: "RUNNING",
    requestedBy: actor.id,
  }).returning();
  let attempted = 0;
  let booked = 0;
  let pending = 0;
  let failed = 0;
  try {
    const due = await db.select({ id: paymentInstructions.id }).from(paymentInstructions).where(and(
      eq(paymentInstructions.status, "ACTIVE"),
      lte(paymentInstructions.nextExecutionDate, input.businessDate),
    )).orderBy(asc(paymentInstructions.nextExecutionDate), asc(paymentInstructions.reference));
    for (const candidate of due) {
      const claim = await claimInstruction(candidate.id, input.businessDate, run.id);
      if (!claim) continue;
      attempted += 1;
      try {
        const idempotencyKey = `payment-instruction:${claim.instruction.id}:${claim.instruction.nextExecutionDate}`;
        const creator = await instructionCreator(claim.instruction.createdBy);
        if (!claim.paymentAlreadyExists) {
          if (claim.instruction.paymentType === "INTERNAL") {
            if (!claim.destinationAccountNumber) throw new BankingError("DESTINATION_REQUIRED", "The destination account is missing.");
            await bookInternalTransfer({
              sourceAccountNumber: claim.sourceAccountNumber,
              destinationAccountNumber: claim.destinationAccountNumber,
              amount: claim.instruction.amount,
              description: claim.instruction.description,
              idempotencyKey,
            }, creator);
          } else {
            if (!claim.instruction.beneficiaryId) throw new BankingError("BENEFICIARY_REQUIRED", "The beneficiary is missing.");
            await bookExternalPayment({
              sourceAccountNumber: claim.sourceAccountNumber,
              beneficiaryId: claim.instruction.beneficiaryId,
              amount: claim.instruction.amount,
              description: claim.instruction.description,
              idempotencyKey,
            }, creator);
          }
        }
        const [payment] = await db.select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, idempotencyKey)).limit(1);
        if (!payment) throw new BankingError("PAYMENT_NOT_CREATED", "The payment occurrence was not created.");
        const status = payment.status === "PENDING" ? "PENDING" as const : "BOOKED" as const;
        await finishInstruction(claim, { status, paymentOrderId: payment.id });
        if (status === "PENDING") pending += 1; else booked += 1;
      } catch (error) {
        const code = error instanceof BankingError ? error.code : "EXECUTION_FAILED";
        const message = error instanceof Error ? error.message : "The instruction occurrence failed.";
        await finishInstruction(claim, { status: "FAILED", failureCode: code, failureMessage: message });
        failed += 1;
      }
    }
    await db.update(processingRuns).set({ status: "COMPLETED", attempted, booked, pending, failed, completedAt: new Date() }).where(eq(processingRuns.id, run.id));
    await db.insert(auditEvents).values({
      actorUserId: actor.id,
      actorUsername: actor.username,
      action: "PAYMENT_INSTRUCTIONS_PROCESSED",
      entityType: "PROCESSING_RUN",
      entityReference: runReference,
      correlationId: crypto.randomUUID(),
      before: null,
      after: { businessDate: input.businessDate, attempted, booked, pending, failed },
    });
    return { reference: runReference, attempted, booked, pending, failed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The processing run failed.";
    await db.update(processingRuns).set({ status: "FAILED", attempted, booked, pending, failed, completedAt: new Date(), errorMessage: message }).where(eq(processingRuns.id, run.id));
    throw error;
  }
}
