import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await prisma.janPrefix.findMany({ orderBy: { prefix: "asc" } }));
}

// POST /api/jan/prefixes { prefix, label?, rangeStart?, rangeEnd?, note? } — 新しい事業者コード（GS1で取得したもの）
export async function POST(request: NextRequest) {
  const b = await request.json();
  const prefix = String(b.prefix || "").replace(/\D/g, "");
  if (prefix.length < 6 || prefix.length > 10) return Response.json({ error: "事業者コードは6〜10桁の数字です" }, { status: 400 });
  const max = 10 ** (12 - prefix.length) - 1;
  const rangeStart = Number.isInteger(Number(b.rangeStart)) ? Number(b.rangeStart) : 0;
  const rangeEnd = Number.isInteger(Number(b.rangeEnd)) ? Number(b.rangeEnd) : max;
  if (rangeStart < 0 || rangeEnd > max || rangeStart > rangeEnd) {
    return Response.json({ error: `品目コードの範囲は 0〜${max} で指定してください` }, { status: 400 });
  }
  const exists = await prisma.janPrefix.findUnique({ where: { prefix } });
  if (exists) return Response.json({ error: "この事業者コードは登録済みです" }, { status: 409 });
  const p = await prisma.janPrefix.create({
    data: { prefix, label: b.label || null, rangeStart, rangeEnd, note: b.note || null },
  });
  return Response.json(p, { status: 201 });
}

// PUT /api/jan/prefixes { id, label?, rangeStart?, rangeEnd?, active?, note? }
export async function PUT(request: NextRequest) {
  const b = await request.json();
  const cur = await prisma.janPrefix.findUnique({ where: { id: b.id } });
  if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
  const max = 10 ** (12 - cur.prefix.length) - 1;
  const rangeStart = b.rangeStart !== undefined ? Number(b.rangeStart) : cur.rangeStart;
  const rangeEnd = b.rangeEnd !== undefined ? Number(b.rangeEnd) : cur.rangeEnd;
  if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeStart < 0 || rangeEnd > max || rangeStart > rangeEnd) {
    return Response.json({ error: `品目コードの範囲は 0〜${max} で指定してください` }, { status: 400 });
  }
  const p = await prisma.janPrefix.update({
    where: { id: b.id },
    data: {
      rangeStart,
      rangeEnd,
      ...(b.label !== undefined && { label: b.label || null }),
      ...(b.active !== undefined && { active: !!b.active }),
      ...(b.note !== undefined && { note: b.note || null }),
    },
  });
  return Response.json(p);
}
