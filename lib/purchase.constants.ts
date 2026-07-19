// Revenue thresholds in VND, as given: >50M, >100M, >300M, >500M, >1B.
export const REVENUE_FILTERS = [
  { value: "50000000", label: ">50 triệu" },
  { value: "100000000", label: ">100 triệu" },
  { value: "300000000", label: ">300 triệu" },
  { value: "500000000", label: ">500 triệu" },
  { value: "1000000000", label: ">1 tỷ" },
];

export type CustomerTier = "Silver" | "Gold" | "Platinum" | "Diamond";

// Tier boundaries reuse 4 of the 5 given thresholds (50M/100M/300M/500M).
// The 5th (>1B) is treated as a finer filter within the Diamond tier rather
// than a distinct 5th tier, since only 4 tier names were given.
const TIER_THRESHOLDS: { min: number; tier: CustomerTier }[] = [
  { min: 500_000_000, tier: "Diamond" },
  { min: 300_000_000, tier: "Platinum" },
  { min: 100_000_000, tier: "Gold" },
  { min: 50_000_000, tier: "Silver" },
];

export function getCustomerTier(totalRevenue: number): CustomerTier | null {
  for (const { min, tier } of TIER_THRESHOLDS) {
    if (totalRevenue >= min) return tier;
  }
  return null;
}

export const TIER_BADGE_VARIANT: Record<CustomerTier, "muted" | "warning" | "secondary" | "default"> = {
  Silver: "muted",
  Gold: "warning",
  Platinum: "secondary",
  Diamond: "default",
};
