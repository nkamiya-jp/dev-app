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
} from "@/components/ui/dialog";
import { STAGES, getStageLabel, getStageColor, getNextStage, isCycleStage, getCycleNextOptions } from "@/lib/stages";
import { TASK_STATUSES, getTaskStatusColor } from "@/lib/task-status";
import Link from "next/link";

interface Deal {
  id: string;
  title: string;
  description: string | null;
  stage: string;
  amount: number | null;
  expectedCloseDate: string | null;
  contactId: string;
  contact: { id: string; name: string; company: string | null };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assignee: string | null;
  priority: string;
  dueDate: string | null;
  forStage: string | null;
}

export function DealDetail({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addTaskStage, setAddTaskStage] = useState("");
  const [promotedMessage, setPromotedMessage] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  const [editDealOpen, setEditDealOpen] = useState(false);
  const [dealForm, setDealForm] = useState({ title: "", description: "", amount: "", expectedCloseDate: "" });
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);

  const loadDeal = useCallback(async () => {
    const res = await fetch(`/api/deals`);
    const deals = await res.json();
    setDeal(deals.find((d: Deal) => d.id === dealId) || null);
  }, [dealId]);

  const loadTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?dealId=${dealId}`);
    setTasks(await res.json());
  }, [dealId]);

  useEffect(() => {
    loadDeal();
    loadTasks();
    fetch("/api/members").then((r) => r.json()).then(setMembers);
  }, [loadDeal, loadTasks]);

  async function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: (form.get("description") as string) || null,
        contactId: deal?.contactId,
        dealId,
        forStage: addTaskStage || deal?.stage || null,
        assignee: (form.get("assignee") as string) || null,
        priority: form.get("priority") || "medium",
        dueDate: form.get("dueDate") || null,
      }),
    });
    setAddTaskOpen(false);
    loadTasks();
  }

  async function updateTask(taskId: string, data: Record<string, unknown>) {
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, ...data }),
    });
    if (!res.ok) {
      loadTasks();
      return;
    }
    const result = await res.json();
    if (result._promoted) {
      setPromotedMessage("全タスク完了 → 次のステージに自動昇格しました");
      setTimeout(() => setPromotedMessage(null), 4000);
      loadDeal();
    }
    loadTasks();
  }

  function openTaskEdit(task: Task) {
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(task.id);
    setEditForm({
      title: task.title,
      description: task.description || "",
      assignee: task.assignee || "",
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
    });
  }

  async function saveTaskEdit(taskId: string) {
    await updateTask(taskId, {
      title: editForm.title,
      description: editForm.description || null,
      assignee: editForm.assignee || null,
      priority: editForm.priority,
      dueDate: editForm.dueDate || null,
    });
    setExpandedTaskId(null);
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    loadTasks();
  }

  async function moveToStage(targetStage: string) {
    if (!deal) return;
    await fetch("/api/deals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deal.id, stage: targetStage }),
    });
    loadDeal();
  }

  async function advanceStage() {
    if (!deal) return;
    const next = getNextStage(deal.stage);
    if (!next) return;
    moveToStage(next);
  }

  function openDealEdit() {
    if (!deal) return;
    setDealForm({
      title: deal.title,
      description: deal.description || "",
      amount: deal.amount != null ? String(deal.amount) : "",
      expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.split("T")[0] : "",
    });
    setEditDealOpen(true);
  }

  async function saveDealEdit() {
    if (!deal) return;
    await fetch("/api/deals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: deal.id,
        title: dealForm.title,
        description: dealForm.description || null,
        amount: dealForm.amount ? Number(dealForm.amount) : null,
        expectedCloseDate: dealForm.expectedCloseDate || null,
      }),
    });
    setEditDealOpen(false);
    loadDeal();
  }

  if (!deal) {
    return <div className="text-gray-500">読み込み中...</div>;
  }

  const activeStages = STAGES.filter((s) => s.id !== "lost");
  const currentStageIdx = activeStages.findIndex((s) => s.id === deal.stage);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  function isOverdue(task: Task) {
    if (!task.dueDate || task.status === "done") return false;
    return new Date(task.dueDate) < today;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/deals" className="text-gray-500 hover:text-gray-700">
          ← 案件ボード
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{deal.title}</h2>
            <Button variant="outline" size="sm" onClick={openDealEdit}>編集</Button>
          </div>
          <p className="text-gray-500 mt-1">
            {deal.contact.name}
            {deal.contact.company ? ` (${deal.contact.company})` : ""}
          </p>
          {deal.description && (
            <p className="text-sm text-gray-600 mt-2">{deal.description}</p>
          )}
        </div>
        <div className="text-right">
          <Badge className={getStageColor(deal.stage)}>{getStageLabel(deal.stage)}</Badge>
          {deal.amount != null && (
            <p className="text-lg font-bold mt-1">{deal.amount.toLocaleString()}円</p>
          )}
          {deal.expectedCloseDate && (
            <p className="text-xs text-gray-400 mt-1">
              予定: {new Date(deal.expectedCloseDate).toLocaleDateString("ja-JP")}
            </p>
          )}
        </div>
      </div>

      {promotedMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm font-medium">
          {promotedMessage}
        </div>
      )}

      {/* Stage progress indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {activeStages.map((stage, idx) => {
          const isCompleted = idx < currentStageIdx;
          const isCurrentStage = idx === currentStageIdx;
          const isCycle = isCycleStage(stage.id);
          const prevStage = idx > 0 ? activeStages[idx - 1] : null;
          const prevIsCycle = prevStage ? isCycleStage(prevStage.id) : false;
          const nextStage = idx < activeStages.length - 1 ? activeStages[idx + 1] : null;
          const nextIsCycle = nextStage ? isCycleStage(nextStage.id) : false;
          const showCycleStart = isCycle && !prevIsCycle;
          const showCycleEnd = isCycle && !nextIsCycle;

          return (
            <div key={stage.id} className="flex items-center gap-1">
              {showCycleStart && <span className="text-gray-400 text-xs font-mono">[</span>}
              <div
                className={`px-3 py-1 rounded text-xs font-medium ${
                  isCompleted
                    ? "bg-green-100 text-green-700"
                    : isCurrentStage
                    ? getStageColor(stage.id) + " ring-2 ring-blue-400"
                    : "bg-gray-50 text-gray-400"
                }`}
              >
                {stage.label}
              </div>
              {showCycleEnd && <span className="text-gray-400 text-xs font-mono">]</span>}
              {isCycle && nextIsCycle && (
                <span className="text-gray-300 text-xs">↔</span>
              )}
              {(!isCycle || !nextIsCycle) && idx < activeStages.length - 1 && (
                <span className="text-gray-300 text-xs">→</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Stage-grouped tasks */}
      {activeStages.map((stage, stageIdx) => {
        const stageTasks = tasks.filter((t) => t.forStage === stage.id);
        const isCurrent = stage.id === deal.stage;
        const isPast = stageIdx < currentStageIdx;
        const isFuture = stageIdx > currentStageIdx;
        const doneCount = stageTasks.filter((t) => t.status === "done").length;
        const allDone = stageTasks.length > 0 && doneCount === stageTasks.length;

        if (isFuture && stageTasks.length === 0 && !isCurrent) return null;

        return (
          <Card key={stage.id} className={isCurrent ? "ring-2 ring-blue-200" : isPast ? "opacity-70" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge className={getStageColor(stage.id)}>{stage.label}</Badge>
                  {stageTasks.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {doneCount}/{stageTasks.length} 完了
                    </span>
                  )}
                  {allDone && <span className="text-xs text-green-600 font-medium">✓</span>}
                  {isCurrent && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">現在</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(isCurrent || isPast) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAddTaskStage(stage.id);
                        setAddTaskOpen(true);
                      }}
                    >
                      + タスク
                    </Button>
                  )}
                  {isCurrent && getNextStage(deal.stage) && (
                    <Button size="sm" onClick={advanceStage}>
                      次へ →
                    </Button>
                  )}
                  {isCurrent && isCycleStage(deal.stage) && (
                    <div className="flex items-center gap-1">
                      {getCycleNextOptions(deal.stage).map((targetId) => (
                        <Button
                          key={targetId}
                          size="sm"
                          variant={targetId === "production" ? "default" : "outline"}
                          onClick={() => moveToStage(targetId)}
                        >
                          {getStageLabel(targetId)}{targetId === "production" ? " →" : ""}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {isCurrent && stageTasks.length > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.round((doneCount / stageTasks.length) * 100)}%` }}
                  />
                </div>
              )}

              {stageTasks.length === 0 ? (
                isCurrent ? (
                  <p className="text-sm text-gray-400 italic">タスクを追加してください</p>
                ) : null
              ) : (
                <div className="space-y-2">
                  {stageTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`border rounded p-3 ${task.status === "done" ? "opacity-60 bg-gray-50" : "bg-white"}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <button
                            onClick={() => updateTask(task.id, { status: task.status === "done" ? "todo" : "done" })}
                            className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center text-xs shrink-0 ${
                              task.status === "done"
                                ? "bg-green-500 border-green-500 text-white"
                                : "border-gray-300 hover:border-gray-400"
                            }`}
                          >
                            {task.status === "done" ? "✓" : ""}
                          </button>
                          <div className="flex-1 min-w-0">
                            <button onClick={() => openTaskEdit(task)} className="text-left w-full">
                              <p className={`font-medium text-sm ${task.status === "done" ? "line-through text-gray-400" : ""}`}>
                                {task.title}
                              </p>
                            </button>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <select
                                value={task.status}
                                onChange={(e) => updateTask(task.id, { status: e.target.value })}
                                className={`text-xs px-2 py-0.5 rounded border-0 cursor-pointer ${getTaskStatusColor(task.status)}`}
                              >
                                {TASK_STATUSES.map((s) => (
                                  <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                              </select>
                              {task.assignee && (
                                <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                  {task.assignee}
                                </span>
                              )}
                              {task.dueDate && (
                                <span className={`text-xs ${isOverdue(task) ? "text-red-600 font-medium" : "text-gray-500"}`}>
                                  {isOverdue(task) && "! "}
                                  {new Date(task.dueDate).toLocaleDateString("ja-JP")}
                                </span>
                              )}
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  task.priority === "high"
                                    ? "border-red-300 text-red-700"
                                    : task.priority === "low"
                                    ? "border-gray-300 text-gray-500"
                                    : ""
                                }`}
                              >
                                {task.priority === "high" ? "高" : task.priority === "low" ? "低" : "中"}
                              </Badge>
                            </div>
                            {task.description && expandedTaskId !== task.id && (
                              <p className="text-xs text-gray-400 mt-1 line-clamp-1">{task.description}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="text-gray-400 hover:text-red-500 text-sm ml-2 shrink-0"
                        >
                          ×
                        </button>
                      </div>

                      {expandedTaskId === task.id && (
                        <div className="mt-3 pt-3 border-t space-y-3">
                          <div>
                            <label className="text-xs text-gray-500 font-medium">アクション内容</label>
                            <Input
                              value={editForm.title || ""}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 font-medium">説明・詳細</label>
                            <textarea
                              value={editForm.description || ""}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              rows={3}
                              className="w-full border rounded-md px-3 py-2 text-sm resize-y mt-1"
                              placeholder="タスクの詳細を記入..."
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-gray-500 font-medium">担当者</label>
                              <select
                                value={editForm.assignee || ""}
                                onChange={(e) => setEditForm({ ...editForm, assignee: e.target.value })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1"
                              >
                                <option value="">未割当</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.name}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 font-medium">納期</label>
                              <Input
                                type="date"
                                value={editForm.dueDate || ""}
                                onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 font-medium">優先度</label>
                              <select
                                value={editForm.priority || "medium"}
                                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                                className="w-full border rounded-md px-3 py-2 text-sm mt-1"
                              >
                                <option value="low">低</option>
                                <option value="medium">中</option>
                                <option value="high">高</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveTaskEdit(task.id)}>保存</Button>
                            <Button size="sm" variant="outline" onClick={() => setExpandedTaskId(null)}>キャンセル</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>タスク追加: {getStageLabel(addTaskStage)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddTask} className="space-y-3">
            <Input name="title" placeholder="アクション内容 *" required />
            <textarea
              name="description"
              placeholder="説明・詳細"
              rows={3}
              className="w-full border rounded-md px-3 py-2 text-sm resize-y"
            />
            <select name="assignee" className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">担当者を選択</option>
              {members.map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
            <select name="priority" defaultValue="medium" className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
            <div>
              <label className="text-xs text-gray-500">納期</label>
              <Input name="dueDate" type="date" />
            </div>
            <Button type="submit" className="w-full">追加</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editDealOpen} onOpenChange={setEditDealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>案件を編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">案件名</label>
              <Input
                value={dealForm.title}
                onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">説明</label>
              <textarea
                value={dealForm.description}
                onChange={(e) => setDealForm({ ...dealForm, description: e.target.value })}
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm resize-y mt-1"
                placeholder="案件の説明..."
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">金額（円）</label>
              <Input
                type="number"
                value={dealForm.amount}
                onChange={(e) => setDealForm({ ...dealForm, amount: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">予定完了日</label>
              <Input
                type="date"
                value={dealForm.expectedCloseDate}
                onChange={(e) => setDealForm({ ...dealForm, expectedCloseDate: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveDealEdit} className="flex-1">保存</Button>
              <Button variant="outline" onClick={() => setEditDealOpen(false)}>キャンセル</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
