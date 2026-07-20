import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title || description ? (
        <div className="panel-heading">
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function StatusRegion({
  tone = "info",
  children,
  id = "page-status",
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`status-region status-${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      data-bp={`status-${id}`}
    >
      {children}
    </div>
  );
}

export function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  bp,
}: {
  label: string;
  value: string;
  detail: string;
  bp: string;
}) {
  return (
    <div className="metric" data-bp={bp}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "positive" | "warning" | "negative" | "info" | "neutral";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
