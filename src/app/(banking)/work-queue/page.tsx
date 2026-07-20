import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel } from "@/components/banking/ui";
import type { WorkItemPriority, WorkItemStatus, WorkItemType } from "@/modules/contracts";
import { listWorkQueue } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Work queue" };

export default async function WorkQueuePage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; priority?: string; overdue?: string }> }) {
  const filters = await searchParams;
  const items = await listWorkQueue({ status: filters.status as WorkItemStatus | undefined, type: filters.type as WorkItemType | undefined, priority: filters.priority as WorkItemPriority | undefined, overdueOnly: filters.overdue === "true" });
  return <AutomationPage name="work-queue">
    <PageHeader eyebrow="Controlled operations" title="Work queue" description="Independent approvals, assignments and intervention tasks." />
    <Panel title="Queue filters"><form action="/work-queue" method="get" className="filter-bar" data-bp="work-queue-filters">
      <label htmlFor="work-filter-status">Status</label><select id="work-filter-status" name="status" data-bp="work-filter-status" defaultValue={filters.status ?? ""}><option value="">All active and completed</option>{["OPEN", "ASSIGNED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"].map((value) => <option key={value}>{value}</option>)}</select>
      <label htmlFor="work-filter-type">Type</label><select id="work-filter-type" name="type" data-bp="work-filter-type" defaultValue={filters.type ?? ""}><option value="">All types</option>{["KYC_APPROVAL", "PAYMENT_APPROVAL", "OVERDRAFT_APPROVAL", "OVERDRAFT_CHANGE", "OVERDRAFT_ALERT"].map((value) => <option key={value}>{value}</option>)}</select>
      <label htmlFor="work-filter-priority">Priority</label><select id="work-filter-priority" name="priority" data-bp="work-filter-priority" defaultValue={filters.priority ?? ""}><option value="">All priorities</option>{["LOW", "NORMAL", "HIGH", "CRITICAL"].map((value) => <option key={value}>{value}</option>)}</select>
      <label htmlFor="work-filter-overdue">Due date</label><select id="work-filter-overdue" name="overdue" data-bp="work-filter-overdue" defaultValue={filters.overdue ?? "false"}><option value="false">Any due date</option><option value="true">Overdue only</option></select>
      <button id="work-filter-submit" name="intent" value="filter" data-bp="work-filter-submit" className="secondary-button" type="submit">Apply filters</button>
    </form></Panel>
    <Panel title={`Work items (${items.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="work-queue-table"><thead><tr><th>Reference</th><th>Priority</th><th>Type</th><th>Entity</th><th>Status</th><th>Required role</th><th>Assigned</th><th>Due</th></tr></thead><tbody>{items.map((item) => <tr key={item.reference} data-bp={`work-item-row-${item.reference}`}><td className="mono"><Link href={`/work-queue/${item.reference}`} data-bp={`work-item-link-${item.reference}`}>{item.reference}</Link></td><td><Badge tone={item.priority === "CRITICAL" ? "negative" : item.priority === "HIGH" ? "warning" : "neutral"}>{labelEnum(item.priority)}</Badge></td><td>{labelEnum(item.type)}</td><td className="mono">{item.entityReference}</td><td><Badge tone={item.status === "OPEN" || item.status === "ASSIGNED" ? "warning" : item.status === "APPROVED" || item.status === "COMPLETED" ? "positive" : "negative"}>{labelEnum(item.status)}</Badge></td><td>{labelEnum(item.requiredRole)}</td><td className="mono">{item.assignedTo ?? "Unassigned"}</td><td>{formatDate(item.dueAt, true)}</td></tr>)}</tbody></table></div></Panel>
  </AutomationPage>;
}
