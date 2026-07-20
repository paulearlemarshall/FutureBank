export function formatMoney(amount: string, currency = "GBP") {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

export function formatDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", includeTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }
    : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function labelEnum(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
