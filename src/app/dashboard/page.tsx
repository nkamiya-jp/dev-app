import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/stages";
import { TASK_STATUSES } from "@/lib/task-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { DashboardCharts } from "./dashboard-charts";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [contactCount, deals, tasks, allTasks] = await Promise.all([
    prisma.contact.count(),
    prisma.deal.findMany({
      include: { contact: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.task.findMany({
      where: { completed: false },
      include: { contact: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.task.findMany({
      select: { status: true },
    }),
  ]);

  const recentContacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const pipelineData = STAGES.filter(
    (s) => s.id !== "lost"
  ).map((stage) => ({
    id: stage.id,
    label: stage.label,
    color: stage.color,
    count: deals.filter((d) => d.stage === stage.id).length,
    amount: deals
      .filter((d) => d.stage === stage.id)
      .reduce((sum, d) => sum + (d.amount || 0), 0),
  }));

  const taskStatusData = TASK_STATUSES.map((s) => ({
    name: s.label,
    value: allTasks.filter((t) => t.status === s.id).length,
    id: s.id,
  }));

  const totalAmount = deals
    .filter((d) => d.stage !== "lost")
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const wonAmount = deals
    .filter((d) => ["decided", "manufacturing"].includes(d.stage))
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const activeDeals = deals.filter(
    (d) => !["decided", "manufacturing", "lost"].includes(d.stage)
  ).length;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">ダッシュボード</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">顧客</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{contactCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">進行中の案件</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeDeals}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">案件合計</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalAmount.toLocaleString()}円</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">決定</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{wonAmount.toLocaleString()}円</p>
          </CardContent>
        </Card>
      </div>

      <DashboardCharts pipelineData={pipelineData} taskStatusData={taskStatusData} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">案件進捗</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pipelineData.map((stage) => (
                <div key={stage.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={stage.color}>
                      {stage.label}
                    </Badge>
                    <span className="text-sm text-gray-500">{stage.count}件</span>
                  </div>
                  <span className="text-sm font-medium">
                    {stage.amount.toLocaleString()}円
                  </span>
                </div>
              ))}
            </div>
            <Link
              href="/deals"
              className="block mt-4 text-sm text-blue-600 hover:underline"
            >
              案件進捗を見る
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">直近のタスク</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-500">タスクなし</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-gray-500">{task.contact.name}</p>
                    </div>
                    {task.dueDate && (
                      <span className="text-xs text-gray-500">
                        {new Date(task.dueDate).toLocaleDateString("ja-JP")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/tasks"
              className="block mt-4 text-sm text-blue-600 hover:underline"
            >
              タスク一覧
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">最近の顧客</CardTitle>
        </CardHeader>
        <CardContent>
          {recentContacts.length === 0 ? (
            <p className="text-sm text-gray-500">
              顧客がいません。
              <Link href="/contacts" className="text-blue-600 hover:underline ml-1">
                追加する
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {recentContacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-gray-500">
                      {[c.company, c.title].filter(Boolean).join(" / ")}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleDateString("ja-JP")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
