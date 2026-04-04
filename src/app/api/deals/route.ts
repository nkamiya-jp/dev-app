import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET() {
  const deals = await prisma.deal.findMany({
    include: {
      contact: true,
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const result = deals.map(({ tasks, ...deal }) => ({
    ...deal,
    _taskProgress: {
      total: tasks.length,
      done: tasks.filter((t) => t.status === "done").length,
    },
  }));
  return Response.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (body.expectedCloseDate && !body.expectedCloseDate.includes("T")) {
    body.expectedCloseDate = new Date(body.expectedCloseDate + "T00:00:00.000Z").toISOString();
  }
  const deal = await prisma.deal.create({ data: body });
  return Response.json(deal, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;
  if (data.expectedCloseDate && !data.expectedCloseDate.includes("T")) {
    data.expectedCloseDate = new Date(data.expectedCloseDate + "T00:00:00.000Z").toISOString();
  }
  const deal = await prisma.deal.update({ where: { id }, data });
  return Response.json(deal);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.deal.delete({ where: { id } });
  return Response.json({ ok: true });
}
