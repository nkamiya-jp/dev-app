import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// 単位の表記ゆれを吸収
function normUnit(v: string): string {
  const s = (v || "").trim().toLowerCase();
  if (["m", "meter", "メートル", "ｍ"].includes(s)) return "meter";
  if (["set", "セット", "組"].includes(s)) return "set";
  return "piece"; // 個/pc/ 空 など
}

// POST /api/materials/import
// body: { rows: [{ code?, name, category, unitPrice, unitType?, fabricWidth? }] }
// code があれば upsert（更新）、なければ name+category で既存判定して upsert
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
      if (!name) {
        errors.push({ row: i + 1, message: "資材名が空です" });
        continue;
      }
      const data = {
        name,
        category: String(r.category ?? "その他").trim() || "その他",
        unitPrice: Math.round(Number(r.unitPrice) || 0),
        unitType: normUnit(String(r.unitType ?? "")),
        fabricWidth: r.fabricWidth !== undefined && r.fabricWidth !== "" && r.fabricWidth != null
          ? Math.round(Number(r.fabricWidth))
          : null,
      };
      const code = r.code ? String(r.code).trim() : null;

      // 既存判定: code優先、なければ name+category
      let existing = null;
      if (code) {
        existing = await prisma.material.findUnique({ where: { code } });
      }
      if (!existing) {
        existing = await prisma.material.findFirst({
          where: { name: data.name, category: data.category },
        });
      }

      if (existing) {
        await prisma.material.update({
          where: { id: existing.id },
          data: { ...data, ...(code ? { code } : {}) },
        });
        updated++;
      } else {
        await prisma.material.create({
          data: { ...data, code, active: true },
        });
        created++;
      }
    } catch (e) {
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return Response.json({ ok: true, created, updated, errors });
}
