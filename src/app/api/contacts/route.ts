import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") || "";
  const contacts = await prisma.contact.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search } },
            { company: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : undefined,
    include: { _count: { select: { deals: true, tasks: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json(contacts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contact = await prisma.contact.create({ data: body });
  return Response.json(contact, { status: 201 });
}
