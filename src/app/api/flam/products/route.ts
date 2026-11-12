import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/flam/products?search=xx - 紐づけ候補のFLAM商品コード（未紐づけのみ）
export async function GET(request: NextRequest) {
  const search = (request.nextUrl.searchParams.get("search") || "").trim();
  const words = search.split(/[\s　]+/).filter(Boolean);
  const rows = await prisma.flamProductMap.findMany({
    where: {
      status: "unmapped",
      AND: words.map((w) => ({
        OR: [{ flamCode: { contains: w } }, { flamName: { contains: w } }, { spec: { contains: w } }],
      })),
    },
    orderBy: { flamCode: "asc" },
  });
  // 紐づけたら顧客別単価になる件数（直近単価があり、得意先がDEV顧客に紐づくもの）
  const codes = rows.map((r) => r.flamCode);
  const prices = codes.length
    ? await prisma.flamPrice.findMany({
        where: { flamProductCode: { in: codes }, lastPrice: { not: null } },
        select: { flamProductCode: true, flamCustomerCode: true },
      })
    : [];
  const linked = new Set(
    (
      await prisma.contact.findMany({
        where: { flamCode: { in: [...new Set(prices.map((p) => p.flamCustomerCode))] } },
        select: { flamCode: true },
      })
    ).map((c) => c.flamCode)
  );
  const count = new Map<string, number>();
  for (const p of prices) {
    if (linked.has(p.flamCustomerCode)) count.set(p.flamProductCode, (count.get(p.flamProductCode) ?? 0) + 1);
  }
  return Response.json(
    rows
      .map((r) => ({ flamCode: r.flamCode, flamName: r.flamName, spec: r.spec, priceCount: count.get(r.flamCode) ?? 0 }))
      .sort((a, b) => b.priceCount - a.priceCount || a.flamCode.localeCompare(b.flamCode))
      .slice(0, 40)
  );
}
