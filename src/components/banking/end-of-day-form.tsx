"use client";

import { useActionState } from "react";
import type { ActionState } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };

export function EndOfDayRunForm({ action, businessDate }: { action: StateAction; businessDate: string }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="end-of-day-run-form">
    {state.message ? <StatusRegion id="end-of-day-run-status" tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion> : <div id="end-of-day-run-status" data-bp="status-end-of-day-run-status" aria-live="polite" />}
    <div className="form-grid two"><Field id="end-of-day-business-date" label="Business date" required hint="Only one run can exist for each business date."><input id="end-of-day-business-date" name="businessDate" data-bp="end-of-day-business-date" type="date" defaultValue={businessDate} max={businessDate} required /></Field></div>
    <button id="end-of-day-run-submit" name="intent" value="run-end-of-day" data-bp="end-of-day-run-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Posting…" : "Run end of day"}</button>
  </form>;
}
