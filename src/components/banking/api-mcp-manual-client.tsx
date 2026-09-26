"use client";

import { useMemo, useRef, useState } from "react";
import { Computer, Search, X } from "lucide-react";

export type ApiOperation = {
  method: string;
  path: string;
  group: string;
  summary: string;
  description: string;
  parameters: string[];
};

type McpTool = [name: string, description: string, mode: "Read" | "Write"];
type Tab = "start" | "mcp" | "api" | "workflows";

const mcpGroups: Array<{ name: string; intro: string; tools: McpTool[] }> = [
  { name: "Customers and accounts", intro: "Customer records, beneficiaries, account opening and account controls.", tools: [
    ["search_customers", "Find customers by name or customer number.", "Read"], ["get_customer", "Read one customer and its permitted relationship details.", "Read"], ["list_beneficiaries", "List beneficiaries, optionally for one customer.", "Read"],
    ["create_customer", "Create a retail or SME customer; returns the new customer number.", "Write"], ["update_customer", "Replace supported mutable customer fields; this is a full update.", "Write"], ["create_beneficiary", "Create an external payee for a customer, subject to KYC and restriction checks.", "Write"], ["set_beneficiary_status", "Activate or deactivate a beneficiary.", "Write"], ["apply_customer_restriction", "Apply a debit block, payment review or onboarding hold.", "Write"], ["lift_customer_restriction", "Lift an active restriction with a reason.", "Write"],
    ["get_account", "Read an account, balance and associated permitted details.", "Read"], ["list_accounts", "Search or page through accounts.", "Read"], ["list_products", "Discover account products and opening requirements.", "Read"], ["open_account", "Open an account; a supplied opening deposit posts through the ledger.", "Write"], ["set_account_status", "Activate, block or close an account, subject to closure controls.", "Write"], ["get_account_statement", "Download an account statement as CSV for an inclusive date range.", "Read"],
  ] },
  { name: "Payments and reversals", intro: "Internal and external transfers, payment decisions and controlled reversals.", tools: [
    ["list_payments", "List payments, optionally filtered by status.", "Read"], ["get_payment", "Read payment, hold, decision and reversal state.", "Read"], ["list_payment_reversals", "List reversal requests, optionally by status.", "Read"], ["get_payment_reversal", "Read reversal decision state and any linked posting.", "Read"],
    ["submit_payment", "Submit an idempotent internal or external payment; it may book or await approval.", "Write"], ["decide_payment", "Approve or reject a pending payment as an eligible independent checker.", "Write"], ["expire_pending_payments", "Expire eligible stale pending payments and release their holds.", "Write"], ["request_payment_reversal", "Request an idempotent full-value reversal; the original remains unchanged.", "Write"], ["decide_payment_reversal", "Approve or reject a reversal; approval posts a linked counter-transaction.", "Write"],
  ] },
  { name: "Schedules and direct debits", intro: "Future-dated instructions and creditor mandates/collections.", tools: [
    ["list_payment_instructions", "List scheduled payments and standing orders.", "Read"], ["get_payment_instruction", "Read a schedule, version and execution history.", "Read"], ["list_payment_instruction_runs", "List scheduled-payment processing runs and outcomes.", "Read"], ["create_payment_instruction", "Create a future-dated payment or standing order; it reserves no funds.", "Write"], ["cancel_payment_instruction", "Cancel an instruction using its current version and a reason.", "Write"], ["run_payment_instructions", "Process all due instructions for a business date; payments may book or enter approval.", "Write"],
    ["list_direct_debit_mandates", "List customer mandates and collection history.", "Read"], ["get_direct_debit_mandate", "Read one mandate and its collection history.", "Read"], ["create_direct_debit_mandate", "Create a mandate for an eligible owned account and creditor beneficiary.", "Write"], ["cancel_direct_debit_mandate", "Cancel a mandate with its current version and a reason.", "Write"], ["submit_direct_debit_collection", "Submit an idempotent collection; it may book, await approval or be rejected.", "Write"],
  ] },
  { name: "Work items and KYC", intro: "Maker-checker assignments, customer due diligence, evidence and screening.", tools: [
    ["list_work_items", "Filter the work queue by status, type, priority, assignee or overdue state.", "Read"], ["get_work_item", "Read assignment, current version, state and event history.", "Read"], ["claim_work_item", "Claim an eligible work item at its expected version.", "Write"], ["release_work_item", "Release a work item assigned to the current actor.", "Write"], ["list_kyc_cases", "List KYC case summaries.", "Read"], ["get_kyc_case", "Read case CDD, evidence, screening and restrictions.", "Read"], ["open_kyc_case", "Open a KYC case for a customer.", "Write"], ["update_kyc_cdd", "Create or replace a case CDD profile.", "Write"], ["record_kyc_evidence", "Record fictional evidence metadata; this does not upload file bytes.", "Write"], ["delete_customer_document", "Delete a non-seeded customer document by reference.", "Write"], ["update_kyc_evidence", "Correct evidence metadata within a case.", "Write"], ["run_kyc_screening", "Run the fictional screening rules and store results.", "Write"], ["set_kyc_case_lock", "Lock or unlock a case with reason and expected version.", "Write"], ["verify_kyc_evidence", "Verify or reject evidence with reviewer notes.", "Write"], ["resolve_kyc_screening", "Resolve a possible fictional match with a decision comment.", "Write"], ["submit_kyc_case", "Submit a complete case and create Compliance review work.", "Write"], ["decide_kyc_case", "Approve or reject a submitted case as an independent Compliance actor.", "Write"],
  ] },
  { name: "Overdrafts", intro: "Arranged facilities, independent approvals and monitoring alerts.", tools: [
    ["list_overdraft_facilities", "List facilities, limits, utilization and headroom.", "Read"], ["get_overdraft_facility", "Read facility terms, holds, alerts and limit history.", "Read"], ["apply_for_overdraft", "Submit an eligible account limit application for approval.", "Write"], ["request_overdraft_limit_change", "Request a facility limit change for independent approval.", "Write"], ["decide_overdraft", "Approve or decline an application/change using current work-item version.", "Write"], ["set_overdraft_status", "Suspend or close a facility, subject to utilization and hold checks.", "Write"], ["resolve_overdraft_alert", "Record an intervention and resolve an overdraft alert.", "Write"],
  ] },
  { name: "Accounting and lending", intro: "Daily posting, reconciliation, close control, journals and loan origination.", tools: [
    ["list_end_of_day_runs", "List daily charge and interest posting runs.", "Read"], ["get_end_of_day_run", "Read a daily run and its posting outcomes.", "Read"], ["run_end_of_day", "Post configured daily charges and interest once for a business date.", "Write"], ["list_reconciliation_runs", "List clearing reconciliation runs.", "Read"], ["get_reconciliation_run", "Read matched and exception items for a run.", "Read"], ["run_reconciliation", "Match fictional settlement evidence for a business date; it does not post ledger entries.", "Write"], ["resolve_reconciliation_item", "Resolve an exception using its current version and a comment.", "Write"], ["list_accounting_periods", "List accounting-period status and close evidence.", "Read"], ["get_accounting_period", "Read period version and latest close work item.", "Read"], ["request_accounting_period_close", "Request period close review; the period freezes while under review.", "Write"], ["decide_accounting_period_close", "Approve or reject close as a distinct Admin after checks.", "Write"], ["list_general_ledger_accounts", "List GL accounts and posting controls.", "Read"], ["get_trial_balance", "Read posted trial balance for a date range and currency.", "Read"], ["list_general_ledger_journals", "List automated and manual journals with their decision state.", "Read"], ["get_general_ledger_journal", "Read journal lines and approval work item.", "Read"], ["submit_manual_journal", "Submit an idempotent balanced journal for independent approval.", "Write"], ["decide_manual_journal", "Approve or reject a journal; approval posts after controls pass.", "Write"], ["list_loan_applications", "List loan applications by status.", "Read"], ["get_loan_application", "Read loan terms, decision evidence and repayment schedule.", "Read"], ["submit_loan_application", "Submit an idempotent loan proposal; submission moves no funds.", "Write"], ["decide_loan_application", "Approve or reject a loan; approval books disbursement and schedule atomically.", "Write"],
  ] },
];

