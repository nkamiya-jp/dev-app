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
import {
  DEVELOPMENT_STATUSES,
  DEVELOPMENT_STATUS_BG,
  getDevelopmentStatusLabel,
  getDevelopmentStatusColor,
} from "@/lib/development-status";
import Link from "next/link";
import { Plus, Search, Lightbulb } from "lucide-react";

interface Development {
  id: string;
  title: string;
  description: string | null;
  status: string;
  initiator: string | null;
  startDate: string | null;
  releasedDate: string | null;
  product: { id: string; code: string; name: string } | null;
  tasks: { id: string; status: string }[];
  updatedAt: string;
}

export default function DevelopmentPage() {
  const [items, setItems] = useState<Development[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const load = useCallback(async () => {
    const res = await fetch("/api/developments");
    setItems(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/developments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description") || null,
        initiator: form.get("initiator") || null,
        startDate: form.get("startDate") || null,
        notes: form.get("notes") || null,
      }),
    });
    setCreateOpen(false);
    load();
  }

  const filtered = items.filter((d) => {
    if (statusFilter && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q) ||
        (d.initiator || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">商品開発</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="開発名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full sm:w-56"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">全ステータス</option>
            {DEVELOPMENT_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4 mr-1" /> 開発を始める
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい開発プロジェクト</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">開発名 *</label>
                  <Input name="title" required placeholder="例: 新シリーズ春コレクション" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">概要</label>
                  <textarea name="description" rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" placeholder="どんな商品を作るか" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">発案者</label>
                    <Input name="initiator" placeholder="名前" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">開始日</label>
                    <Input name="startDate" type="date" defaultValue={new Date().toISOString().split("T")[0]} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">メモ</label>
                  <textarea name="notes" rows={3} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
                </div>
                <Button type="submit" className="w-full">作成</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <Lightbulb className="size-12 mx-auto mb-3 text-gray-300" />
            <p>開発プロジェクトがありません</p>
            <p className="text-xs mt-1">右上の「開発を始める」から登録してください</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => {
            const totalTasks = d.tasks.length;
            const doneTasks = d.tasks.filter((t) => t.status === "done").length;
            const progressPct = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
            return (
              <Link key={d.id} href={`/development/${d.id}`}>
                <Card className={`bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer ${DEVELOPMENT_STATUS_BG[d.status]}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-sm line-clamp-2 flex-1">{d.title}</h3>
                      <Badge className={`text-xs shrink-0 ${getDevelopmentStatusColor(d.status)}`}>
                        {getDevelopmentStatusLabel(d.status)}
                      </Badge>
                    </div>
                    {d.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{d.description}</p>
                    )}
                    {d.initiator && (
                      <p className="text-xs text-gray-400">発案: {d.initiator}</p>
                    )}
                    {totalTasks > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>タスク</span>
                          <span>{doneTasks}/{totalTasks}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 rounded-full h-1.5 transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {d.product && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-gray-500">リリース済み商品</p>
                        <p className="text-xs font-mono">{d.product.code}</p>
                        <p className="text-xs">{d.product.name}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
