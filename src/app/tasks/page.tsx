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

interface Task {
  id: string;
  title: string;
  description: string | null;
  contactId: string;
  contact: { id: string; name: string; company: string | null };
  dealId: string | null;
  deal: { id: string; title: string } | null;
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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");
  const [promotedMessage, setPromotedMessage] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    setTasks(await res.json());
  }, []);

  useEffect(() => {
    loadTasks();
    fetch("/api/contacts").then((r) => r.json()).then(setContacts);
    fetch("/api/deals").then((r) => r.json()).then(setDeals);
  }, [loadTasks]);

  async function handleCreateTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: (form.get("description") as string) || null,
        contactId: form.get("contactId"),
        dealId: (form.get("dealId") as string) || null,
        priority: form.get("priority") || "medium",
        assignee: (form.get("assignee") as string) || null,
        dueDate: form.get("dueDate") || null,
      }),
    });
    setDialogOpen(false);
    loadTasks();
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status }),
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

  const filteredTasks = tasks.filter((t) => {
    if (filter === "active") return t.status !== "done";
    if (filter === "done") return t.status === "done";
    return true;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function isOverdue(task: Task) {
    if (!task.dueDate || task.status === "done") return false;
    return new Date(task.dueDate) < today;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">タスク</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + タスクを追加
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新しいタスク</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <Input name="title" placeholder="アクション内容 *" required />
              <Input name="description" placeholder="補足説明" />
              <select name="contactId" required className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">顧客を選択 *</option>
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
              <Input name="assignee" placeholder="担当者" />
              <select name="priority" defaultValue="medium" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
              <Input name="dueDate" type="date" />
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

      <div className="flex gap-2">
        {(["active", "all", "done"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "active" ? "未完了" : f === "done" ? "完了済" : "すべて"}
          </Button>
        ))}
        <span className="text-sm text-gray-500 self-center ml-2">
          {filteredTasks.length}件
        </span>
      </div>

      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <Card className="bg-white shadow-sm">
            <CardContent className="py-8 text-center text-gray-500">
              タスクなし
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map((task) => (
            <Card key={task.id} className={`bg-white shadow-sm ${task.status === "done" ? "opacity-60" : ""}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => updateTaskStatus(task.id, task.status === "done" ? "todo" : "done")}
                    className={`w-5 h-5 rounded border flex items-center justify-center text-xs shrink-0 ${
                      task.status === "done"
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {task.status === "done" ? "✓" : ""}
                  </button>
                  <div className="min-w-0">
                    <p className={`font-medium ${task.status === "done" ? "line-through text-gray-400" : ""}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <select
                        value={task.status}
                        onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                        className={`text-xs px-2 py-0.5 rounded border-0 cursor-pointer ${getTaskStatusColor(task.status)}`}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      <span className="text-xs text-gray-500">{task.contact.name}</span>
                      {task.deal && (
                        <Link href={`/deals/${task.deal.id}`} className="text-xs text-blue-600 hover:underline">
                          {task.deal.title}
                        </Link>
                      )}
                      {task.assignee && (
                        <Badge variant="outline" className="text-xs">
                          {task.assignee}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={
                      task.priority === "high"
                        ? "border-red-300 text-red-700"
                        : task.priority === "low"
                        ? "border-gray-300 text-gray-500"
                        : ""
                    }
                  >
                    {task.priority === "high" ? "高" : task.priority === "low" ? "低" : "中"}
                  </Badge>
                  {task.dueDate && (
                    <span className={`text-xs ${isOverdue(task) ? "text-red-600 font-medium" : "text-gray-500"}`}>
                      {isOverdue(task) && "! "}
                      {new Date(task.dueDate).toLocaleDateString("ja-JP")}
                    </span>
                  )}
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-gray-400 hover:text-red-500 text-sm ml-2"
                  >
                    ×
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
