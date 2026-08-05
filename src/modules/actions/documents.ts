"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { deleteCustomerDocumentByReference } from "@/modules/services/documents";
import { failedAction } from "./action-utils";

export async function deleteCustomerDocumentAction(customerNumber: string, documentReference: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  if (formData.get("confirmDelete") !== "yes") return { ok: false, code: "CONFIRMATION_REQUIRED", message: "Confirm deletion before continuing." };
  try {
    const actor = await requirePermission("KYC_GATHER");
    const deleted = await deleteCustomerDocumentByReference({ customerNumber, documentReference }, actor);
    revalidatePath(`/customers/${customerNumber}`);
    return { ok: true, code: deleted ? "DOCUMENT_DELETED" : "DOCUMENT_NOT_FOUND", message: deleted ? "Document deleted." : "Document was not found." };
  } catch (error) { return failedAction(error); }
}
