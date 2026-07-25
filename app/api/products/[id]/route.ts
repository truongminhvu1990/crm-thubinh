import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/lib/product.service";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 1). Mirrors getProductById()'s
 * old direct-call shape exactly: always 200, body is the product or `null` -
 * the Product Detail page already branches on a null/truthy result, so no
 * new 404 semantics are introduced here. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await createClient();
  const product = await getProductById(id, client);
  return NextResponse.json(product);
}
