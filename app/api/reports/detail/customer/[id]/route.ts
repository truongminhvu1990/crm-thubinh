import { NextRequest } from "next/server";
import { getCustomerDrawerData } from "@/lib/reports/entityDetail.service";
import { handleDetailGet } from "../../_handler";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleDetailGet(request, params, getCustomerDrawerData);
}
