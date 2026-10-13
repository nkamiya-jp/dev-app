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
import {
  DEVELOPMENT_STATUSES,
  getDevelopmentStatusLabel,
  getDevelopmentStatusColor,
} from "@/lib/development-status";
import { TASK_STATUSES, getTaskStatusLabel, getTaskStatusColor } from "@/lib/task-status";
import { DEV_PHASES, getDevPhase } from "@/lib/development-phase";
import Link from "next/link";
import { Pencil, Plus, Trash2, Package, CheckSquare, Flag, Factory, Link2, Unlink } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  assignee: string | null;
  completed: boolean;
}

interface Milestone {
  id: string;
  title: string;
  date: string;
  note: string | null;
  done: boolean;
}

interface DevOrder {
  id: string;
  orderDate: string;
  dueDate: string | null;
  status: string;
  stage: string;
  contact: { id: string; name: string; company: string | null };
  items: { id: string; quantity: number; shippedQty: number; product: { id: string; code: string; name: string } }[];
}

interface MassRow {
  productId: string;
  code: string;
  name: string;
  ordered: number;
  shipped: number;
  requested: number;
  completed: number;
  stock: number;
}

interface OrderOpt {
  id: string;
  orderDate: string;
  status: string;
  developmentId: string | null;
  contact: { id: string; name: string; company: string | null };
  items: { quantity: number; product: { name: string } }[];
}

interface ContactOpt {
  id: string;
  name: string;
  company: string | null;
}

const ORDER_STAGE_LABEL: Record<string, string> = {
  received: "受注",
  production: "制作中",
  preparing: "出荷準備",
  shipped: "出荷済",
  cancelled: "キャンセル",
};

interface Development {
  id: string;
  title: string;
  description: string | null;
  status: string;
  phase: string;
  contactId: string | null;
  contact: { id: string; name: string; company: string | null } | null;
  orders: DevOrder[];
  massSummary: MassRow[];
  initiator: string | null;
  startDate: string | null;
  releasedDate: string | null;
  productId: string | null;
  product: { id: string; code: string; name: string } | null;
  notes: string | null;
  tasks: Task[];
  milestones: Milestone[];
}

interface Product {
  id: string;
  code: string;
  name: string;
}

interface Member {
  id: string;
  name: string;
  type: string;
}

