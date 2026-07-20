import Link from "next/link";

const tabs = ["Overview", "Accounts", "KYC", "Contact & address", "Relationships", "Audit"] as const;

export function CustomerTabs({
  customerNumber,
  active = "Overview",
}: {
  customerNumber: string;
  active?: (typeof tabs)[number];
}) {
  return (
    <nav className="record-tabs" aria-label="Customer sections" data-bp="customer-tabs">
      {tabs.map((tab) => {
        const slug = tab === "Overview" ? "" : `?tab=${encodeURIComponent(tab.toLowerCase())}`;
        return (
          <Link
            key={tab}
            href={`/customers/${customerNumber}${slug}`}
            aria-current={tab === active ? "page" : undefined}
            data-bp={`customer-tab-${tab.toLowerCase().replaceAll(" ", "-").replace("&", "and")}`}
          >
            {tab}
          </Link>
        );
      })}
    </nav>
  );
}
