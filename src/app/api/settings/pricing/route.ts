import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { normalizePricingSettings } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const KEY = "pricing";

export async function GET() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  let raw: unknown = null;
  try {
    raw = row ? JSON.parse(row.value) : null;
  } catch {
    raw = null;
  }
  return Response.json(normalizePricingSettings(raw));
}

export async function PUT(request: NextRequest) {
  const settings = normalizePricingSettings(await request.json());
  const value = JSON.stringify(settings);
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
  return Response.json(settings);
}
