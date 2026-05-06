import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dev = await prisma.development.findUnique({
    where: { id },
    include: {
      product: true,
      tasks: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
    },
  });
  if (!dev) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(dev);
}
