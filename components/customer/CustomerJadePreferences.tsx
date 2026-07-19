"use client";

import { Gem, Ruler, Wallet, Globe2, Target } from "lucide-react";
import { Customer } from "@/types/customer";
import { parseMultiValue } from "@/lib/customer.service";
import { JADE_ORIGINS, labelFor } from "@/lib/customer.constants";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

interface Props {
  customer: Customer;
}

export default function CustomerJadePreferences({ customer }: Props) {
  const types = parseMultiValue(customer.favorite_type);
  const colors = parseMultiValue(customer.favorite_color);
  const origin = labelFor(JADE_ORIGINS, customer.preferred_origin);
  const purpose = customer.purpose;

  const hasAny =
    customer.wrist_size ||
    customer.ring_size ||
    customer.budget ||
    types.length > 0 ||
    colors.length > 0 ||
    origin ||
    purpose;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Gem className="w-5 h-5 text-primary" />
        Wishlist
      </h2>

      {!hasAny ? (
        <p className="text-sm text-muted-foreground text-center py-6">Chưa có thông tin sở thích.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {customer.wrist_size && (
              <div className="flex items-center gap-2.5">
                <Ruler className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Kích thước cổ tay</p>
                  <p className="text-sm font-medium text-foreground">{customer.wrist_size}</p>
                </div>
              </div>
            )}

            {customer.ring_size && (
              <div className="flex items-center gap-2.5">
                <Ruler className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Size nhẫn</p>
                  <p className="text-sm font-medium text-foreground">{customer.ring_size}</p>
                </div>
              </div>
            )}

            {customer.budget && (
              <div className="flex items-center gap-2.5">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Ngân sách</p>
                  <p className="text-sm font-medium text-foreground">{customer.budget}</p>
                </div>
              </div>
            )}

            {origin && (
              <div className="flex items-center gap-2.5">
                <Globe2 className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Nguồn gốc ưa thích</p>
                  <p className="text-sm font-medium text-foreground">{origin}</p>
                </div>
              </div>
            )}

            {purpose && (
              <div className="flex items-center gap-2.5">
                <Target className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Mục đích</p>
                  <p className="text-sm font-medium text-foreground">{purpose}</p>
                </div>
              </div>
            )}
          </div>

          {types.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Loại sản phẩm quan tâm</p>
              <div className="flex flex-wrap gap-1.5">
                {types.map((t) => (
                  <Badge key={t} variant="muted">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {colors.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Màu sắc yêu thích</p>
              <div className="flex flex-wrap gap-1.5">
                {colors.map((c) => (
                  <Badge key={c} variant="muted">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
