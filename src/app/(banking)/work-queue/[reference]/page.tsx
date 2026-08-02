import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { WorkItemAssignmentForm } from "@/components/banking/operations-forms";
import { formatDate, labelEnum } from "@/components/banking/format";
import { Badge, Breadcrumbs, Panel } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { claimWorkItemAction, releaseWorkItemAction } from "@/modules/actions/workflow";
import { getWorkItem } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Work item" };
const entityHref = (type: string, reference: string) => type === "KYC_CASE" ? `/kyc/${reference}`
  : type === "PAYMENT" ? `/payments/${reference}`
    : type === "PAYMENT_REVERSAL" ? `/payment-reversals/${reference}`
      : type === "ACCOUNTING_PERIOD" ? `/accounting-periods/${reference}`
        : type === "GENERAL_LEDGER_JOURNAL" ? `/general-ledger/journals/${reference}`
          : type === "OVERDRAFT" ? `/overdrafts/${reference}` : "/overdrafts";

export default async function WorkItemPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [item, user] = await Promise.all([getWorkItem(reference), requireUser()]);
  if (!item) notFound();
  return <AutomationPage name="work-item-detail"><Breadcrumbs items={[{ label: "Work queue", href: "/work-queue" }, { label: item.reference }]} />
    <section className="record-banner" data-bp="work-item-record-header"><div><p>{labelEnum(item.type)} · {item.entityReference}</p><h1>{item.title}</h1></div><div className="record-banner-meta"><Badge tone={item.priority === "CRITICAL" ? "negative" : "warning"}>{labelEnum(item.priority)}</Badge><Badge>{labelEnum(item.status)}</Badge></div></section>
    <div className="two-column"><Panel title="Work item"><dl className="definition-grid"><div><dt>Reference</dt><dd className="mono">{item.reference}</dd></div><div><dt>Entity</dt><dd><Link href={entityHref(item.entityType, item.entityReference)} data-bp="work-item-entity-link">{item.entityReference}</Link></dd></div><div><dt>Required role</dt><dd>{labelEnum(item.requiredRole)}</dd></div><div><dt>Assigned to</dt><dd className="mono">{item.assignedTo ?? "Unassigned"}</dd></div><div><dt>Due</dt><dd>{formatDate(item.dueAt, true)}</dd></div><div><dt>Version</dt><dd>{item.version}</dd></div></dl><p>{item.description}</p></Panel>
      <Panel title="Assignment"><WorkItemAssignmentForm claimAction={claimWorkItemAction} releaseAction={releaseWorkItemAction} item={item} isAssignedToCurrentUser={item.assignedTo === user.id} /></Panel></div>
    <Panel title="Transition history"><table className="data-table" data-bp="work-item-events-table"><thead><tr><th>Time</th><th>Event</th><th>From</th><th>To</th><th>Actor</th><th>Comment</th></tr></thead><tbody>{item.events.map((event, index) => <tr key={`${event.occurredAt}-${index}`}><td>{formatDate(event.occurredAt, true)}</td><td>{labelEnum(event.eventType)}</td><td>{event.fromStatus ? labelEnum(event.fromStatus) : "—"}</td><td>{event.toStatus ? labelEnum(event.toStatus) : "—"}</td><td>{event.actorUsername}</td><td>{event.comment ?? "—"}</td></tr>)}</tbody></table></Panel>
  </AutomationPage>;
}
