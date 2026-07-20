import type { ZodError } from "zod";
import type { ActionState } from "@/modules/contracts";
import { BankingError } from "@/modules/services/errors";

export const formText = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
export const optionalFormText = (formData: FormData, key: string) => formText(formData, key) || null;

export function invalidAction(error: ZodError): ActionState {
  const flattened = error.flatten().fieldErrors;
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(flattened)) {
    if (Array.isArray(messages) && messages.length) fieldErrors[field] = messages.map(String);
  }
  return { ok: false, code: "VALIDATION_ERROR", message: "Correct the highlighted fields and try again.", fieldErrors };
}

export function failedAction(error: unknown): ActionState {
  if (error instanceof BankingError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof Error && ["UNAUTHENTICATED", "FORBIDDEN"].includes(error.message)) {
    return { ok: false, code: error.message, message: error.message === "FORBIDDEN" ? "You are not authorized to perform this action." : "Your session has expired. Sign in again." };
  }
  return { ok: false, code: "UNEXPECTED_ERROR", message: "The operation could not be completed." };
}
