"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { currency } from "@/lib/reports/format";
import { formatDate } from "@/lib/utils";
import { EMPTY_VALUE, orderStatusLabel, paymentMethodLabel, paymentStatusLabel } from "@/lib/reports/labels.vi";
import { PRODUCT_STATUS, labelFor } from "@/lib/product.constants";
import { DetailTarget, fullPageHref } from "@/lib/reports/entityDetailParam";
import type {
  CustomerDrawerData,
  DetailCustomerRef,
  DetailEntityType,
  InventoryDrawerData,
  OrderDrawerData,
  ProductDrawerData,
} from "@/types/reportDetail";
import EntityLink from "./EntityLink";

const ENTITY_TITLE: Record<DetailEntityType, string> = {
  order: "Chi tiết đơn hàng",
  product: "Chi tiết sản phẩm",
  customer: "Chi tiết khách hàng",
  inventory: "Chi tiết tồn kho",
};

type LoadState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

const money = (v: number | null | undefined) => (v === null || v === undefined ? EMPTY_VALUE : currency.format(v));

/** One request per click - nothing is fetched until the user opens an entity.
 * Keyed by type+id, so switching entity inside the drawer replaces only the
 * panel content; the report underneath is never reloaded. */
function useDetail<T>(target: DetailTarget | null): LoadState<T> {
  const key = target ? `${target.type}:${target.id}` : null;
  const [state, setState] = useState<{ key: string | null; value: LoadState<T> }>({ key: null, value: { status: "loading" } });

  useEffect(() => {
    if (!target || !key) return;
    const controller = new AbortController();
    fetch(`/api/reports/detail/${target.type}/${target.id}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.ok) return setState({ key, value: { status: "ready", data: (await res.json()) as T } });
        const message =
          res.status === 403
            ? "Bạn không có quyền xem báo cáo này."
            : res.status === 404
              ? "Không tìm thấy dữ liệu, hoặc nằm ngoài phạm vi bạn được xem."
              : "Không tải được chi tiết. Vui lòng thử lại.";
        setState({ key, value: { status: "error", message } });
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setState({ key, value: { status: "error", message: "Không tải được chi tiết. Vui lòng thử lại." } });
      });
    return () => controller.abort();
    // target is fully described by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A result for a previous entity is never shown against the new one.
  return state.key === key ? state.value : { status: "loading" };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right tabular-nums ${strong ? "font-semibold text-foreground" : ""}`}>{children}</span>
    </div>
  );
}

function CustomerLink({ customer }: { customer: DetailCustomerRef | null }) {
  if (!customer) return <>{EMPTY_VALUE}</>;
  return (
    <EntityLink type="customer" id={customer.id}>
      {customer.full_name}
      {customer.customer_code ? ` (${customer.customer_code})` : ""}
    </EntityLink>
  );
}

function productText(code: string | null, name: string | null) {
  return [code, name].filter(Boolean).join(" · ") || EMPTY_VALUE;
}

function OrderContent({ data }: { data: OrderDrawerData }) {
  const { order, customer, items, totals, payments } = data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted">{orderStatusLabel(order.order_status)}</Badge>
        <Badge variant="muted">{paymentStatusLabel(order.payment_status)}</Badge>
      </div>
      <Section title="Thông tin đơn">
        <Row label="Số đơn">{order.order_number}</Row>
        <Row label="Ngày đơn">{formatDate(order.order_date)}</Row>
        <Row label="Khách hàng">
          <CustomerLink customer={customer} />
        </Row>
        <Row label="Nhân viên bán hàng">{order.sales_owner ?? EMPTY_VALUE}</Row>
      </Section>

      <Section title="Sản phẩm trong đơn">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Đơn chưa có sản phẩm.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.item_id} className="rounded-lg border border-border p-3 space-y-1" data-testid="drawer-order-item">
                <div className="text-sm font-medium">
                  <EntityLink type="product" id={it.product_id}>
                    {productText(it.product_code, it.product_name)}
                  </EntityLink>
                  {it.is_gift && <span className="ml-2 text-xs text-muted-foreground">(quà tặng)</span>}
                </div>
                <Row label="Giá bán cuối (thành tiền dòng ÷ số lượng)">{money(it.quantity > 0 ? it.line_total / it.quantity : it.unit_price)}</Row>
                <Row label="Số lượng">{it.quantity}</Row>
                <Row label="Thành tiền dòng" strong>
                  {money(it.line_total)}
                </Row>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Thanh toán (cả đơn)">
        <Row label="Tổng đơn (cả đơn)" strong>
          {money(totals.total_amount)}
        </Row>
        <Row label="Đã thu (cả đơn)">{money(totals.amount_paid)}</Row>
        <Row label="Còn phải thu (cả đơn)">{money(totals.remaining_balance)}</Row>
        {payments.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
            {payments.map((p, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {formatDate(p.payment_date)} · {paymentMethodLabel(p.payment_method)}
                </span>
                <span className="tabular-nums">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ProductHeader({ product }: { product: ProductDrawerData["product"] }) {
  return (
    <Section title="Thông tin sản phẩm">
      <Row label="Mã">{product.product_code ?? EMPTY_VALUE}</Row>
      <Row label="Tên">{product.product_name ?? EMPTY_VALUE}</Row>
      <Row label="Danh mục">{product.category ?? EMPTY_VALUE}</Row>
      <Row label="Trạng thái">{labelFor(PRODUCT_STATUS, product.status)}</Row>
      <Row label="Giá bán niêm yết">{money(product.sale_price)}</Row>
    </Section>
  );
}

function ProductContent({ data }: { data: ProductDrawerData }) {
  return (
    <div className="space-y-5">
      <ProductHeader product={data.product} />
      <Section title="Đơn hàng liên quan">
        {data.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có đơn nào trong phạm vi bạn được xem.</p>
        ) : (
          <ul className="space-y-2">
            {data.orders.map((o) => (
              <li key={o.order_id} className="rounded-lg border border-border p-3 space-y-1" data-testid="drawer-product-order">
                <div className="text-sm font-medium">
                  <EntityLink type="order" id={o.order_id}>
                    {o.order_number}
                  </EntityLink>
                  <span className="ml-2 text-xs text-muted-foreground">{formatDate(o.order_date)}</span>
                </div>
                <Row label="Khách hàng">
                  <CustomerLink customer={o.customer} />
                </Row>
                <Row label="Trạng thái đơn">{orderStatusLabel(o.order_status)}</Row>
                <Row label="Số lượng">{o.quantity}</Row>
                <Row label="Thành tiền dòng">{money(o.line_total)}</Row>
                <Row label="Tổng đơn (cả đơn)">{money(o.total_amount)}</Row>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function CustomerContent({ data }: { data: CustomerDrawerData }) {
  const { customer, orders, summary } = data;
  return (
    <div className="space-y-5">
      <Section title="Thông tin khách hàng">
        <Row label="Tên">{customer.full_name}</Row>
        <Row label="Mã khách hàng">{customer.customer_code ?? EMPTY_VALUE}</Row>
        <Row label="Số điện thoại">{customer.phone ?? EMPTY_VALUE}</Row>
      </Section>
      <Section title="Đơn hàng liên quan">
        <Row label="Số đơn (trong phạm vi của bạn)">
          {summary.truncated ? `${summary.order_count}+` : summary.order_count}
        </Row>
        <Row label="Tổng giá trị đơn (trong phạm vi của bạn)">{money(summary.total_order_value)}</Row>
        {summary.truncated && <p className="text-xs text-muted-foreground">Chỉ hiển thị các đơn gần nhất; không tính tổng.</p>}
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có đơn nào trong phạm vi bạn được xem.</p>
        ) : (
          <ul className="space-y-1">
            {orders.map((o) => (
              <li key={o.order_id} className="flex items-baseline justify-between gap-3 border-t border-border pt-1 text-sm" data-testid="drawer-customer-order">
                <span>
                  <EntityLink type="order" id={o.order_id}>
                    {o.order_number}
                  </EntityLink>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDate(o.order_date)} · {orderStatusLabel(o.order_status)}
                  </span>
                </span>
                <span className="tabular-nums">{money(o.total_amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

const BUCKET_LABEL: Record<InventoryDrawerData["bucket"], string> = {
  held: "Hàng đang giữ",
  remaining: "Hàng còn lại",
  sold: "Đã bán",
  other: "Khác",
};

function InventoryContent({ data }: { data: InventoryDrawerData }) {
  const { product, bucket, holding_order: h } = data;
  return (
    <div className="space-y-5">
      <Badge variant="muted">{BUCKET_LABEL[bucket]}</Badge>
      <ProductHeader product={product} />
      <Section title="Đơn đang giữ">
        {bucket !== "held" ? (
          <p className="text-sm text-muted-foreground">Sản phẩm không ở trạng thái đang giữ.</p>
        ) : !h ? (
          <p className="text-sm text-muted-foreground">Không có đơn đang giữ nào trong phạm vi bạn được xem.</p>
        ) : (
          <div className="space-y-1" data-testid="drawer-holding-order">
            <Row label="Số đơn">
              <EntityLink type="order" id={h.order_id}>
                {h.order_number}
              </EntityLink>
            </Row>
            <Row label="Ngày đơn">{formatDate(h.order_date)}</Row>
            <Row label="Khách hàng">
              <CustomerLink customer={h.customer} />
            </Row>
            <Row label="Tổng đơn (cả đơn)">{money(h.total_amount)}</Row>
            <Row label="Đã thu (cả đơn)">{money(h.amount_paid)}</Row>
            <Row label="Còn phải thu (cả đơn)">{money(h.remaining_balance)}</Row>
          </div>
        )}
      </Section>
      <p className="text-sm">
        <EntityLink type="product" id={product.id}>
          Xem sản phẩm này
        </EntityLink>
      </p>
    </div>
  );
}

function Body({ target }: { target: DetailTarget }) {
  const state = useDetail<unknown>(target);
  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground" data-testid="drawer-loading">Đang tải…</p>;
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-destructive" role="alert" data-testid="drawer-error">
        {state.message}
      </p>
    );
  }
  switch (target.type) {
    case "order":
      return <OrderContent data={state.data as OrderDrawerData} />;
    case "product":
      return <ProductContent data={state.data as ProductDrawerData} />;
    case "customer":
      return <CustomerContent data={state.data as CustomerDrawerData} />;
    case "inventory":
      return <InventoryContent data={state.data as InventoryDrawerData} />;
  }
}

/** Right-side panel on desktop, full-width sheet on mobile (same Radix Dialog
 * pattern as the Inventory ProductDetailDrawer). */
export default function EntityDrawer({ target, onClose }: { target: DetailTarget | null; onClose: () => void }) {
  return (
    <Dialog.Root open={!!target} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="entity-drawer"
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-xl sm:max-w-md
            data-[state=open]:animate-in data-[state=open]:slide-in-from-right
            data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="truncate pr-4 text-lg font-semibold text-foreground">
              {target ? ENTITY_TITLE[target.type] : ""}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive" aria-label="Đóng">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{target && <Body key={`${target.type}:${target.id}`} target={target} />}</div>
          {target && (
            <div className="shrink-0 border-t border-border px-5 py-3">
              <Link
                href={fullPageHref(target)}
                className="inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                data-testid="drawer-full-page"
              >
                Xem đầy đủ
              </Link>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
