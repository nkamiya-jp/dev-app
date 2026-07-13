import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { shiftDateByMonths, monthDiff } from "@/lib/month-shift";

export const dynamic = "force-dynamic";

// POST /api/productions/duplicate-month
// body: { productId, fromMonth: "YYYY-MM", toMonth: "YYYY-MM" }
// 指定商品の fromMonth の製造依頼を toMonth に複製する。
// - 日付は曜日を合わせて toMonth にシフト（裁断/資材/納品実績はクリア）
// - provisional=true（仮制作）、status=requested にリセット
// - 数量・担当者・メモ・納期はコピー
export async function POST(request: NextRequest) {
  const { productId, fromMonth, toMonth } = await request.json();
  if (!productId || !/^\d{4}-\d{2}$/.test(fromMonth || "") || !/^\d{4}-\d{2}$/.test(toMonth || "")) {
    return Response.json({ error: "productId, fromMonth(YYYY-MM), toMonth(YYYY-MM) required" }, { status: 400 });
  }

  const src = await prisma.production.findMany({
    where: { productId, targetMonth: fromMonth, provisional: false },
    include: { assignments: true },
    orderBy: { requestDate: "asc" },
  });
  if (src.length === 0) {
    return Response.json({ ok: true, created: 0, message: "複製元の製造依頼がありません" });
  }

  // 全ての日付を同じ月数だけずらす（曜日は合わせる）
  const delta = monthDiff(fromMonth, toMonth);

  let created = 0;
  for (const p of src) {
    await prisma.production.create({
      data: {
        productId: p.productId,
        quantity: p.quantity,
        targetMonth: toMonth,
        provisional: true,
        status: "requested",
        requestDate: shiftDateByMonths(p.requestDate, delta),
        dueDate: p.dueDate ? shiftDateByMonths(p.dueDate, delta) : null,
        note: p.note,
        assignments: {
          create: p.assignments.map((a) => ({
            workerId: a.workerId,
            step: a.step,
            quantity: a.quantity,
            requestDate: shiftDateByMonths(a.requestDate ?? p.requestDate, delta),
            status: "requested",
            note: a.note,
          })),
        },
      },
    });
    created += 1;
  }

  return Response.json({ ok: true, created, toMonth });
}
