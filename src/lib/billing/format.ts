/** Client-safe price display. `null` means "not configured" — callers say "shown at checkout". */
export function formatPrice(price: { amount: number; currency: string; interval?: "month" | "year" | null } | null): string | null {
  if (!price) return null;
  try {
    const text = new Intl.NumberFormat("en", {
      style: "currency",
      currency: price.currency,
      minimumFractionDigits: price.amount % 100 === 0 ? 0 : 2,
    }).format(price.amount / 100);
    return price.interval ? `${text}/${price.interval === "year" ? "yr" : "mo"}` : text;
  } catch {
    return null;
  }
}
