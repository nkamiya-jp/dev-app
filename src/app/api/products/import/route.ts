import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { normalizeSeries } from "@/lib/product-meta";

export const dynamic = "force-dynamic";

function toInt(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[,¥￥円\s]/g, ""));
  return isNaN(n) ? null : Math.round(n);
}
function toFloat(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return isNaN(n) ? null : n;
}

// POST /api/products/import
// body: { rows: [{ code, name, series?, size?, retailPrice?, wholesalePrice?, ... }] }
// code で upsert
export async function POST(request: NextRequest) {
  const { rows } = await request.json();
  if (!Array.isArray(rows)) {
    return Response.json({ error: "rows must be an array" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = String(r.name ?? "").trim();
      const code = String(r.code ?? "").trim();
      if (!name) { errors.push({ row: i + 1, message: "商品名が空です" }); continue; }
      if (!code) { errors.push({ row: i + 1, message: "コードが空です（コードで識別します）" }); continue; }

      const data = {
        name,
        // 「西陣」「仕入」等の日本語ラベルも id（nishijin/purchase）に正規化して保存
        series: normalizeSeries(r.series),
        size: r.size ? String(r.size).trim() : null,
        retailPrice: toInt(r.retailPrice),
        wholesalePrice: toInt(r.wholesalePrice),
        purchaseCost: toInt(r.purchaseCost),
        salesCost: toInt(r.salesCost),
        outboundCost: toInt(r.outboundCost),
        mgmtCost: toInt(r.mgmtCost),
        cutHeight: toInt(r.cutHeight),
        cutWidth: toInt(r.cutWidth),
        usedMeters: toFloat(r.usedMeters),
        leadText: r.leadText ? String(r.leadText).trim() : null,
        tags: r.tags ? String(r.tags).trim() : null,
        description: r.description ? String(r.description).trim() : null,
      };

      // 空文字/未指定のフィールドは更新から除外（既存値を保持）
      const cleanData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== null) cleanData[k] = v;
      }

      const existing = await prisma.product.findUnique({ where: { code } });
      if (existing) {
        await prisma.product.update({ where: { code }, data: cleanData });
        updated++;
      } else {
        await prisma.product.create({
          data: { code, name, ...cleanData, active: true },
        });
        created++;
      }
    } catch (e) {
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return Response.json({ ok: true, created, updated, errors });
}
