import { prisma } from "@/lib/db";
import { getNextStage } from "@/lib/stages";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  const dealId = request.nextUrl.searchParams.get("dealId");
  const tasks = await prisma.task.findMany({
    where: {
      ...(contactId ? { contactId } : {}),
      ...(dealId ? { dealId } : {}),
    },
    include: { contact: true, deal: true },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
  });
  return Response.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (body.dueDate && !body.dueDate.includes("T")) {
    body.dueDate = new Date(body.dueDate + "T00:00:00.000Z").toISOString();
  }
  const task = await prisma.task.create({ data: body });
  return Response.json(task, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;

  // Convert date string to ISO DateTime if needed
  if (data.dueDate && !data.dueDate.includes("T")) {
    data.dueDate = new Date(data.dueDate + "T00:00:00.000Z").toISOString();
  }

  // If status is being set to "done", also set completed = true
  if (data.status === "done") {
    data.completed = true;
  } else if (data.status && data.status !== "done") {
    data.completed = false;
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: { deal: true },
  });

  // Auto-promote: when all tasks for the CURRENT stage are done, advance to next stage
  let promoted = false;
  if (task.dealId && task.status === "done" && task.deal) {
    const currentStage = task.deal.stage;
    const stageTasks = await prisma.task.findMany({
      where: { dealId: task.dealId, forStage: currentStage },
    });
    // Only promote if there are tasks for this stage and all are done
    if (stageTasks.length > 0 && stageTasks.every((t) => t.status === "done")) {
      const nextStage = getNextStage(currentStage);
      if (nextStage) {
        await prisma.deal.update({
          where: { id: task.dealId },
          data: { stage: nextStage },
        });
        promoted = true;
      }
    }
  }

  return Response.json({ ...task, _promoted: promoted });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.task.delete({ where: { id } });
  return Response.json({ ok: true });
}
