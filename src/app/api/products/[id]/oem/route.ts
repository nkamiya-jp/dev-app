import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getViewer, unauthorized } from "@/lib/viewer";
import { getOemSettings, oemStatus } from "@/lib/oem-server";
import { breakdownOf, loadProductWithCost } from "@/lib/product-server";
import { multiplierFor, oemUnitCost, oemUnitPrice, parseExtras } from "@/lib/oem";

export const dynamic = "force-dynamic";

// GET /api/products/[id]/oem — OEM商品の原価・決めた単価・見積の履歴
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settings = await getOemSettings();
  const st = await oemStatus(id, settings);
  if (!st) return Response.json({ error: "Not found" }, { status: 404 });
  const quotes = await prisma.oemQuote.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take: 50 });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { product, ...status } = st;
  return Response.json({
    settings,
    owner: product.ownerContact,
    includePackaging: product.oemIncludePackaging,
    ...status,
    quotes: quotes.map((q) => ({ ...q, extras: parseExtras(q.extras) })),
  });
}

// POST /api/products/[id]/oem — 見積を作る（原価はサーバーで今の値を計算して控える）
// body: { quantity, multiplier?, includePackaging?, extras?: [{label, amount}], note? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { id } = await params;
  const b = await request.json();
  const p = await loadProductWithCost(id);
  if (!p) return Response.json({ error: "Not found" }, { status: 404 });

  const quantity = Math.round(Number(b.quantity));
  if (!quantity || quantity < 1) return Response.json({ error: "数量を入れてください" }, { status: 400 });
  const settings = await getOemSettings();
  const m = Number(b.multiplier);
  const multiplier = m > 0 ? Math.round(m * 100) / 100 : multiplierFor(quantity, settings);
  const includePackaging = b.includePackaging === undefined ? p.oemIncludePackaging : !!b.includePackaging;
  const unitCost = oemUnitCost(breakdownOf(p), includePackaging);

  const quote = await prisma.oemQuote.create({
    data: {
      productId: id,
      contactId: p.ownerContactId,
      quantity,
      multiplier,
      includePackaging,
      unitCost,
      unitPrice: oemUnitPrice(unitCost, multiplier),
      extras: JSON.stringify(parseExtras(JSON.stringify(b.extras ?? []))),
      note: String(b.note || "").trim() || null,
      createdBy: v.name,
    },
  });
  return Response.json({ ...quote, extras: parseExtras(quote.extras) }, { status: 201 });
}
