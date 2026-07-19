import { supabase } from "@/lib/supabase";

// This module intentionally reads customer_purchases/products directly
// rather than importing customer.service.ts / product.service.ts /
// purchase.service.ts / report.service.ts / reports.service.ts /
// inventory.service.ts - Market Intelligence has no shared business logic
// with any other module (MARKET_INTELLIGENCE_SPEC.md §1 Independence,
// same pattern as REPORTS_SPEC.md Decision 5).

const UNSPECIFIED = "Chưa xác định";

export interface RankingRow {
  label: string;
  value: number;
}

export interface DualRanking {
  byPurchaseCount: RankingRow[];
  byRevenue: RankingRow[];
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  purchaseCount: number;
  revenue: number;
}

export interface MarketIntelligenceSummary {
  totalRevenue: number;
  totalPurchases: number;
  totalCategories: number;
  totalColors: number;
}

export interface MarketIntelligenceData {
  summary: MarketIntelligenceSummary;
  categoryRankings: DualRanking;
  colorRankings: DualRanking;
  sizeRankings: RankingRow[];
  customerBuyingTrend: MonthlyPoint[];
  productDemandTrend: MonthlyPoint[];
}

const EMPTY_DUAL: DualRanking = { byPurchaseCount: [], byRevenue: [] };
const EMPTY_DATA: MarketIntelligenceData = {
  summary: { totalRevenue: 0, totalPurchases: 0, totalCategories: 0, totalColors: 0 },
  categoryRankings: EMPTY_DUAL,
  colorRankings: EMPTY_DUAL,
  sizeRankings: [],
  customerBuyingTrend: [],
  productDemandTrend: [],
};

interface PurchaseRow {
  sale_price: number;
  sale_date: string;
  product: { category: string | null; color: string | null; size: number | null } | null;
}

function buildDualRanking(map: Map<string, { count: number; revenue: number }>): DualRanking {
  const entries = Array.from(map, ([label, v]) => ({ label, ...v }));
  return {
    byPurchaseCount: entries
      .map((e) => ({ label: e.label, value: e.count }))
      .sort((a, b) => b.value - a.value),
    byRevenue: entries
      .map((e) => ({ label: e.label, value: e.revenue }))
      .sort((a, b) => b.value - a.value),
  };
}

/**
 * Every card/table/chart on the Market Intelligence page is derived
 * client-side from this one customer_purchases fetch (joined to each
 * purchase's product for category/color/size) - same single-fetch pattern
 * Reports uses. Category/Color/Size Rankings are All Time totals, no date
 * filter (MARKET_INTELLIGENCE_UI.md Decision 2). Monthly Trends bucket by
 * calendar month only (MARKET_INTELLIGENCE_SPEC.md §2.4-2.5, Decision 4).
 */
export async function getMarketIntelligenceData(): Promise<MarketIntelligenceData> {
  const { data, error } = await supabase
    .from("customer_purchases")
    .select("sale_price, sale_date, product:products(category, color, size)");

  if (error || !data) {
    if (error) console.error("Error fetching market intelligence data:", error);
    return EMPTY_DATA;
  }

  const rows = data as unknown as PurchaseRow[];

  const categoryMap = new Map<string, { count: number; revenue: number }>();
  const colorMap = new Map<string, { count: number; revenue: number }>();
  const sizeMap = new Map<string, number>();
  const monthMap = new Map<string, { count: number; revenue: number }>();

  let totalRevenue = 0;

  for (const row of rows) {
    const price = Number(row.sale_price) || 0;
    totalRevenue += price;

    const categoryKey = row.product?.category || UNSPECIFIED;
    const category = categoryMap.get(categoryKey) || { count: 0, revenue: 0 };
    category.count += 1;
    category.revenue += price;
    categoryMap.set(categoryKey, category);

    const colorKey = row.product?.color || UNSPECIFIED;
    const color = colorMap.get(colorKey) || { count: 0, revenue: 0 };
    color.count += 1;
    color.revenue += price;
    colorMap.set(colorKey, color);

    const sizeKey = row.product?.size != null ? String(row.product.size) : UNSPECIFIED;
    sizeMap.set(sizeKey, (sizeMap.get(sizeKey) || 0) + 1);

    // Monthly Trends can only place a purchase on the timeline if sale_date
    // parses as a real calendar date (YYYY-MM-DD) - unlike category/color,
    // there is no meaningful "Chưa xác định" position on a month axis, so a
    // row with an invalid sale_date is skipped here only (it still counts
    // toward Total Purchases/Revenue and every Ranking above, which carry no
    // time dimension). This is a defensive parse guard, not a business rule.
    if (/^\d{4}-\d{2}-\d{2}/.test(row.sale_date || "")) {
      const monthKey = row.sale_date.slice(0, 7);
      const month = monthMap.get(monthKey) || { count: 0, revenue: 0 };
      month.count += 1;
      month.revenue += price;
      monthMap.set(monthKey, month);
    }
  }

  const monthlyPoints: MonthlyPoint[] = Array.from(monthMap, ([month, v]) => ({
    month,
    purchaseCount: v.count,
    revenue: v.revenue,
  })).sort((a, b) => a.month.localeCompare(b.month));

  const sizeRankings: RankingRow[] = Array.from(sizeMap, ([label, value]) => ({ label, value })).sort(
    (a, b) => b.value - a.value
  );

  return {
    summary: {
      totalRevenue,
      totalPurchases: rows.length,
      totalCategories: categoryMap.size,
      totalColors: colorMap.size,
    },
    categoryRankings: buildDualRanking(categoryMap),
    colorRankings: buildDualRanking(colorMap),
    sizeRankings,
    // Customer Buying Trends (Spec §2.4): purchase count + revenue by month,
    // aggregated across all customers - no per-customer/segment selector
    // (MARKET_INTELLIGENCE_UI.md §1.7, Revision 2).
    customerBuyingTrend: monthlyPoints,
    // Product Demand Trends (Spec §2.5): purchase count by month, aggregated
    // across all products - no per-category/color/product selector (same
    // §1.7 decision). At this aggregate level the count series is
    // mathematically identical to customerBuyingTrend's purchase-count line;
    // this is a direct consequence of the locked "no selector" UI decision,
    // not a bug - flagged for the Product Owner in the increment's Self
    // Review rather than silently diverging with an uninstructed rule.
    productDemandTrend: monthlyPoints,
  };
}