export function DevelopmentDetail({ id }: { id: string }) {
  const [dev, setDev] = useState<Development | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [allOrders, setAllOrders] = useState<OrderOpt[]>([]);
  const [linkOrderId, setLinkOrderId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [msOpen, setMsOpen] = useState(false);

  const load = useCallback(async () => {
    const [dRes, pRes, mRes, cRes, oRes] = await Promise.all([
      fetch(`/api/developments/${id}`),
      fetch("/api/products"),
      fetch("/api/members"),
      fetch("/api/contacts"),
      fetch("/api/orders"),
    ]);
    setDev(await dRes.json());
    setProducts(await pRes.json());
    setMembers(await mRes.json());
    if (cRes.ok) setContacts(await cRes.json());
    if (oRes.ok) setAllOrders(await oRes.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!dev) return <div className="p-8 text-gray-400">読み込み中...</div>;

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/developments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        title: form.get("title"),
        description: form.get("description") || null,
        status: form.get("status"),
        phase: form.get("phase"),
        contactId: form.get("contactId") || null,
        initiator: form.get("initiator") || null,
        startDate: form.get("startDate") || null,
        releasedDate: form.get("releasedDate") || null,
        productId: form.get("productId") || null,
        notes: form.get("notes") || null,
      }),
    });
    setEditOpen(false);
    load();
  }

  async function handlePhaseChange(phase: string) {
    const res = await fetch("/api/developments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, phase }),
    });
    if (!res.ok) alert("段階の更新に失敗しました。時間をおいて再度お試しください。");
    load();
  }

  // 受注をこのプロジェクトにひもづける／外す
  async function setOrderLink(orderId: string, developmentId: string | null) {
    const res = await fetch("/api/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, developmentId }),
    });
    if (!res.ok) alert("受注のひもづけに失敗しました。時間をおいて再度お試しください。");
    setLinkOrderId("");
    load();
  }

  async function handleStatusChange(status: string) {
    await fetch("/api/developments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  async function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description") || null,
        priority: form.get("priority") || "medium",
        dueDate: form.get("dueDate") || null,
        assignee: form.get("assignee") || null,
        startDate: form.get("startDate") || null,
        developmentId: id,
        status: "todo",
      }),
    });
    if (!res.ok) {
      alert("タスクの追加に失敗しました。時間をおいて再度お試しください。");
      return;
    }
    setTaskOpen(false);
    load();
  }

  async function handleEditTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editTask) return;
    const form = new FormData(e.currentTarget);
    await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editTask.id,
        title: form.get("title"),
        description: form.get("description") || null,
        priority: form.get("priority"),
        dueDate: form.get("dueDate") || null,
        assignee: form.get("assignee") || null,
        startDate: form.get("startDate") || null,
        status: form.get("status"),
      }),
    });
    setEditTask(null);
    load();
  }

  async function changeTaskStatus(taskId: string, status: string) {
    await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status }),
    });
    load();
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" });
    load();
  }

  async function handleAddMilestone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        developmentId: id,
        title: form.get("title"),
        date: form.get("date"),
        note: form.get("note") || null,
      }),
    });
    if (!res.ok) {
      alert("マイルストーンの追加に失敗しました。");
      return;
    }
    setMsOpen(false);
    load();
  }

  async function toggleMilestone(ms: Milestone) {
    await fetch("/api/milestones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ms.id, done: !ms.done }),
    });
    load();
  }

  async function deleteMilestone(msId: string) {
    await fetch(`/api/milestones?id=${msId}`, { method: "DELETE" });
    load();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  function isOverdue(t: Task) {
    if (!t.dueDate || t.status === "done") return false;
    return new Date(t.dueDate) < today;
  }

  const totalTasks = dev.tasks.length;
  const doneTasks = dev.tasks.filter((t) => t.status === "done").length;
  const progressPct = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;

  // タスクをステータス別にグループ化
  const groupedTasks = TASK_STATUSES.map((s) => ({
    status: s,
    tasks: dev.tasks.filter((t) => t.status === s.id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/development" className="text-gray-500 hover:text-gray-700">← プロジェクト一覧</Link>
        <div className="flex items-center gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
              <Pencil className="size-4 mr-1" /> 編集
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>プロジェクトを編集</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEdit} className="space-y-3 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="text-xs text-gray-500">プロジェクト名 *</label>
                  <Input name="title" required defaultValue={dev.title} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">概要</label>
                  <textarea name="description" rows={2} defaultValue={dev.description || ""} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">ステータス</label>
                  <select name="status" defaultValue={dev.status} className="w-full border rounded-md px-3 py-2 text-sm">
                    {DEVELOPMENT_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">別注の段階</label>
                    <select name="phase" defaultValue={dev.phase} className="w-full border rounded-md px-3 py-2 text-sm">
                      {DEV_PHASES.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">依頼主（顧客）</label>
                    <select name="contactId" defaultValue={dev.contactId || ""} className="w-full border rounded-md px-3 py-2 text-sm">
                      <option value="">未設定</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{c.company || c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">発案者</label>
                    <Input name="initiator" defaultValue={dev.initiator || ""} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">開始日</label>
                    <Input name="startDate" type="date" defaultValue={dev.startDate?.split("T")[0] || ""} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">完了日</label>
                  <Input name="releasedDate" type="date" defaultValue={dev.releasedDate?.split("T")[0] || ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">関連商品（任意）</label>
                  <select name="productId" defaultValue={dev.productId || ""} className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="">未紐付け</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">メモ</label>
                  <textarea name="notes" rows={3} defaultValue={dev.notes || ""} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
                </div>
                <Button type="submit" className="w-full">保存</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 別注の段階：量産前（相談〜承認）→ 量産中 → 納品完了。押すとその段階に変更 */}
      <Card className="bg-white shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-stretch gap-1 overflow-x-auto">
            {DEV_PHASES.map((p, i) => {
              const curIdx = DEV_PHASES.findIndex((x) => x.id === dev.phase);
              const done = i < curIdx;
              const current = i === curIdx;
              const groupStart = i === 0 || DEV_PHASES[i - 1].group !== p.group;
              return (
                <div key={p.id} className="flex-1 min-w-[88px]">
                  <p className={`text-[10px] mb-1 h-3 ${groupStart ? "text-gray-500" : "text-transparent"}`}>{p.group}</p>
                  <button
                    type="button"
                    onClick={() => !current && handlePhaseChange(p.id)}
                    className={`w-full rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                      current
                        ? `${p.color} border-transparent ring-2 ring-offset-1 ring-gray-400`
                        : done
                        ? "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        : "bg-white text-gray-400 border-dashed hover:bg-gray-50"
                    }`}
                    title={current ? "現在の段階" : `${p.label} に変更`}
                  >
                    {done ? "✓ " : ""}
                    {p.label}
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Info */}
        <Card className="bg-white shadow-sm md:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">{dev.title}</CardTitle>
              <Badge className={getDevelopmentStatusColor(dev.status)}>
                {getDevelopmentStatusLabel(dev.status)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {dev.description && (
              <p className="whitespace-pre-wrap text-gray-700">{dev.description}</p>
            )}
            <div className="space-y-1 pt-3 border-t text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">依頼主</span>
                {dev.contact ? (
                  <Link href={`/contacts/${dev.contact.id}`} className="text-blue-600 hover:underline">
                    {dev.contact.company || dev.contact.name}
                  </Link>
                ) : (
                  <span className="text-gray-400">未設定（編集から設定）</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">別注の段階</span>
                <Badge className={`text-[10px] ${getDevPhase(dev.phase).color}`}>{getDevPhase(dev.phase).label}</Badge>
              </div>
              {dev.initiator && (
                <div className="flex justify-between">
                  <span className="text-gray-500">発案者</span>
                  <span>{dev.initiator}</span>
                </div>
              )}
              {dev.startDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">開始日</span>
                  <span>{new Date(dev.startDate).toLocaleDateString("ja-JP")}</span>
                </div>
              )}
              {dev.releasedDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">完了日</span>
                  <span>{new Date(dev.releasedDate).toLocaleDateString("ja-JP")}</span>
                </div>
              )}
            </div>
            {totalTasks > 0 && (
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>進捗</span>
                  <span>{doneTasks}/{totalTasks} ({Math.round(progressPct)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 rounded-full h-2 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
            {dev.product && (
              <div className="pt-3 border-t">
                <p className="text-xs text-gray-500 mb-1">関連商品</p>
                <Link
                  href={`/products`}
                  className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50"
                >
                  <Package className="size-4 text-gray-400" />
                  <div>
                    <p className="font-mono text-xs text-gray-500">{dev.product.code}</p>
                    <p className="text-sm">{dev.product.name}</p>
                  </div>
                </Link>
              </div>
            )}
            {dev.notes && (
              <div className="pt-3 border-t">
                <p className="text-xs text-gray-500 mb-1">メモ</p>
                <p className="text-sm whitespace-pre-wrap">{dev.notes}</p>
              </div>
            )}
            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500 mb-2">ステータス変更</p>
              <div className="flex flex-wrap gap-1">
                {DEVELOPMENT_STATUSES.filter((s) => s.id !== dev.status).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleStatusChange(s.id)}
                    className={`text-xs px-2 py-1 rounded-full border hover:opacity-80 ${s.color}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Milestones + Tasks */}
        <div className="md:col-span-2 space-y-4">
          <MassProductionCard
            dev={dev}
            allOrders={allOrders}
            linkOrderId={linkOrderId}
            setLinkOrderId={setLinkOrderId}
            onLink={(oid) => setOrderLink(oid, id)}
            onUnlink={(oid) => setOrderLink(oid, null)}
          />
          {/* マイルストーン（タスクではなく、期日そのものが意味を持つ節目） */}
          <Card className="bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Flag className="size-5" />
                マイルストーン（{dev.milestones?.length ?? 0}件）
              </CardTitle>
              <Dialog open={msOpen} onOpenChange={setMsOpen}>
                <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                  <Plus className="size-4 mr-1" /> 追加
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>マイルストーンを追加</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddMilestone} className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">名称 *</label>
                      <Input name="title" required placeholder="例: 展示会初日 / サンプル提出" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">日付 *</label>
                      <Input name="date" type="date" required />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">メモ</label>
                      <Input name="note" placeholder="（任意）" />
                    </div>
                    <Button type="submit" className="w-full">追加</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {!dev.milestones || dev.milestones.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  マイルストーンがありません（展示会初日・締切など、節目の日を登録できます）
                </p>
              ) : (
                <div className="space-y-1.5">
                  {dev.milestones.map((ms) => {
                    const d = new Date(ms.date);
                    const isPast = d < today && !ms.done;
                    return (
                      <div key={ms.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                        <button
                          onClick={() => toggleMilestone(ms)}
                          className={`w-4 h-4 rounded-sm rotate-45 shrink-0 border-2 ${ms.done ? "bg-green-500 border-green-500" : isPast ? "border-red-400" : "border-amber-400"}`}
                          title={ms.done ? "達成済み" : "未達成"}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${ms.done ? "line-through text-gray-400" : ""}`}>
                            {ms.title}
                          </p>
                          {ms.note && <p className="text-xs text-gray-500">{ms.note}</p>}
                        </div>
                        <span className={`text-sm shrink-0 ${ms.done ? "text-gray-400" : isPast ? "text-red-600 font-medium" : "text-gray-700"}`}>
                          {isPast && "! "}
                          {d.toLocaleDateString("ja-JP")}
                        </span>
                        <button
                          onClick={() => deleteMilestone(ms.id)}
                          className="text-gray-300 hover:text-red-500 shrink-0"
                          title="削除"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">タスク（{totalTasks}件）</CardTitle>
              <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
                <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                  <Plus className="size-4 mr-1" /> タスク追加
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>タスク追加</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddTask} className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">タイトル *</label>
                      <Input name="title" required placeholder="例: 資材A 仕入れ先候補リサーチ" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">説明</label>
                      <textarea name="description" rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">優先度</label>
                        <select name="priority" defaultValue="medium" className="w-full border rounded-md px-3 py-2 text-sm">
                          <option value="high">高</option>
                          <option value="medium">中</option>
                          <option value="low">低</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">開始日</label>
                        <Input name="startDate" type="date" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">期限</label>
                        <Input name="dueDate" type="date" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">担当者</label>
                      <select name="assignee" className="w-full border rounded-md px-3 py-2 text-sm">
                        <option value="">未割当</option>
                        {members.filter((m) => m.type === "staff").map((m) => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" className="w-full">追加</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {totalTasks === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckSquare className="size-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">タスクがありません</p>
                  <p className="text-xs mt-1">アイデア出し・資材探し・試作など、必要なタスクを追加してください</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedTasks.map(({ status, tasks }) => (
                    tasks.length > 0 && (
                      <div key={status.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`text-xs ${status.color}`}>{status.label}</Badge>
                          <span className="text-xs text-gray-500">{tasks.length}件</span>
                        </div>
                        <div className="space-y-1.5">
                          {tasks.map((t) => {
                            const overdue = isOverdue(t);
                            return (
                              <div
                                key={t.id}
                                className={`flex items-center gap-2 p-2 rounded border hover:bg-gray-50 ${overdue ? "border-red-200 bg-red-50/30" : ""}`}
                              >
                                <button
                                  onClick={() => changeTaskStatus(t.id, t.status === "done" ? "todo" : "done")}
                                  className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                                    t.status === "done" ? "bg-green-500 border-green-500 text-white" : "hover:border-green-500"
                                  }`}
                                >
                                  {t.status === "done" && "✓"}
                                </button>
                                <button
                                  onClick={() => setEditTask(t)}
                                  className="flex-1 text-left min-w-0"
                                >
                                  <p className={`text-sm font-medium truncate ${t.status === "done" ? "line-through text-gray-400" : ""}`}>
                                    {t.title}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                    {t.priority === "high" && <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">高</Badge>}
                                    {t.assignee && <span>{t.assignee}</span>}
                                    {t.dueDate && (
                                      <span className={overdue ? "text-red-600 font-medium" : ""}>
                                        {new Date(t.dueDate).toLocaleDateString("ja-JP")}
                                      </span>
                                    )}
                                  </div>
                                </button>
                                <select
                                  value={t.status}
                                  onChange={(e) => changeTaskStatus(t.id, e.target.value)}
                                  className={`text-xs rounded border-0 px-2 py-1 ${getTaskStatusColor(t.status)}`}
                                >
                                  {TASK_STATUSES.map((s) => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => deleteTask(t.id)}
                                  className="text-red-400 hover:bg-red-50 p-1 rounded"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* タスク編集 */}
      <Dialog open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>タスクを編集</DialogTitle>
          </DialogHeader>
          {editTask && (
            <form onSubmit={handleEditTask} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">タイトル *</label>
                <Input name="title" required defaultValue={editTask.title} />
              </div>
              <div>
                <label className="text-xs text-gray-500">説明</label>
                <textarea name="description" rows={2} defaultValue={editTask.description || ""} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">ステータス</label>
                  <select name="status" defaultValue={editTask.status} className="w-full border rounded-md px-3 py-2 text-sm">
                    {TASK_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">優先度</label>
                  <select name="priority" defaultValue={editTask.priority} className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">開始日</label>
                  <Input name="startDate" type="date" defaultValue={editTask.startDate?.split("T")[0] || ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">期限</label>
                  <Input name="dueDate" type="date" defaultValue={editTask.dueDate?.split("T")[0] || ""} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">担当者</label>
                <select name="assignee" defaultValue={editTask.assignee || ""} className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">未割当</option>
                  {members.filter((m) => m.type === "staff").map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full">保存</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 量産の進み具合：ひもづいた受注と、商品ごとの 受注→製造→完成→出荷 の数
function MassProductionCard({
  dev,
  allOrders,
  linkOrderId,
  setLinkOrderId,
  onLink,
  onUnlink,
}: {
  dev: Development;
  allOrders: OrderOpt[];
  linkOrderId: string;
  setLinkOrderId: (v: string) => void;
  onLink: (orderId: string) => void;
  onUnlink: (orderId: string) => void;
}) {
  // ひもづけ候補：まだどのプロジェクトにも入っていない受注。依頼主の受注を先頭に
  const candidates = allOrders
    .filter((o) => !o.developmentId && o.status !== "cancelled")
    .sort((a, b) => {
      const ac = a.contact.id === dev.contactId ? 0 : 1;
      const bc = b.contact.id === dev.contactId ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
    });
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ja-JP") : "-");

  return (
    <Card className="bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Factory className="size-5" /> 量産の進み具合
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {dev.massSummary.length === 0 ? (
          <p className="text-sm text-gray-400">
            関連商品か受注をひもづけると、受注数・製造・完成・出荷の数がここにまとまります。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1.5 pr-2 font-medium">商品</th>
                  <th className="text-right py-1.5 px-2 font-medium">受注</th>
                  <th className="text-right py-1.5 px-2 font-medium">製造依頼</th>
                  <th className="text-right py-1.5 px-2 font-medium">完成</th>
                  <th className="text-right py-1.5 px-2 font-medium">出荷済</th>
                  <th className="text-right py-1.5 pl-2 font-medium">残り</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dev.massSummary.map((r) => {
                  const remain = Math.max(0, r.ordered - r.shipped);
                  const pct = r.ordered > 0 ? Math.min(100, Math.round((r.shipped / r.ordered) * 100)) : 0;
                  return (
                    <tr key={r.productId}>
                      <td className="py-1.5 pr-2">
                        <p>{r.name}</p>
                        {r.ordered > 0 && (
                          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </td>
                      <td className="text-right px-2 tabular-nums">{r.ordered.toLocaleString()}</td>
                      <td className="text-right px-2 tabular-nums">{r.requested.toLocaleString()}</td>
                      <td className="text-right px-2 tabular-nums">{r.completed.toLocaleString()}</td>
                      <td className="text-right px-2 tabular-nums">{r.shipped.toLocaleString()}</td>
                      <td className={`text-right pl-2 tabular-nums ${remain > 0 ? "text-amber-700 font-medium" : "text-gray-400"}`}>
                        {remain.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-400 mt-1">
              製造依頼・完成は、プロジェクト開始日以降のその商品の製造記録（完成＝内職の納品済）。在庫は商品全体の数です。
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-gray-500">ひもづいた受注（{dev.orders.length}件）</p>
          {dev.orders.length === 0 && <p className="text-sm text-gray-400">まだありません</p>}
          {dev.orders.map((o) => (
            <div key={o.id} className="border rounded-md p-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {o.contact.company || o.contact.name}
                  <span className="ml-2 text-[11px] font-normal text-gray-500">
                    受注 {fmt(o.orderDate)}・発送予定 {fmt(o.dueDate)}
                  </span>
                </p>
                <p className="text-xs text-gray-600 truncate">
                  {o.items.map((it) => `${it.product.name}×${it.quantity}`).join("、") || "明細なし"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className="text-[10px] bg-gray-100 text-gray-700">{ORDER_STAGE_LABEL[o.stage] || o.stage}</Badge>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("この受注をプロジェクトから外しますか？（受注そのものは消えません）")) onUnlink(o.id);
                  }}
                  className="text-gray-400 hover:text-red-600"
                  title="プロジェクトから外す"
                >
                  <Unlink className="size-4" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <select
              value={linkOrderId}
              onChange={(e) => setLinkOrderId(e.target.value)}
              className="flex-1 min-w-0 border rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">＋ 受注をひもづける…</option>
              {candidates.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.contact.company || o.contact.name}（{fmt(o.orderDate)}）
                  {o.items.slice(0, 2).map((it) => ` ${it.product.name}×${it.quantity}`).join("")}
                  {o.items.length > 2 ? " ほか" : ""}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" disabled={!linkOrderId} onClick={() => onLink(linkOrderId)}>
              <Link2 className="size-4 mr-1" /> ひもづけ
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
