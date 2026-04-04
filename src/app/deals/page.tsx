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
import { STAGES, getStageColor, getStageLabel } from "@/lib/stages";
import Link from "next/link";
import { Search, LayoutGrid, List, ArrowUpDown, Eye } from "lucide-react";

interface Deal {
  id: string;
  title: string;
  description: string | null;
  stage: string;
  amount: number | null;
  expectedCloseDate: string | null;
  contactId: string;
  contact: { id: string; name: string; company: string | null };
  _count: { tasks: number };
  _taskProgress?: { total: number; done: number };
}

interface Contact {
  id: string;
  name: string;
  company: string | null;
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [sortKey, setSortKey] = useState<string>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleCols, setVisibleCols] = useState({
    contact: true,
    stage: true,
    amount: true,
    task: true,
    date: true,
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const loadDeals = useCallback(async () => {
    const res = await fetch("/api/deals");
    setDeals(await res.json());
  }, []);

  useEffect(() => {
    loadDeals();
    fetch("/api/contacts")
      .then((r) => r.json())
      .then(setContacts);
  }, [loadDeals]);

  async function handleCreateDeal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: (form.get("description") as string) || null,
        contactId: form.get("contactId"),
        amount: form.get("amount") ? Number(form.get("amount")) : null,
        expectedCloseDate: form.get("expectedCloseDate") || null,
      }),
    });
    setDialogOpen(false);
    loadDeals();
  }

  async function handleDrop(stageId: string) {
    if (!draggedDealId) return;
    await fetch("/api/deals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draggedDealId, stage: stageId }),
    });
    setDraggedDealId(null);
    loadDeals();
  }

  const activeStages = STAGES.filter((s) => s.id !== "lost");

  const filteredDeals = searchQuery
    ? deals.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (d.contact.company || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : deals;

  const sortedDeals = [...filteredDeals].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "title": cmp = a.title.localeCompare(b.title); break;
      case "contact": cmp = a.contact.name.localeCompare(b.contact.name); break;
      case "stage": {
        const stageOrder = STAGES.map(s => s.id as string);
        cmp = stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
        break;
      }
      case "amount": cmp = (a.amount || 0) - (b.amount || 0); break;
      case "date": {
        const da = a.expectedCloseDate ? new Date(a.expectedCloseDate).getTime() : 0;
        const db = b.expectedCloseDate ? new Date(b.expectedCloseDate).getTime() : 0;
        cmp = da - db;
        break;
      }
      default: cmp = 0;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const colDefs = [
    { key: "contact", label: "顧客" },
    { key: "stage", label: "ステージ" },
    { key: "amount", label: "金額" },
    { key: "task", label: "タスク" },
    { key: "date", label: "予定日" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">案件</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="案件・顧客で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full sm:w-56"
            />
          </div>
          <div className="flex border rounded-md">
            <button
              onClick={() => setView("kanban")}
              className={`p-2 ${view === "kanban" ? "bg-gray-100" : "hover:bg-gray-50"}`}
              title="カンバン"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2 ${view === "list" ? "bg-gray-100" : "hover:bg-gray-50"}`}
              title="リスト"
            >
              <List className="size-4" />
            </button>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + 案件を追加
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい案件</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateDeal} className="space-y-3">
                <Input name="title" placeholder="案件名 *" required />
                <textarea
                  name="description"
                  placeholder="説明"
                  rows={2}
                  className="w-full border rounded-md px-3 py-2 text-sm resize-y"
                />
                <select
                  name="contactId"
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">顧客を選択 *</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ""}
                    </option>
                  ))}
                </select>
                <Input name="amount" placeholder="金額（円）" type="number" />
                <div>
                  <label className="text-xs text-gray-500">予定完了日</label>
                  <Input name="expectedCloseDate" type="date" />
                </div>
                <Button type="submit" className="w-full">作成</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {view === "kanban" ? (
        <>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {activeStages.map((stage) => {
              const stageDeals = filteredDeals.filter((d) => d.stage === stage.id);
              return (
                <div
                  key={stage.id}
                  className="min-w-[260px] flex-shrink-0"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(stage.id)}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={stage.color}>{stage.label}</Badge>
                    <span className="text-sm text-gray-500">{stageDeals.length}件</span>
                    {!["decided", "manufacturing"].includes(stage.id) && (
                      <span className="text-xs text-gray-400 ml-auto">
                        {stageDeals.reduce((s, d) => s + (d.amount || 0), 0).toLocaleString()}円
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {stageDeals.map((deal) => (
                      <Card
                        key={deal.id}
                        draggable
                        onDragStart={() => setDraggedDealId(deal.id)}
                        className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-3">
                          <Link href={`/deals/${deal.id}`} className="font-medium text-sm text-blue-700 hover:underline">
                            {deal.title}
                          </Link>
                          <p className="text-xs text-gray-500 mt-1">
                            {deal.contact.name}
                            {deal.contact.company ? ` (${deal.contact.company})` : ""}
                          </p>
                          {deal.amount != null && (
                            <p className="text-sm font-medium mt-2">{deal.amount.toLocaleString()}円</p>
                          )}
                          {deal.expectedCloseDate && (
                            <p className="text-xs text-gray-400 mt-1">
                              予定: {new Date(deal.expectedCloseDate).toLocaleDateString("ja-JP")}
                            </p>
                          )}
                          {deal._taskProgress && deal._taskProgress.total > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                <span>タスク</span>
                                <span>{deal._taskProgress.done}/{deal._taskProgress.total}</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-blue-500 rounded-full h-1.5 transition-all"
                                  style={{ width: `${(deal._taskProgress.done / deal._taskProgress.total) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="border-2 border-dashed rounded-lg p-4 text-center text-sm text-gray-400">
                        ドラッグ&ドロップ
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredDeals.filter((d) => d.stage === "lost").length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-red-600">
                  失注 ({filteredDeals.filter((d) => d.stage === "lost").length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {filteredDeals
                    .filter((d) => d.stage === "lost")
                    .map((deal) => (
                      <Badge key={deal.id} variant="outline" className="border-red-200 text-red-600">
                        {deal.title} - {deal.contact.name}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* List View */
        <div className="space-y-2">
          <div className="flex justify-end">
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setColMenuOpen(!colMenuOpen)}>
                <Eye className="size-4 mr-1" /> 列表示
              </Button>
              {colMenuOpen && (
                <div className="absolute right-0 top-9 z-10 bg-white border rounded-lg shadow-lg p-2 w-36">
                  {colDefs.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={visibleCols[col.key]}
                        onChange={() => setVisibleCols({ ...visibleCols, [col.key]: !visibleCols[col.key] })}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("title")}>
                    案件名 {sortKey === "title" && <ArrowUpDown className="inline size-3 ml-1" />}
                  </th>
                  {visibleCols.contact && (
                    <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("contact")}>
                      顧客 {sortKey === "contact" && <ArrowUpDown className="inline size-3 ml-1" />}
                    </th>
                  )}
                  {visibleCols.stage && (
                    <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("stage")}>
                      ステージ {sortKey === "stage" && <ArrowUpDown className="inline size-3 ml-1" />}
                    </th>
                  )}
                  {visibleCols.amount && (
                    <th className="text-right px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("amount")}>
                      金額 {sortKey === "amount" && <ArrowUpDown className="inline size-3 ml-1" />}
                    </th>
                  )}
                  {visibleCols.task && (
                    <th className="text-left px-4 py-3 font-medium text-gray-500">タスク</th>
                  )}
                  {visibleCols.date && (
                    <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("date")}>
                      予定日 {sortKey === "date" && <ArrowUpDown className="inline size-3 ml-1" />}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/deals/${deal.id}`} className="text-blue-700 font-medium hover:underline">
                        {deal.title}
                      </Link>
                    </td>
                    {visibleCols.contact && (
                      <td className="px-4 py-3 text-gray-600">
                        {deal.contact.name}
                        {deal.contact.company ? <span className="text-gray-400 ml-1">({deal.contact.company})</span> : ""}
                      </td>
                    )}
                    {visibleCols.stage && (
                      <td className="px-4 py-3">
                        <Badge className={getStageColor(deal.stage)}>{getStageLabel(deal.stage)}</Badge>
                      </td>
                    )}
                    {visibleCols.amount && (
                      <td className="px-4 py-3 text-right font-medium">
                        {deal.amount != null ? `${deal.amount.toLocaleString()}円` : "-"}
                      </td>
                    )}
                    {visibleCols.task && (
                      <td className="px-4 py-3">
                        {deal._taskProgress && deal._taskProgress.total > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-500 rounded-full h-1.5"
                                style={{ width: `${(deal._taskProgress.done / deal._taskProgress.total) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{deal._taskProgress.done}/{deal._taskProgress.total}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    )}
                    {visibleCols.date && (
                      <td className="px-4 py-3 text-gray-500">
                        {deal.expectedCloseDate
                          ? new Date(deal.expectedCloseDate).toLocaleDateString("ja-JP")
                          : "-"}
                      </td>
                    )}
                  </tr>
                ))}
                {sortedDeals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      案件がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
