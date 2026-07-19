"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, ImageOff, History } from "lucide-react";
import { Customer } from "@/types/customer";
import { parseMultiValue } from "@/lib/utils";
import {
  getMatchingProducts,
  getPurchaseHistorySummary,
  MatchedProduct,
  PurchaseHistorySummary,
} from "@/lib/product.service";
import { coverImageUrl } from "@/lib/productImage.service";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

interface Props {
  customer: Customer;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const MATCH_LABELS: Record<string, string> = {
  category: "Đúng loại",
  color: "Đúng màu",
  wrist_size: "Đúng size tay",
  ring_size: "Đúng size nhẫn",
  budget: "Trong ngân sách",
  purchase_history: "Từng mua tương tự",
};

export default function CustomerMatchingProducts({ customer }: Props) {
  const [matches, setMatches] = useState<MatchedProduct[] | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistorySummary | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const history = await getPurchaseHistorySummary(customer.id);
      if (ignore) return;
      setPurchaseHistory(history);

      const data = await getMatchingProducts(customer, 6, history);
      if (!ignore) setMatches(data);
    }
    load();
    return () => {
      ignore = true;
    };
  }, [
    customer.id,
    customer.favorite_type,
    customer.favorite_color,
    customer.wrist_size,
    customer.ring_size,
    customer.budget,
  ]);

  const types = parseMultiValue(customer.favorite_type);
  const colors = parseMultiValue(customer.favorite_color);
  const hasWishlist =
    types.length > 0 || colors.length > 0 || !!customer.wrist_size || !!customer.ring_size || !!customer.budget;
  const hasPurchaseHistory = !!purchaseHistory && purchaseHistory.totalPurchases > 0;
  const hasAnySignal = hasWishlist || hasPurchaseHistory;
  const isLoading = matches === null || purchaseHistory === null;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        Sản phẩm phù hợp
      </h2>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin text-xl">⟳</div>
        </div>
      ) : !hasAnySignal ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Thêm sở thích hoặc lịch sử mua hàng của khách để xem gợi ý sản phẩm phù hợp.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Customer Preference Summary - only the 4 fields the engine matches on (AI_JADE_SPEC.md §2.1) */}
          {hasWishlist ? (
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => (
                <Badge key={`type-${t}`} variant="muted">
                  {t}
                </Badge>
              ))}
              {colors.map((c) => (
                <Badge key={`color-${c}`} variant="muted">
                  {c}
                </Badge>
              ))}
              {customer.wrist_size && <Badge variant="muted">Size tay {customer.wrist_size}</Badge>}
              {customer.ring_size && <Badge variant="muted">Size nhẫn {customer.ring_size}</Badge>}
              {customer.budget && <Badge variant="muted">Ngân sách {customer.budget}</Badge>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Chưa có thông tin sở thích.</p>
          )}

          {/* Purchase History Summary - Total Purchases / Favorite Category / Favorite Color only */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <History className="w-3.5 h-3.5 shrink-0" />
            {hasPurchaseHistory && purchaseHistory ? (
              <span>
                {purchaseHistory.totalPurchases} giao dịch
                {purchaseHistory.favoriteCategory && ` · Loại yêu thích: ${purchaseHistory.favoriteCategory}`}
                {purchaseHistory.favoriteColor && ` · Màu yêu thích: ${purchaseHistory.favoriteColor}`}
              </span>
            ) : (
              <span>Chưa có lịch sử mua hàng.</span>
            )}
          </div>

          {/* Product Recommendation List */}
          {!matches || matches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Chưa có sản phẩm đang bán khớp với khách hàng này.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {matches.map(({ product, matchedOn, score }) => (
                <Link
                  key={product.id}
                  href={`/products/${product.id}`}
                  className="flex gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {coverImageUrl(product) ? (
                    <img
                      src={coverImageUrl(product)}
                      alt={product.product_name}
                      className="w-14 h-14 rounded-lg object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <ImageOff className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {product.product_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {product.category}
                      {product.color && ` · ${product.color}`}
                    </p>
                    {typeof product.sale_price === "number" && (
                      <p className="text-sm font-semibold text-primary mt-0.5">
                        {currency.format(product.sale_price)}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {matchedOn.map((m) => (
                        <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {MATCH_LABELS[m]}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-1.5">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>Độ phù hợp</span>
                        <span className="font-semibold text-foreground">{score}/100</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
