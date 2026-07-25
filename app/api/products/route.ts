import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/product.service";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 1) - Products' server-side read
 * endpoint. Reuses getProducts() unchanged (search/category/status args,
 * join-fallback resilience, error handling) with a server Supabase client
 * instead of the browser one - data access only, no new filtering, no
 * permission check (none existed before this route either). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const searchTerm = searchParams.get("search") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const client = await createClient();
  const products = await getProducts(searchTerm, category, status, client);
  return NextResponse.json(products);
}
