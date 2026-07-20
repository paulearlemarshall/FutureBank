import type { Metadata } from "next";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel } from "@/components/banking/ui";
import { listAuditEvents } from "@/modules/queries";

export const metadata: Metadata = { title: "Audit trail" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ query?: string }> }) {
  const { query = "" } = await searchParams;
  const events = await listAuditEvents({ query, limit: 200 });
  return <AutomationPage name="audit"><PageHeader eyebrow="Controls" title="Audit trail" description="Append-only record of authenticated banking activity." /><Panel className="search-panel" title="Filter events"><form action="/audit" method="get" role="search" data-bp="audit-search-form"><div className="field"><label htmlFor="audit-search-query">Actor, action, entity or correlation ID</label><input id="audit-search-query" name="query" data-bp="audit-search-query" defaultValue={query} autoComplete="off" /></div><div className="field"><label htmlFor="audit-result-limit">Result limit</label><select id="audit-result-limit" name="limit" data-bp="audit-result-limit" defaultValue="200"><option value="50">50</option><option value="100">100</option><option value="200">200</option></select></div><button id="audit-search-submit" name="intent" value="search" data-bp="audit-search-submit" className="primary-button" type="submit">Filter</button></form></Panel><Panel title={`Events (${events.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="audit-results-table"><thead><tr><th>Occurred</th><th>Actor</th><th>Action</th><th>Entity type</th><th>Entity reference</th><th>Correlation ID</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} data-bp={`audit-row-${event.id}`}><td>{formatDate(event.occurredAt, true)}</td><td>{event.actorUsername}</td><td><Badge tone="info">{labelEnum(event.action)}</Badge></td><td>{labelEnum(event.entityType)}</td><td className="mono">{event.entityReference}</td><td className="mono">{event.correlationId}</td></tr>)}</tbody></table></div></Panel></AutomationPage>;
}
