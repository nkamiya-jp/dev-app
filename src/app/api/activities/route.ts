import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });

  const activities = await prisma.activity.findMany({
    where: { contactId },
    orderBy: { activityDate: "desc" },
  });
  return Response.json(activities);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const activity = await prisma.activity.create({
    data: {
      contactId: data.contactId,
      type: data.type,
      content: data.content,
      activityDate: new Date(data.activityDate).toISOString(),
    },
  });

  // Update lastContactDate on the contact if this activity is newer
  const contact = await prisma.contact.findUnique({ where: { id: data.contactId } });
  const activityDate = new Date(data.activityDate);
  if (contact && (!contact.lastContactDate || activityDate > new Date(contact.lastContactDate))) {
    await prisma.contact.update({
      where: { id: data.contactId },
      data: { lastContactDate: activityDate.toISOString() },
    });
  }

  return Response.json(activity);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.activity.delete({ where: { id } });
  return Response.json({ ok: true });
}