const mcpTools: McpTool[] = mcpGroups.flatMap((group) => group.tools);

const snippets = {
  apiRead: [
    'curl "https://future-bank-demo.vercel.app/api/v1/accounts/1000000001" \\',
    '  -H "Authorization: Bearer $FUTUREBANK_ACTOR_API_KEY"',
  ].join("\n"),
  apiWrite: [
    'curl -X POST "https://future-bank-demo.vercel.app/api/v1/payments" \\',
    '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
    '  -H "Idempotency-Key: demo-payment-0001" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"paymentType":"INTERNAL","sourceAccountNumber":"1000000001","destinationAccountNumber":"1000000002","amount":"10.00","description":"API demonstration"}\'',
  ].join("\n"),
  mcp: [
    'curl -X POST "https://future-bank-demo.vercel.app/mcp" \\',
    '  -H "Authorization: Bearer $FUTUREBANK_ACTOR_API_KEY" \\',
    '  -H "MCP-Protocol-Version: 2025-11-25" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Accept: application/json, text/event-stream" \\',
    '  -d \'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_account","arguments":{"accountNumber":"1000000001"}}}\'',
  ].join("\n"),
  mcpWrite: [
    'curl -X POST "https://future-bank-demo.vercel.app/mcp" \\',
    '  -H "Authorization: Bearer $FUTUREBANK_ACTOR_API_KEY" \\',
    '  -H "MCP-Protocol-Version: 2025-11-25" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Accept: application/json, text/event-stream" \\',
    '  -d \'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"submit_payment","arguments":{"paymentType":"INTERNAL","sourceAccountNumber":"1000000001","destinationAccountNumber":"1000000002","amount":"10.00","description":"MCP demonstration","idempotencyKey":"demo-payment-0001"}}}\'',
  ].join("\n"),
};

