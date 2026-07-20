import type { ReactNode } from "react";

export function AutomationPage({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <div className="page-stack" data-bp-page={name} data-bp-ready="true">
      {children}
    </div>
  );
}
