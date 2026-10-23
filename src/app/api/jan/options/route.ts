import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_CHANNELS = ["Amazon JP", "Amazon US", "よしや", "諸国プラザ", "博品館"];

// GET /api/jan/options — 入力候補（台帳で使われているブランド・使用先）
export async function GET() {
  const rows = await prisma.janItem.findMany({
    where: { OR: [{ brand: { not: null } }, { channels: { not: null } }] },
    select: { brand: true, channels: true },
  });
  const brands = new Set<string>();
  const channels = new Set<string>(DEFAULT_CHANNELS);
  for (const r of rows) {
    if (r.brand) brands.add(r.brand);
    for (const c of (r.channels || "").split(", ")) if (c) channels.add(c);
  }
  return Response.json({
    brands: [...brands].sort((a, b) => a.localeCompare(b, "ja")),
    channels: [...channels],
  });
}
