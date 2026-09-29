import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";

/**
 * Mini Catalogue -> CRM inventory sync (V1, Product Owner locked spec,
 * 2026-09-29): a read-only, machine-credentialled integration surface for
 * Mini Catalogue's server-side sync job to poll. Not part of the staff
 * RBAC system (requirePermission) - there is no logged-in staff member on
 * the other end, so auth here is a single shared bearer token instead.
 *
 * The 200 body is a top-level JSON array (no wrapper object).
 *
 * Whitelisted projection only: product_code / product_name / status (the V1 contract, exactly 3 fields).
 * Never cost_price, supplier, location, salesperson, source, notes, or any
 * other internal column - selected explicitly by name, never `select("*")`.
 * `status` is passed through verbatim, unvalidated: Mini Catalogue's own
 * sync is responsible for mapping/rejecting unknown status values, not
 * this endpoint.
 */

type ProductRow = { product_code: string; product_name: string; status: string };

function tokenMatches(presented: string, expected: string): boolean {
  const presentedBuf = Buffer.from(presented);
  const expectedBuf = Buffer.from(expected);
  if (presentedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(presentedBuf, expectedBuf);
}

export async function GET(request: NextRequest) {
  const expectedToken = process.env.CATALOGUE_SYNC_TOKEN;
  if (!expectedToken) {
    // Fail closed: an unconfigured token must never be treated as "no auth required".
    return NextResponse.json({ error: "CATALOGUE_SYNC_TOKEN is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, presented] = authHeader.split(" ");
  if (scheme !== "Bearer" || !presented || !tokenMatches(presented, expectedToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = createAdminClient();
  } catch (err) {
    if (err instanceof AdminClientConfigError) {
      return NextResponse.json({ error: "Sync source is not configured" }, { status: 500 });
    }
    throw err;
  }

  const { data, error } = await client.from("products").select("product_code, product_name, status").returns<ProductRow[]>();
  if (error) {
    return NextResponse.json({ error: "Could not read products" }, { status: 500 });
  }

  return NextResponse.json(
    (data ?? []).map((p) => ({ product_code: p.product_code, product_name: p.product_name, status: p.status })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
