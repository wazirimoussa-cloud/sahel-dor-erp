export const LOW_STOCK_THRESHOLDS: Record<string, number> = {
  tonne: 1,
  carton: 5,
  bidon: 5,
  "unité": 5,
};

export function isLowStock(stock: number, unit: string): boolean {
  return stock < (LOW_STOCK_THRESHOLDS[unit] ?? 5);
}
