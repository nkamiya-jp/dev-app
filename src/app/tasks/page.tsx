"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { TASK_STATUSES, getTaskStatusColor } from "@/lib/task-status";
import Link from "next/link";
import { LayoutGrid, User } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  startDate: string | null;
  contactId: string | null;
  contact: { id: string; name: string; company: string | null } | null;
  dealId: string | null;
  deal: { id: string; title: string } | null;
  developmentId: string | null;
  development: { id: string; title: string } | null;
  dueDate: string | null;
  priority: string;
  status: string;
  assignee: string | null;
  completed: boolean;
}

interface Contact {
  id: string;
  name: string;
  company: string | null;
}

interface Deal {
  id: string;
  title: string;
}

interface Project {
  id: string;
  title: string;
  status: string;
}

interface Member {
  id: string;
  name: string;
  color: string;
}

const UNASSIGNED = "__none__";
type GroupBy = "status" | "assignee";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [promotedMessage, setPromotedMessage] = useState<string | null>(null);

  // 表示の切替と絞り込み
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [filterProject, setFilterProject] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [showDone, setShowDone] = useState(true);

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    setTasks(await res.json());
  }, []);

  useEffect(() => {
    loadTasks();
    fetch("/api/contacts").then((r) => r.json()).then(setContacts);
    fetch("/api/deals").then((r) => r.json()).then(setDeals);
    fetch("/api/developments").then((r) => r.json()).then(setProjects);
    fetch("/api/members").then((r) => r.json()).then(setMembers);
  }, [loadTasks]);

  async function handleCreateTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: (form.get("description") as string) || null,
        // 顧客・案件・プロジェクトはいずれも任意（プロジェクトのタスクは顧客に紐づかない）
        contactId: (form.get("contactId") as string) || null,
        dealId: (form.get("dealId") as string) || null,
        developmentId: (form.get("developmentId") as string) || null,
        priority: form.get("priority") || "medium",
        assignee: (form.get("assignee") as string) || null,
        startDate: form.get("startDate") || null,
        dueDate: form.get("dueDate") || null,
        status: "todo",
      }),
    });
    if (!res.ok) {
      alert("タスクの作成に失敗しました。");
      return;
    }
    setDialogOpen(false);
    loadTasks();
  }

  async function updateTask(taskId: string, patch: Record<string, unknown>) {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, ...patch }),
    });
    const data = await res.json();
    if (data._promoted) {
      setPromotedMessage(`案件「${data.deal?.title}」が次のステージに進みました`);
      setTimeout(() => setPromotedMessage(null), 4000);
    }
    loadTasks();
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    loadTasks();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function isOverdue(task: Task) {
    if (!task.dueDate || task.status === "done") return false;
    return new Date(task.dueDate) < today;
  }

  // 絞り込み
  const visible = tasks.filter((t) => {
    if (filterProject && t.developmentId !== filterProject) return false;
    if (filterAssignee) {
      if (filterAssignee === UNASSIGNED ? t.assignee : t.assignee !== filterAssignee) return false;
    }
    if (!showDone && t.status === "done") return false;
    return true;
  });

  // 列の組み立て
  const columns: { key: string; label: string; color?: string; tasks: Task[] }[] =
    groupBy === "status"
      ? TASK_STATUSES.filter((s) => showDone || s.id !== "done").map((s) => ({
          key: s.id,
          label: s.label,
          color: s.color,
          tasks: visible.filter((t) => t.status === s.id),
        }))
      : (() => {
          const names = Array.from(
            new Set(visible.filter((t) => t.assignee).map((t) => t.assignee as string))
          ).sort();
          const cols = names.map((n) => ({
            key: n,
            label: n,
            tasks: visible.filter((t) => t.assignee === n),
          }));
          const none = visible.filter((t) => !t.assignee);
          if (none.length) cols.push({ key: UNASSIGNED, label: "未割当", tasks: none });
          return cols;
        })();

  const memberColor = (name: string | null) =>
    (name && members.find((m) => m.name === name)?.color) || "#9ca3af";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-2xl font-bold">タスク</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            + タスクを追加
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新しいタスク</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <Input name="title" placeholder="やること *" required />
              <Input name="description" placeholder="補足説明" />
              <select name="developmentId" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">プロジェクト（任意）</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <select name="contactId" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">顧客（任意）</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company ? `(${c.company})` : ""}
                  </option>
                ))}
              </select>
              <select name="dealId" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">案件（任意）</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
              <Input name="assignee" placeholder="担当者" list="member-names" />
              <datalist id="member-names">
                {members.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
              <select name="priority" defaultValue="medium" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">開始日</label>
                  <Input name="startDate" type="date" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">期限</label>
                  <Input name="dueDate" type="date" />
                </div>
              </div>
              <Button type="submit" className="w-full">作成</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {promotedMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-sm">
          {promotedMessage}
        </div>
      )}

      {/* 列の切替と絞り込み */}
      <div className="bg-white border rounded-md p-3 flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-md border overflow-hidden">
          <button
            onClick={() => setGroupBy("status")}
            className={`px-3 py-1.5 text-sm flex items-center gap-1 ${groupBy === "status" ? "bg-primary text-primary-foreground" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            <LayoutGrid className="size-4" /> ステータス別
          </button>
          <button
            onClick={() => setGroupBy("assignee")}
            className={`px-3 py-1.5 text-sm flex items-center gap-1 ${groupBy === "assignee" ? "bg-primary text-primary-foreground" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            <User className="size-4" /> 担当者別
          </button>
        </div>

        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">全プロジェクト</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>

        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">全担当者</option>
          {members.map((m) => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
          <option value={UNASSIGNED}>未割当</option>
        </select>

        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          完了も表示
        </label>

        <span className="text-sm text-gray-500 ml-auto">{visible.length}件</span>
      </div>

      {/* カンバン */}
      {columns.length === 0 ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-10 text-center text-gray-400">該当するタスクがありません</CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {columns.map((col) => (
            <div key={col.key} className="bg-gray-50 border rounded-lg min-w-[260px] w-[260px] shrink-0">
              <div className="px-3 py-2 border-b flex items-center gap-2">
                {groupBy === "status" ? (
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${col.color}`}>{col.label}</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: memberColor(col.key === UNASSIGNED ? null : col.key) }} />
                    {col.label}
                  </span>
                )}
                <span className="text-xs text-gray-400 ml-auto">{col.tasks.length}</span>
              </div>

              <div className="p-2 space-y-2 min-h-[60px]">
                {col.tasks.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-3">なし</p>
                ) : (
                  col.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`bg-white border rounded-md p-2 shadow-sm ${task.status === "done" ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-1">
                        <p className={`text-sm flex-1 ${task.status === "done" ? "line-through text-gray-400" : "font-medium"}`}>
                          {task.title}
                        </p>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="text-gray-300 hover:text-red-500 text-xs shrink-0"
                          title="削除"
                        >
                          ×
                        </button>
                      </div>

                      {(task.development || task.deal || task.contact) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {task.development && (
                            <Link href={`/development/${task.development.id}`} className="text-[10px] text-blue-600 hover:underline bg-blue-50 rounded px-1.5 py-0.5">
                              {task.development.title}
                            </Link>
                          )}
                          {task.deal && (
                            <Link href={`/deals/${task.deal.id}`} className="text-[10px] text-purple-600 hover:underline bg-purple-50 rounded px-1.5 py-0.5">
                              {task.deal.title}
                            </Link>
                          )}
                          {task.contact && (
                            <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{task.contact.name}</span>
                          )}
                        </div>
                      )}

                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {/* ステータス別の列では担当者を、担当者別の列ではステータスを出す */}
                        {groupBy === "status" ? (
                          <span className="flex items-center gap-1 text-[10px] text-gray-600">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: memberColor(task.assignee) }} />
                            {task.assignee || "未割当"}
                          </span>
                        ) : (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getTaskStatusColor(task.status)}`}>
                            {TASK_STATUSES.find((s) => s.id === task.status)?.label ?? task.status}
                          </span>
                        )}
                        {task.priority !== "medium" && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] py-0 ${task.priority === "high" ? "border-red-300 text-red-700" : "border-gray-300 text-gray-500"}`}
                          >
                            {task.priority === "high" ? "高" : "低"}
                          </Badge>
                        )}
                        {(task.startDate || task.dueDate) && (
                          <span className={`text-[10px] ${isOverdue(task) ? "text-red-600 font-medium" : "text-gray-500"}`}>
                            {isOverdue(task) && "! "}
                            {task.startDate && new Date(task.startDate).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                            {task.startDate && task.dueDate && " → "}
                            {task.dueDate && new Date(task.dueDate).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                          </span>
                        )}
                      </div>

                      {/* 列の移動（ドラッグ不要） */}
                      <select
                        value={task.status}
                        onChange={(e) => updateTask(task.id, { status: e.target.value })}
                        className="mt-1.5 w-full text-[11px] border rounded px-1 py-0.5 bg-white cursor-pointer"
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}へ</option>
                        ))}
                      </select>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
