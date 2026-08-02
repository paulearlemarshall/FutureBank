import type { Metadata } from "next";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel } from "@/components/banking/ui";
import { listProducts } from "@/modules/queries";

export const metadata: Metadata = { title: "Product catalogue" };

export default async function ProductsPage() {
  const products = await listProducts();
  return <AutomationPage name="products"><PageHeader eyebrow="Product catalogue" title="Banking products" description="Reference catalogue used by deposit opening and controlled loan origination." /><Panel title={`Products (${products.length})`} description="Loan products snapshot their configured pricing when an application is submitted."><div style={{ margin: "-16px" }}><table className="data-table" data-bp="product-table"><thead><tr><th>Product code</th><th>Name</th><th>Family</th><th>Currency</th><th className="numeric">Minimum opening</th><th className="numeric">Interest rate</th><th>Status</th></tr></thead><tbody>{products.map((product) => <tr key={product.code} data-bp={`product-row-${product.code}`}><td className="mono">{product.code}</td><td><strong>{product.name}</strong></td><td>{labelEnum(product.kind)}</td><td>{product.currency}</td><td className="numeric">{formatMoney(product.minimumOpeningBalance, product.currency)}</td><td className="numeric">{product.interestRate}%</td><td><Badge tone={product.active ? "positive" : "warning"}>{product.active ? "Available" : "Unavailable"}</Badge></td></tr>)}</tbody></table></div></Panel></AutomationPage>;
}
