import { NextRequest } from "next/server";
import { effectivePrices } from "@/lib/customer-price-server";

export const dynamic = "force-dynamic";

// GET /api/customer-prices/effective?contactId=xxx[&productId=yyy]
// 顧客に対する実効単価を返す（計算は src/lib/customer-price-server.ts）
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  const productId = request.nextUrl.searchParams.get("productId");
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });

  const r = await effectivePrices(contactId, productId);
  if (!r) return Response.json({ error: "contact not found" }, { status: 404 });

  if (productId) {
    return Response.json(r.items[0] ?? { productId, price: null, source: "none", handled: false, note: null });
  }
  return Response.json({ rate: r.rate, items: r.items });
}