export function ApiMcpManualClient({ apiOperations }: { apiOperations: ApiOperation[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("start");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const matchingTools = useMemo(() => mcpTools.filter(([name, description]) => !q || `${name} ${description}`.toLocaleLowerCase().includes(q)), [q]);
  const matchingOperations = useMemo(() => apiOperations.filter((op) => !q || `${op.method} ${op.path} ${op.group} ${op.summary} ${op.description}`.toLocaleLowerCase().includes(q)), [apiOperations, q]);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  function open() {
    dialogRef.current?.showModal();
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  return <>
    <button className="api-manual-trigger" type="button" aria-label="Open API and MCP manual" title="API and MCP manual" onClick={open}>
      <Computer aria-hidden="true" size={17} strokeWidth={1.9} />
    </button>
    <dialog className="api-manual-dialog" ref={dialogRef} aria-labelledby="api-manual-title" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
      <div className="api-manual-window">
        <header className="api-manual-header">
          <div><span className="api-manual-kicker">FutureBank integration guide</span><h2 id="api-manual-title">API &amp; MCP manual</h2><p>Connect an approved actor and choose the interface that fits your integration.</p></div>
          <button className="api-manual-close" type="button" aria-label="Close manual" onClick={() => dialogRef.current?.close()}><X size={20} /></button>
        </header>
        <div className="api-manual-search"><Search size={16} aria-hidden="true" /><label className="sr-only" htmlFor="api-manual-search-input">Search the manual</label><input ref={searchRef} id="api-manual-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools, endpoints and workflows" /></div>
        <div className="api-manual-tabs" role="tablist" aria-label="Manual sections">
          {([["start", "Getting started"], ["mcp", `MCP tools (${mcpTools.length})`], ["api", `REST API (${apiOperations.length})`], ["workflows", "Workflow guidance"]] as Array<[Tab, string]>).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>{label}</button>)}
        </div>
        <div className="api-manual-content" role="tabpanel">
          {tab === "start" && <>
            <section className="api-manual-section api-manual-intro"><span className="api-manual-pill">Demo environment · fictional data</span><h3>Choose REST for endpoint control, or MCP for tool discovery.</h3><p>Both interfaces use the same actor-owned API key, authorization rules and audited banking actions. MCP clients discover callable tools; REST clients call documented HTTP routes.</p><div className="api-manual-links"><a href="/api/openapi.json" target="_blank" rel="noreferrer">Open the full OpenAPI contract ↗</a><span>REST base: <code>/api/v1</code></span><span>MCP endpoint: <code>/mcp</code></span></div></section>
            <div className="api-manual-columns"><section className="api-manual-section"><h3>1. Get an actor key</h3><p>Ask the FutureBank environment owner for an actor-owned key. The key selects the Operator, Supervisor, Compliance or Admin identity; it cannot impersonate another user.</p><p>Store it in your connector&apos;s secret store or environment variable. Never put a key in browser code, source control, logs or prompts.</p></section><section className="api-manual-section"><h3>2. Call REST</h3><p>Send the key in <code>Authorization: Bearer …</code> or <code>X-API-Key</code>. Business endpoints return a JSON <code>data</code> envelope; errors return an <code>error</code> object.</p><CodeBlock label="API read example" code={snippets.apiRead} copied={copied} onCopy={copy} /><CodeBlock label="API write example" code={snippets.apiWrite} copied={copied} onCopy={copy} /></section></div>
            <section className="api-manual-section"><h3>3. Connect an MCP client</h3><p>Configure Streamable HTTP at <code>https://future-bank-demo.vercel.app/mcp</code>, with the actor key as a bearer token or <code>X-API-Key</code>. Negotiate protocol <code>2025-11-25</code>, initialize, then use <code>tools/list</code> and <code>tools/call</code>.</p><CodeBlock label="MCP tool call example" code={snippets.mcp} copied={copied} onCopy={copy} /></section>
            <section className="api-manual-section"><h3>Response and errors</h3><p>MCP tool responses include text content and structured results for writes. A successful write means the requested action ran; it does not mean a pending payment, journal or application was approved or posted. Check the returned status and read the referenced record when needed.</p><p>HTTP <code>401</code> means missing/invalid authentication; <code>403</code> means the actor lacks permission; <code>409</code> commonly signals stale versions, state conflicts or idempotency conflicts. Follow the returned error code and message.</p></section>
          </>}
          {tab === "mcp" && <>
            <section className="api-manual-section"><h3>MCP tools</h3><p>Tools are grouped by banking workflow. Read tools retrieve permitted data; write tools invoke the same validated actions as the UI and REST API. Search filters names and descriptions.</p><CodeBlock label="MCP payment write example" code={snippets.mcpWrite} copied={copied} onCopy={copy} /><p className="api-manual-note">The example is illustrative. Use disposable test data and an idempotency key for retries. A live payment can post immediately or enter independent approval.</p></section>
            <div className="api-manual-tool-groups">{mcpGroups.map((group) => {
              const tools = group.tools.filter(([name, description]) => !q || `${name} ${description}`.toLocaleLowerCase().includes(q));
              if (!tools.length) return null;
              return <section className="api-manual-section" key={group.name}><div className="api-manual-group-heading"><div><h3>{group.name}</h3><p>{group.intro}</p></div><span>{tools.length} tools</span></div><div className="api-manual-tool-list">{tools.map(([name, description, mode]) => <article className="api-manual-tool" key={name}><div><code>{name}</code><span className={`api-manual-mode ${mode === "Write" ? "is-write" : ""}`}>{mode}</span></div><p>{description}</p></article>)}</div></section>;
            })}{matchingTools.length === 0 && <p className="api-manual-empty">No MCP tools match “{query}”.</p>}</div>
          </>}
          {tab === "api" && <>
            <section className="api-manual-section"><h3>REST endpoints</h3><p>Every listed route is derived from the checked-in OpenAPI contract. Path placeholders such as <code>{"{customerNumber}"}</code> must be replaced with actual references. Select the OpenAPI document for full schemas, request bodies, responses and examples.</p><a className="api-manual-openapi" href="/api/openapi.json" target="_blank" rel="noreferrer">View complete OpenAPI 3.0 document ↗</a></section>
            {Array.from(new Set(matchingOperations.map((operation) => operation.group))).map((group) => <section className="api-manual-section" key={group}><h3>{group}</h3><div className="api-manual-endpoints">{matchingOperations.filter((operation) => operation.group === group).map((operation) => <article className="api-manual-endpoint" key={`${operation.method}:${operation.path}`}><div className="api-manual-endpoint-title"><span className={`api-method method-${operation.method.toLowerCase()}`}>{operation.method}</span><code>{`/api/v1${operation.path === "/" ? "" : operation.path}`}</code></div><strong>{operation.summary}</strong><p>{operation.description}</p>{operation.parameters.length > 0 && <small>Parameters: {operation.parameters.join(", ")}</small>}</article>)}</div></section>)}
            {matchingOperations.length === 0 && <p className="api-manual-empty">No REST endpoints match “{query}”.</p>}
          </>}
          {tab === "workflows" && <>
            <section className="api-manual-section"><h3>Safe integration patterns</h3><ul className="api-manual-bullets"><li><strong>Discover before writing.</strong> Use list/read tools or GET routes to obtain current references, status and versions. Do not guess identifiers.</li><li><strong>Use the right actor.</strong> Permissions come from the key owner. Approval workflows require a distinct checker; makers cannot approve their own work.</li><li><strong>Carry expected versions.</strong> Claims, decisions, cancellations and resolutions use optimistic versions. Re-read after a version conflict.</li><li><strong>Make retries safe.</strong> Reuse the same idempotency key with the same payload for supported payment, collection, reversal, journal and loan submissions.</li><li><strong>Confirm final state.</strong> “Submitted” or “pending” is not “approved” or “posted.” Read the returned reference and check its state.</li><li><strong>Keep money exact.</strong> Send money as decimal strings such as <code>&quot;25.00&quot;</code>, never floating-point values.</li></ul></section>
            <section className="api-manual-section"><h3>Important capability limits</h3><ul className="api-manual-bullets"><li>All records and screening outcomes are fictional demonstration data.</li><li>MCP records evidence metadata but does not upload customer-document bytes. REST supports authenticated document upload/download.</li><li>End-of-day, scheduled-payment processing and reconciliation run for a business date and can affect multiple records. Avoid running these against production for experiments.</li><li>Payment, reversal, account opening, manual journal, loan approval and end-of-day actions can post balanced ledger entries when their rules permit.</li><li>Customer statements are CSV; dates are inclusive and the statement range is limited to 366 days.</li></ul></section>
            <section className="api-manual-section"><h3>Where to find the contract</h3><p>The API guide is maintained in <code>docs/api.md</code>. Runtime OpenAPI is available at <a href="/api/openapi.json" target="_blank" rel="noreferrer">/api/openapi.json</a>. MCP clients discover the current callable catalog using <code>tools/list</code> after initialization.</p></section>
          </>}
        </div>
        <footer className="api-manual-footer"><span>FutureBank is a fictional demonstration banking environment.</span><button type="button" onClick={() => dialogRef.current?.close()}>Close manual</button></footer>
      </div>
    </dialog>
  </>;
}

function CodeBlock({ label, code, copied, onCopy }: { label: string; code: string; copied: string; onCopy: (label: string, code: string) => void }) {
  return <div className="api-manual-code"><div><span>{label}</span><button type="button" onClick={() => void onCopy(label, code)}>{copied === label ? "Copied" : "Copy"}</button></div><pre><code>{code}</code></pre></div>;
}
