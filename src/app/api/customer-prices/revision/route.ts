import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import {
  contactDisplayName,
  getRevisionDraft,
  latestSnapshotMatches,
  loadCustomerPriceList,
  saveCustomerSnapshot,
  saveRevisionDraft,
} from "@/lib/customer-price-list";

export const dynamic = "force-dynamic";

// 価格改定：顧客ごとの「新価格」の下書き（確定するまで卸価格は変わらない）

// GET /api/customer-prices/revision?contactId=xxx
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });
  return Response.json(await getRevisionDraft(contactId));
}

// PUT /api/customer-prices/revision
// body: { contactId, productId, price（null=消す） } … 1商品だけ
//    or { contactId, prices: { productId: price } } … まとめて置き換え（{} で全部消す）
export async function PUT(request: NextRequest) {
  const data = await request.json();
  const contactId = String(data.contactId || "");
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });

  let prices: Record<string, number>;
  if (data.prices && typeof data.prices === "object") {
    prices = {};
    for (const [k, v] of Object.entries(data.prices as Record<string, unknown>)) {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n > 0) prices[k] = n;
    }
  } else {
    const productId = String(data.productId || "");
    if (!productId) return Response.json({ error: "productId required" }, { status: 400 });
    prices = { ...(await getRevisionDraft(contactId)).prices };
    const n = data.price == null || data.price === "" ? NaN : Math.round(Number(data.price));
    if (Number.isFinite(n) && n > 0) prices[productId] = n;
    else delete prices[productId];
  }
  return Response.json(await saveRevisionDraft(contactId, prices));
}

// POST /api/customer-prices/revision  … 新価格で確定
// body: { contactId, name?, note? }
// 1) いまの価格表を「改定前」として保存（直近の控えと同じなら作らない）
// 2) 新価格が入っている商品の卸価格（個別価格）を新価格に書き換える
// 3) 下書きを消し、「改定後」の価格表を保存
export async function POST(request: NextRequest) {
  const data = await request.json();
  const contactId = String(data.contactId || "");
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });

  const list = await loadCustomerPriceList(contactId);
  if (!list) return Response.json({ error: "Contact not found" }, { status: 404 });
  const draft = await getRevisionDraft(contactId);

  const changes = list.rows.filter((r) => draft.prices[r.productId] != null && draft.prices[r.productId] !== r.wholesale);
  if (changes.length === 0) {
    return Response.json({ error: "いまの価格と違う新価格がありません" }, { status: 400 });
  }

  const display = contactDisplayName(list.contact);
  const today = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });

  // 1) 改定前の控え
  const latest = await latestSnapshotMatches(contactId, list.rows);
  let beforeId: string;
  if (latest?.same) {
    beforeId = latest.snapshot.id;
  } else {
    const before = await saveCustomerSnapshot(contactId, {
      name: `${display} 価格表（改定前） ${today}`,
      stage: "current",
    });
    beforeId = before.snapshot.id;
  }

  // 2) 値が変わる行だけ書き換える（Tursoで大きなトランザクションにしない）
  for (const r of changes) {
    await prisma.customerPrice.update({
      where: { contactId_productId: { contactId, productId: r.productId } },
      data: { price: draft.prices[r.productId] },
    });
  }

  // 3) 下書きを消して改定後の控え
  await saveRevisionDraft(contactId, {});
  const after = await saveCustomerSnapshot(contactId, {
    name: data.name ? String(data.name) : `${display} 価格表（改定後） ${today}`,
    note: data.note ? String(data.note) : null,
    stage: "revised",
  });

  return Response.json({ ok: true, changed: changes.length, beforeId, afterId: after.snapshot.id });
}
