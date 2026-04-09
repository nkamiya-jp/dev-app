import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const prospects = await prisma.contact.findMany({
    where: { leadStatus: { not: null } },
    include: {
      activities: { orderBy: { activityDate: "desc" }, take: 3 },
      _count: { select: { deals: true, activities: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json(prospects);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const contact = await prisma.contact.create({
    data: {
      name: data.name,
      company: data.company || null,
      department: data.department || null,
      title: data.title || null,
      email: data.email || null,
      phone: data.phone || null,
      leadStatus: "untouched",
      leadSource: data.leadSource || null,
      temperature: data.temperature || "medium",
    },
  });
  return Response.json(contact);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...updateData } = data;

  // Handle date fields
  if (updateData.nextActionDate) {
    updateData.nextActionDate = new Date(updateData.nextActionDate + "T00:00:00.000Z").toISOString();
  }
  if (updateData.lastContactDate) {
    updateData.lastContactDate = new Date(updateData.lastContactDate).toISOString();
  }

  const contact = await prisma.contact.update({ where: { id }, data: updateData });
  return Response.json(contact);
}
