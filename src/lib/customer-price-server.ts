// 顧客に対する実効単価（サーバー側専用）。受注の単価の正
//   1. individual : CustomerPrice.price（個別設定）
//   2. auto       : 上代 × 掛率（20円単位に切り上げ）（掛率は 商品×顧客カテゴリの掛率 > 顧客のdiscountRate > 顧客タイプの既定）
//   3. standard   : 商品の標準卸価格（wholesalePrice）
// handled = その顧客の取扱商品に登録済みか
import { prisma } from "@/lib/db";
import { getContactTypeMeta, resolveRate } from "@/lib/contact-meta";
import { roundSellPrice } from "@/lib/pricing";

export type EffectivePrice = {
  productId: string;
  price: number | null;
  source: "individual" | "auto" | "standard" | "none";
  rate: number | null;
  handled: boolean;
  note: string | null;
};

export async function effectivePrices(contactId: string, productId?: string | null) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { discountRate: true, type: true },
  });
  if (!contact) return null;

  const rate = contact.discountRate ?? getContactTypeMeta(contact.type)?.defaultRate ?? null;

  const [products, overrides] = await Promise.all([
    prisma.product.findMany({
      // OEM商品は依頼主の顧客にだけ出す
      where: { active: true, OR: [{ ownerContactId: null }, { ownerContactId: contactId }], ...(productId ? { id: productId } : {}) },
      select: { id: true, retailPrice: true, wholesalePrice: true, typeRates: true },
    }),
    prisma.customerPrice.findMany({
      where: { contactId, ...(productId ? { productId } : {}) },
      select: { productId: true, price: true, note: true },
    }),
  ]);

  const ovMap = new Map(overrides.map((o) => [o.productId, o]));

  const items: EffectivePrice[] = products.map((p) => {
    const ov = ovMap.get(p.id);
    let price: number | null = null;
    let source: EffectivePrice["source"] = "none";
    let pRate: number | null = null;
    if (ov && ov.price != null) {
      price = ov.price;
      source = "individual";
    } else if (p.retailPrice && p.retailPrice > 0 && (pRate = resolveRate(contact, p.typeRates)) != null) {
      price = roundSellPrice((p.retailPrice * pRate) / 100);
      source = "auto";
    } else if (p.wholesalePrice != null) {
      price = p.wholesalePrice;
      source = "standard";
    }
    return { productId: p.id, price, source, rate: source === "auto" ? pRate : null, handled: ovMap.has(p.id), note: ov?.note ?? null };
  });
  return { rate, items };
}
