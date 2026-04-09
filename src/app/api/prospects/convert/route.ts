import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { contactId, dealTitle, dealDescription } = await request.json();

  const deal = await prisma.deal.create({
    data: {
      title: dealTitle,
      description: dealDescription || null,
      contactId,
      stage: "inquiry",
    },
  });

  await prisma.contact.update({
    where: { id: contactId },
    data: { leadStatus: "converted" },
  });

  return Response.json(deal);
}
