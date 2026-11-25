import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { sortContactsByOrder } from "@/lib/contact-order";
import { getManualContactOrder } from "@/lib/contact-order-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") || "";
  // 並びは全画面共通の「基本の並び順」（タイプ順→タイプ内は顧客ページで決めた順）
  const [contacts, manual] = await Promise.all([prisma.contact.findMany({
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
  }), getManualContactOrder()]);
  return Response.json(sortContactsByOrder(contacts, manual));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contact = await prisma.contact.create({ data: body });
  return Response.json(contact, { status: 201 });
}
