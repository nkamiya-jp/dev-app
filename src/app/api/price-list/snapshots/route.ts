import { prisma } from "@/lib/db";
import { getAllMatrixRows, parseTypeRates } from "@/lib/contact-meta";
import { loadProductsWithCost, saveCustomerSnapshot } from "@/lib/customer-price-list";
import { NextRequest } from "next/server";
import { roundSellPrice } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// GET - スナップショット一覧（?contactId= でその顧客の分だけ）
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  const snaps = await prisma.priceListSnapshot.findMany({
    where: contactId ? { kind: "customer", contactId } : undefined,
    orderBy: { snappedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return Response.json(snaps);
}

// POST - 現在の価格でスナップショットを保存
// body: { name, note, kind?: "matrix"|"customer", contactId? }
export async function POST(request: NextRequest) {
  const data = await request.json();
  const kind = data.kind === "customer" ? "customer" : "matrix";
  const note = data.note || null;

  // ─── 顧客別アーカイブ ───
  if (kind === "customer") {
    const contactId = String(data.contactId || "");
    if (!contactId) {
      return Response.json({ error: "contactId is required" }, { status: 400 });
    }
    try {
      const { snapshot, itemCount } = await saveCustomerSnapshot(contactId, {
        name: data.name ? String(data.name) : undefined,
        note,
        stage: data.stage === "revised" ? "revised" : data.stage === "current" ? "current" : undefined,
      });
      return Response.json({ ok: true, snapshot, itemCount });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "保存に失敗しました" }, { status: 404 });
    }
  }

  // 現在の商品データ（原価つき）
  const products = await loadProductsWithCost({ active: true, ownerContactId: null }); // OEM（顧客専用の商品）は価格表に出さない

  // ─── 全体アーカイブ（従来）───
  const name = String(data.name || `価格表 ${new Date().toLocaleDateString("ja-JP")}`);
  const matrixRows = getAllMatrixRows();

  const snap = await prisma.priceListSnapshot.create({
    data: { name, note, kind: "matrix", snappedAt: new Date() },
  });

  for (const p of products) {
    const cost = p.cost;
    const retail = p.retailPrice ?? 0;
    const prices: Record<string, number> = {};
    const typeRates = parseTypeRates(p.typeRates);
    for (const r of matrixRows) {
      const key = `${r.typeId}_${r.ratePct}`;
      prices[key] = roundSellPrice((retail * (typeRates[r.typeId] ?? r.ratePct)) / 100);
    }
    await prisma.priceListItem.create({
      data: {
        snapshotId: snap.id,
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        series: p.series,
        cost,
        retailPrice: retail,
        prices: JSON.stringify(prices),
      },
    });
  }

  return Response.json({ ok: true, snapshot: snap, itemCount: products.length });
}

// DELETE - スナップショット削除
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.priceListSnapshot.delete({ where: { id } });
  return Response.json({ ok: true });
}
