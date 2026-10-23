import { NextRequest, NextResponse } from "next/server";
import { getProductsOrThrow, ProductsQueryError } from "@/lib/product.service";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 1) - Products' server-side read
 * endpoint. Reuses the getProducts() query (search/category/status args,
 * join-fallback resilience) through getProductsOrThrow() with a server
 * Supabase client instead of the browser one - data access only, no new
 * filtering, no permission check (none existed before this route either).
 *
 * A failed query is a 500 with the Products-specific body below, never a
 * 200 with `[]` (which stays reserved for a valid empty result). Only the two
 * cases named here are handled - createClient() throwing and both product
 * queries failing; any other exception is deliberately left unhandled, as
 * before. The body and log carry fixed text only: nothing from the
 * underlying error and nothing from the request. */
const PRODUCTS_QUERY_FAILED = {
  error: { code: "PRODUCTS_QUERY_FAILED", message: "Không tải được danh sách sản phẩm." },
};

function queryFailed(stage: "client" | "query") {
  console.error("Products API: failed to load products", { stage });
  return NextResponse.json(PRODUCTS_QUERY_FAILED, { status: 500 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const searchTerm = searchParams.get("search") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  let client: Awaited<ReturnType<typeof createClient>>;
  try {
    client = await createClient();
  } catch {
    return queryFailed("client");
  }

  let products: Awaited<ReturnType<typeof getProductsOrThrow>>;
  try {
    products = await getProductsOrThrow(searchTerm, category, status, client);
  } catch (error) {
    if (error instanceof ProductsQueryError) return queryFailed("query");
    throw error;
  }

  return NextResponse.json(products);
}
