"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState, DocumentSlot } from "@/modules/contracts";
import { deleteCustomerDocument } from "@/modules/services/documents";
import { failedAction } from "./action-utils";

export async function deleteCustomerDocumentAction(customerNumber: string, slot: DocumentSlot, _previous: ActionState, formData: FormData): Promise<ActionState> {
  if (formData.get("confirmDelete") !== "yes") return { ok: false, code: "CONFIRMATION_REQUIRED", message: "Confirm deletion before continuing." };
  try {
    const actor = await requirePermission("KYC_GATHER");
    const deleted = await deleteCustomerDocument({ customerNumber, slot }, actor);
    revalidatePath(`/customers/${customerNumber}`);
    return { ok: true, code: deleted ? "DOCUMENT_DELETED" : "DOCUMENT_NOT_FOUND", message: deleted ? `${slot === "PASSPORT" ? "Passport" : "National ID"} document deleted.` : "No document was stored in this slot." };
  } catch (error) { return failedAction(error); }
}
