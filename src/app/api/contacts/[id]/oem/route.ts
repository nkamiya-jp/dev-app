import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getViewer, unauthorized } from "@/lib/viewer";
import { getOemSettings, nextOemCode, oemStatus } from "@/lib/oem-server";
import { duplicateProduct } from "@/lib/product-server";

export const dynamic = "force-dynamic";

// GET /api/contacts/[id]/oem — この顧客のOEM商品（今の原価・決めた単価・粗利率・値上がり）
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settings = await getOemSettings();
  const products = await prisma.product.findMany({
    where: { ownerContactId: id },
    orderBy: [{ active: "desc" }, { code: "asc" }],
    select: { id: true },
  });
  const items = [];
  for (const { id: pid } of products) {
    const st = await oemStatus(pid, settings);
    if (!st) continue;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { product, ...status } = st;
    items.push({ id: product.id, code: product.code, name: product.name, active: product.active, ...status });
  }
  return Response.json({ settings, items });
}

// POST /api/contacts/[id]/oem — OEM商品を作る。fromProductId があればその商品を原価ごとコピー
// body: { name?, fromProductId? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id }, select: { name: true, company: true } });
  if (!contact) return Response.json({ error: "顧客が見つかりません" }, { status: 404 });
  const b = await request.json();
  const code = await nextOemCode();
  const owner = contact.company || contact.name;

  if (b.fromProductId) {
    const src = await prisma.product.findUnique({ where: { id: String(b.fromProductId) }, select: { name: true } });
    if (!src) return Response.json({ error: "コピー元の商品が見つかりません" }, { status: 404 });
    const dup = await duplicateProduct(String(b.fromProductId), {
      code,
      name: String(b.name || "").trim() || `${src.name}（${owner}）`,
      ownerContactId: id,
      wholesalePrice: null,
      retailPrice: null,
    });
    return Response.json({ id: dup!.id, code: dup!.code }, { status: 201 });
  }

  const name = String(b.name || "").trim();
  if (!name) return Response.json({ error: "商品名を入れてください" }, { status: 400 });
  const p = await prisma.product.create({ data: { code, name, ownerContactId: id, active: true } });
  return Response.json({ id: p.id, code: p.code }, { status: 201 });
}
