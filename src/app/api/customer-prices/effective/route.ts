import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { getContactTypeMeta } from "@/lib/contact-meta";

export const dynamic = "force-dynamic";

// GET /api/customer-prices/effective?contactId=xxx[&productId=yyy]
// 顧客に対する実効単価を返す。優先順位:
//   1. individual : CustomerPrice.price（個別設定）
//   2. auto       : 上代 × 掛率（顧客のdiscountRate、無ければ顧客タイプの既定掛率）
//   3. standard   : 商品の標準卸価格（wholesalePrice）
// handled = その顧客の取扱商品に登録済みか
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  const productId = request.nextUrl.searchParams.get("productId");
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { discountRate: true, type: true },
  });
  if (!contact) return Response.json({ error: "contact not found" }, { status: 404 });

  const rate = contact.discountRate ?? getContactTypeMeta(contact.type)?.defaultRate ?? null;

  const [products, overrides] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, ...(productId ? { id: productId } : {}) },
      select: { id: true, retailPrice: true, wholesalePrice: true },
    }),
    prisma.customerPrice.findMany({
      where: { contactId, ...(productId ? { productId } : {}) },
      select: { productId: true, price: true, note: true },
    }),
  ]);

  const ovMap = new Map(overrides.map((o) => [o.productId, o]));

  const rows = products.map((p) => {
    const ov = ovMap.get(p.id);
    let price: number | null = null;
    let source: "individual" | "auto" | "standard" | "none" = "none";
    if (ov && ov.price != null) {
      price = ov.price;
      source = "individual";
    } else if (rate != null && p.retailPrice && p.retailPrice > 0) {
      price = Math.round((p.retailPrice * rate) / 100);
      source = "auto";
    } else if (p.wholesalePrice != null) {
      price = p.wholesalePrice;
      source = "standard";
    }
    return { productId: p.id, price, source, handled: ovMap.has(p.id), note: ov?.note ?? null };
  });

  if (productId) {
    return Response.json(rows[0] ?? { productId, price: null, source: "none", handled: false, note: null });
  }
  return Response.json({ rate, items: rows });
}
