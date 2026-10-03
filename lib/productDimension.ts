import type { Product } from "@/types/product";

/**
 * Ni-Chột-Dày (Product Owner spec, 2026-10-04): the three body dimensions of
 * a jadeite bracelet ("Vòng") or ring ("Nhẫn"), in millimeters.
 *
 *   Ni   = inner diameter (wrist size for Vòng, ring size for Nhẫn)
 *   Chột = body width
 *   Dày  = body thickness
 *
 * Stored as three nullable numeric columns (products.dimension_ni_mm /
 * dimension_chot_mm / dimension_day_mm) - the combined "Ni-Chột-Dày" string
 * is NEVER stored, only parsed from input and formatted for display.
 * products.size is a separate, legacy numeric field and is not touched here.
 *
 * This module is the single parser/validator/formatter for the field - the
 * Product form, both Product pages, the service and the Quick Import all go
 * through it, so there is exactly one definition of "valid".
 */

/** Category values (products.category, free-text master data) the dimension
 * applies to, with the label the PO wants in front of "Ni". Exact match:
 * the Production values are literally "Vòng" and "Nhẫn". */
const DIMENSION_CATEGORY_NI_LABEL: Record<string, string> = {
  "Vòng": "Ni tay",
  "Nhẫn": "Ni nhẫn",
};

/** products.status value behind the UI label "Đang bán". */
export const DIMENSION_REQUIRED_STATUS = "Available";

export function isDimensionCategory(category?: string | null): boolean {
  return typeof category === "string" && Object.prototype.hasOwnProperty.call(DIMENSION_CATEGORY_NI_LABEL, category);
}

/** "Ni tay-Chột-Dày (mm)" / "Ni nhẫn-Chột-Dày (mm)"; null for any other category. */
export function dimensionLabelFor(category?: string | null): string | null {
  if (!isDimensionCategory(category)) return null;
  return `${DIMENSION_CATEGORY_NI_LABEL[category as string]}-Chột-Dày (mm)`;
}

export const DIMENSION_FIELDS = ["dimension_ni_mm", "dimension_chot_mm", "dimension_day_mm"] as const;

export interface NiChotDay {
  ni: number;
  chot: number;
  day: number;
}

export type ParseNiChotDayResult = { ok: true; value: NiChotDay } | { ok: false; error: string };

const FORMAT_ERROR = "Ni-Chột-Dày phải có đúng 3 số cách nhau bởi dấu \"-\", ví dụ 54.5-9.4-6.6";
const COMPONENT_ERROR =
  "Mỗi thành phần phải là số không âm, dùng dấu chấm cho số thập phân và tối đa 1 chữ số sau dấu chấm";

/** One component: digits, optionally "." + exactly one digit. No sign, no
 * exponent, no comma, no ".5" / "5.", no inner whitespace. */
const COMPONENT_PATTERN = /^\d+(\.\d)?$/;

export function isValidDimensionComponentText(text: string): boolean {
  return COMPONENT_PATTERN.test(text) && Number.isFinite(Number(text));
}

/** Parses the single-input form "Ni-Chột-Dày" (e.g. "54.5-9.4-6.6"). */
export function parseNiChotDay(input: string): ParseNiChotDayResult {
  const text = input.trim();
  const parts = text.split("-");
  if (parts.length !== 3) return { ok: false, error: FORMAT_ERROR };
  if (!parts.every(isValidDimensionComponentText)) return { ok: false, error: COMPONENT_ERROR };
  const [ni, chot, day] = parts.map(Number);
  return { ok: true, value: { ni, chot, day } };
}

/** A component stored as a number (DB value or parsed import cell) must obey
 * the same rule as typed text: finite, >= 0, at most one decimal digit. */
export function isValidDimensionComponentNumber(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
  return isValidDimensionComponentText(String(value));
}

/** "54.5-9.4-6.6" from the three stored numbers; integers print without ".0".
 * Null unless all three are present. */
export function formatNiChotDay(
  ni?: number | null,
  chot?: number | null,
  day?: number | null
): string | null {
  if (ni == null || chot == null || day == null) return null;
  return `${Number(ni)}-${Number(chot)}-${Number(day)}`;
}

export function formatProductDimension(product: Partial<Product>): string | null {
  return formatNiChotDay(product.dimension_ni_mm, product.dimension_chot_mm, product.dimension_day_mm);
}

/** True when the Product is a manual-save target for the "all three required" rule:
 * Vòng/Nhẫn AND status Available ("Đang bán"). */
export function isDimensionRequired(product: Pick<Product, "category" | "status">): boolean {
  return isDimensionCategory(product.category) && product.status === DIMENSION_REQUIRED_STATUS;
}

export const DIMENSION_REQUIRED_ERROR = "Vui lòng nhập Ni-Chột-Dày (bắt buộc với sản phẩm Đang bán)";

/**
 * Manual Product save rule (Product form pages + productService writes):
 *  - category not Vòng/Nhẫn          -> not validated.
 *  - UI text present (dimension_input) -> must parse, any status.
 *  - Vòng/Nhẫn + Available            -> all three values required.
 * Returns an error message, or null when fine. This is a Product-data rule,
 * NOT an inventory-transition rule: system-driven status changes (order
 * cancel/revert, return-to-supplier, ...) never call it.
 */
export function validateProductDimension(
  product: Partial<Pick<Product, "category" | "status" | "dimension_input">> &
    Partial<Pick<Product, "dimension_ni_mm" | "dimension_chot_mm" | "dimension_day_mm">>
): string | null {
  if (!isDimensionCategory(product.category)) return null;

  let values: Partial<NiChotDay> | null = null;

  if (typeof product.dimension_input === "string" && product.dimension_input.trim() !== "") {
    const parsed = parseNiChotDay(product.dimension_input);
    if (!parsed.ok) return parsed.error;
    values = parsed.value;
  } else if (typeof product.dimension_input === "string") {
    values = {}; // user cleared the input
  } else {
    const stored = [product.dimension_ni_mm, product.dimension_chot_mm, product.dimension_day_mm];
    const present = stored.filter((v) => v !== undefined && v !== null);
    if (!present.every(isValidDimensionComponentNumber)) return COMPONENT_ERROR;
    values =
      present.length === 3
        ? { ni: stored[0] as number, chot: stored[1] as number, day: stored[2] as number }
        : {};
  }

  if (product.status === DIMENSION_REQUIRED_STATUS) {
    if (values.ni === undefined || values.chot === undefined || values.day === undefined) {
      return DIMENSION_REQUIRED_ERROR;
    }
  }
  return null;
}
