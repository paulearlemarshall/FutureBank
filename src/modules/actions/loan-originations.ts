"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { decideLoanApplication, submitLoanApplication } from "@/modules/services/loan-originations";
import { failedAction, formText, invalidAction } from "./action-utils";

const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const submitSchema = z.object({
  customerNumber: z.string().min(2).max(30), productCode: z.string().min(2).max(30), destinationAccountNumber: z.string().min(5).max(30),
  principal: money, termMonths: z.coerce.number().int().min(6).max(60), firstPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthlyIncome: money, monthlyCommitments: money, purpose: z.string().min(10).max(500), riskGrade: z.enum(["A", "B", "C"]),
  idempotencyKey: z.string().min(8).max(100),
});
const decisionSchema = z.object({
  applicationReference: z.string().min(5).max(30), workItemReference: z.string().min(5).max(30), expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().min(10).max(500),
});

export async function submitLoanApplicationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const fields = ["customerNumber", "productCode", "destinationAccountNumber", "principal", "termMonths", "firstPaymentDate", "monthlyIncome", "monthlyCommitments", "purpose", "riskGrade", "idempotencyKey"];
  const parsed = submitSchema.safeParse(Object.fromEntries(fields.map((key) => [key, formText(formData, key)])));
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("LOAN_ORIGINATION_INITIATE");
    const result = await submitLoanApplication(parsed.data, actor);
    revalidatePath("/loans"); revalidatePath(`/loans/${result.reference}`); revalidatePath("/work-queue");
    return { ok: true, code: result.duplicate ? "LOAN_APPLICATION_DUPLICATE" : "LOAN_APPLICATION_SUBMITTED",
      message: result.duplicate ? `${result.reference} already owns this idempotency key.` : `${result.reference} entered independent review as ${result.workItemReference}.` };
  } catch (error) { return failedAction(error); }
}

export async function decideLoanApplicationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const fields = ["applicationReference", "workItemReference", "expectedVersion", "decision", "comment"];
  const parsed = decisionSchema.safeParse(Object.fromEntries(fields.map((key) => [key, formText(formData, key)])));
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("LOAN_ORIGINATION_DECIDE");
    const result = await decideLoanApplication(parsed.data, actor);
    revalidatePath("/loans"); revalidatePath(`/loans/${result.reference}`); revalidatePath("/work-queue"); revalidatePath("/accounts"); revalidatePath("/general-ledger");
    return { ok: true, code: parsed.data.decision === "APPROVE" ? "LOAN_ORIGINATION_APPROVED" : "LOAN_APPLICATION_REJECTED",
      message: parsed.data.decision === "APPROVE" ? `${result.reference} was approved, booked to ${result.loanAccountNumber}, and disbursed.` : `${result.reference} was rejected without account or ledger movement.` };
  } catch (error) { return failedAction(error); }
}
