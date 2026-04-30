"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TASK_STATUSES, getTaskStatusLabel, getTaskStatusColor } from "@/lib/task-status";
import { getStageLabel } from "@/lib/stages";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Member {
  id: string;
  name: string;
  role: string | null;
  color: string;
  type: string;
  phone: string | null;
  specialties: string | null;
  active: boolean;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  forStage: string | null;
  assignee: string | null;
  dealId: string | null;
  deal: { id: string; title: string } | null;
  contact: { id: string; name: string };
}

const MEMBER_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316",
];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [tab, setTab] = useState("board");
  const [typeFilter, setTypeFilter] = useState<"staff" | "worker" | "">("staff");

  const loadMembers = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("includeInactive", "1");
    const res = await fetch(`/api/members?${params.toString()}`);
    setMembers(await res.json());
  }, []);

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    setTasks(await res.json());
  }, []);

  useEffect(() => {
    loadMembers();
    loadTasks();
  }, [loadMembers, loadTasks]);

  async function handleSaveMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      name: form.get("name") as string,
      role: (form.get("role") as string) || null,
      color: form.get("color") as string,
      type: (form.get("type") as string) || "staff",
      phone: (form.get("phone") as string) || null,
      specialties: (form.get("specialties") as string) || null,
    };
    if (editMember) {
      await fetch("/api/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editMember.id, ...data }),
      });
    } else {
      await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setDialogOpen(false);
    setEditMember(null);
    loadMembers();
  }

  async function deleteMember(id: string) {
    await fetch(`/api/members?id=${id}`, { method: "DELETE" });
    loadMembers();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function isOverdue(task: Task) {
    if (!task.dueDate || task.status === "done") return false;
    return new Date(task.dueDate) < today;
  }

  // Group tasks by assignee
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const unassigned = activeTasks.filter((t) => !t.assignee);

  // Calendar helpers
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  function getMonthDays(year: number, month: number) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    // padding for start of week (Monday = 0)
    const startDay = (first.getDay() + 6) % 7;
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  }

  const calDays = getMonthDays(calYear, calMonth);
  const dueTasks = tasks.filter((t) => t.dueDate && t.status !== "done");

  function tasksForDate(date: Date) {
    return dueTasks.filter((t) => {
      const d = new Date(t.dueDate!);
      return d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate();
    });
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); }
    else setCalMonth(calMonth - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">スタッフ</h2>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setTypeFilter("staff")}
              className={`px-3 py-1.5 text-sm ${typeFilter === "staff" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              社員
            </button>
            <button
              onClick={() => setTypeFilter("worker")}
              className={`px-3 py-1.5 text-sm ${typeFilter === "worker" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              内職
            </button>
            <button
              onClick={() => setTypeFilter("")}
              className={`px-3 py-1.5 text-sm ${typeFilter === "" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              全員
            </button>
          </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditMember(null); }}>
          <DialogTrigger
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + 担当者を追加
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editMember ? "担当者を編集" : "担当者を追加"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveMember} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">区分 *</label>
                <select
                  name="type"
                  defaultValue={editMember?.type || typeFilter || "staff"}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="staff">社員</option>
                  <option value="worker">内職</option>
                </select>
              </div>
              <Input name="name" placeholder="名前 *" required defaultValue={editMember?.name || ""} />
              <Input name="role" placeholder="役割（例: デザイナー、営業）" defaultValue={editMember?.role || ""} />
              <Input name="phone" placeholder="電話番号" defaultValue={editMember?.phone || ""} />
              <Input name="specialties" placeholder="得意商品（例: 西2.6, 西3.3）" defaultValue={editMember?.specialties || ""} />
              <div>
                <label className="text-xs text-gray-500">カラー</label>
                <div className="flex gap-2 mt-1">
                  {MEMBER_COLORS.map((c) => (
                    <label key={c} className="cursor-pointer">
                      <input type="radio" name="color" value={c} defaultChecked={c === (editMember?.color || "#3b82f6")} className="sr-only peer" />
                      <div
                        className="w-8 h-8 rounded-full border-2 border-transparent peer-checked:border-gray-900 peer-checked:ring-2 peer-checked:ring-offset-1"
                        style={{ backgroundColor: c }}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full">{editMember ? "更新" : "追加"}</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Member chips */}
      <div className="flex flex-wrap gap-2">
        {members.filter((m) => !typeFilter || m.type === typeFilter).map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer hover:shadow-sm"
            onClick={() => { setEditMember(m); setDialogOpen(true); }}
          >
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
            <span className="font-medium">{m.name}</span>
            {m.role && <span className="text-gray-400 text-xs">{m.role}</span>}
            <span className="text-xs text-gray-400">
              ({activeTasks.filter((t) => t.assignee === m.name).length})
            </span>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="board">担当者別</TabsTrigger>
          <TabsTrigger value="calendar">カレンダー</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {members.filter((m) => !typeFilter || m.type === typeFilter).map((member) => {
              const memberTasks = activeTasks.filter((t) => t.assignee === member.name);
              return (
                <Card key={member.id} className="bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: member.color }} />
                      <CardTitle className="text-base">{member.name}</CardTitle>
                      <Badge variant="secondary" className="ml-auto">{memberTasks.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {memberTasks.length === 0 ? (
                      <p className="text-sm text-gray-400">タスクなし</p>
                    ) : (
                      <div className="space-y-2">
                        {memberTasks.map((task) => (
                          <div key={task.id} className={`border rounded p-2 text-sm ${isOverdue(task) ? "border-red-200 bg-red-50" : ""}`}>
                            <p className="font-medium">{task.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="secondary" className={`text-xs ${getTaskStatusColor(task.status)}`}>
                                {getTaskStatusLabel(task.status)}
                              </Badge>
                              {task.deal && (
                                <Link href={`/deals/${task.deal.id}`} className="text-xs text-blue-600 hover:underline">
                                  {task.deal.title}
                                </Link>
                              )}
                              {task.forStage && (
                                <span className="text-xs text-gray-400">{getStageLabel(task.forStage)}</span>
                              )}
                              {task.dueDate && (
                                <span className={`text-xs ${isOverdue(task) ? "text-red-600 font-medium" : "text-gray-500"}`}>
                                  {new Date(task.dueDate).toLocaleDateString("ja-JP")}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {unassigned.length > 0 && (
              <Card className="bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <CardTitle className="text-base text-gray-500">未割当</CardTitle>
                    <Badge variant="secondary" className="ml-auto">{unassigned.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {unassigned.map((task) => (
                      <div key={task.id} className={`border rounded p-2 text-sm ${isOverdue(task) ? "border-red-200 bg-red-50" : ""}`}>
                        <p className="font-medium">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="secondary" className={`text-xs ${getTaskStatusColor(task.status)}`}>
                            {getTaskStatusLabel(task.status)}
                          </Badge>
                          {task.deal && (
                            <Link href={`/deals/${task.deal.id}`} className="text-xs text-blue-600 hover:underline">
                              {task.deal.title}
                            </Link>
                          )}
                          {task.dueDate && (
                            <span className={`text-xs ${isOverdue(task) ? "text-red-600 font-medium" : "text-gray-500"}`}>
                              {new Date(task.dueDate).toLocaleDateString("ja-JP")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={prevMonth}>←</Button>
              <h3 className="text-lg font-bold">
                {calYear}年{calMonth + 1}月
              </h3>
              <Button variant="outline" size="sm" onClick={nextMonth}>→</Button>
            </div>

            <div className="grid grid-cols-7 gap-px bg-gray-200 border rounded overflow-hidden shadow-sm">
              {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
                <div key={d} className="bg-gray-50 text-center text-xs font-medium text-gray-500 py-2">
                  {d}
                </div>
              ))}
              {calDays.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} className="bg-white min-h-[80px]" />;
                const dayTasks = tasksForDate(day);
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={day.toISOString()}
                    className={`bg-white min-h-[80px] p-1 ${isToday ? "ring-2 ring-inset ring-blue-400" : ""}`}
                  >
                    <div className={`text-xs font-medium mb-1 ${isToday ? "text-blue-600" : "text-gray-600"}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((task) => {
                        const member = members.find((m) => m.name === task.assignee);
                        return (
                          <div
                            key={task.id}
                            className="text-xs truncate px-1 py-0.5 rounded"
                            style={{
                              backgroundColor: member ? member.color + "20" : "#f3f4f6",
                              borderLeft: `3px solid ${member?.color || "#9ca3af"}`,
                            }}
                            title={`${task.title} (${task.assignee || "未割当"})`}
                          >
                            {task.title}
                          </div>
                        );
                      })}
                      {dayTasks.length > 3 && (
                        <div className="text-xs text-gray-400 px-1">+{dayTasks.length - 3}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
