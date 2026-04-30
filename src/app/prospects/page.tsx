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
  LEAD_STATUSES,
  LEAD_SOURCES,
  TEMPERATURES,
  getLeadStatusColor,
  getLeadStatusLabel,
  getTemperatureColor,
  getTemperatureLabel,
  getLeadSourceLabel,
} from "@/lib/lead-status";
import Link from "next/link";
import { Search, LayoutGrid, List, ArrowUpDown } from "lucide-react";

interface Prospect {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  leadStatus: string | null;
  leadSource: string | null;
  temperature: string | null;
  lastContactDate: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  _count: { deals: number; activities: number };
}

const STATUS_BG: Record<string, string> = {
  untouched: "bg-gray-100/70",
  first_contact: "bg-blue-50",
  in_negotiation: "bg-orange-50",
  converted: "bg-green-50",
  on_hold: "bg-yellow-50",
  passed: "bg-red-50",
};

const ACTIVE_STATUSES = ["untouched", "first_contact", "in_negotiation"];

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"kanban" | "list">("list");
  const [sortKey, setSortKey] = useState<string>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadProspects = useCallback(async () => {
    const res = await fetch("/api/prospects");
    setProspects(await res.json());
  }, []);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        company: form.get("company") || null,
        email: form.get("email") || null,
        phone: form.get("phone") || null,
        leadSource: form.get("leadSource") || null,
        temperature: form.get("temperature") || "medium",
      }),
    });
    setDialogOpen(false);
    loadProspects();
  }

  async function handleDrop(status: string) {
    if (!draggedId) return;
    await fetch("/api/prospects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draggedId, leadStatus: status }),
    });
    setDraggedId(null);
    loadProspects();
  }

  const filtered = searchQuery
    ? prospects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.company || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.email || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : prospects;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "company": cmp = (a.company || "").localeCompare(b.company || ""); break;
      case "temperature": {
        const order = ["high", "medium", "low"];
        cmp = order.indexOf(a.temperature || "low") - order.indexOf(b.temperature || "low");
        break;
      }
      case "lastContactDate": {
        const da = a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0;
        const db = b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0;
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

  const terminalProspects = filtered.filter(
    (p) => p.leadStatus === "converted" || p.leadStatus === "on_hold" || p.leadStatus === "passed"
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">開拓</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="名前・会社で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full sm:w-56"
            />
          </div>
          <div className="flex border rounded-md">
            <button
              onClick={() => setView("kanban")}
              className={`p-2 ${view === "kanban" ? "bg-gray-100" : "hover:bg-gray-50"}`}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2 ${view === "list" ? "bg-gray-100" : "hover:bg-gray-50"}`}
            >
              <List className="size-4" />
            </button>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              + 見込客を追加
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい見込客</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <Input name="name" placeholder="名前 *" required />
                <Input name="company" placeholder="会社名" />
                <Input name="email" placeholder="メール" type="email" />
                <Input name="phone" placeholder="電話" />
                <select name="leadSource" className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">リードソース</option>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <select name="temperature" className="w-full border rounded-md px-3 py-2 text-sm">
                  {TEMPERATURES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <Button type="submit" className="w-full">追加</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {view === "kanban" ? (
        <>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {ACTIVE_STATUSES.map((statusId) => {
              const status = LEAD_STATUSES.find((s) => s.id === statusId)!;
              const items = filtered.filter((p) => p.leadStatus === statusId);
              return (
                <div
                  key={statusId}
                  className={`min-w-[280px] flex-shrink-0 rounded-xl p-3 ${STATUS_BG[statusId] || "bg-gray-50"}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(statusId)}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={status.color}>{status.label}</Badge>
                    <span className="text-sm text-gray-500">{items.length}件</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((p) => (
                      <Card
                        key={p.id}
                        draggable
                        onDragStart={() => setDraggedId(p.id)}
                        className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow bg-white shadow-sm"
                      >
                        <CardContent className="p-3">
                          <Link href={`/prospects/${p.id}`} className="font-medium text-sm text-blue-700 hover:underline">
                            {p.name}
                          </Link>
                          {p.company && (
                            <p className="text-xs text-gray-500 mt-0.5">{p.company}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            {p.temperature && (
                              <Badge className={`text-xs ${getTemperatureColor(p.temperature)}`}>
                                {getTemperatureLabel(p.temperature)}
                              </Badge>
                            )}
                            {p.leadSource && (
                              <span className="text-xs text-gray-400">{getLeadSourceLabel(p.leadSource)}</span>
                            )}
                          </div>
                          {p.lastContactDate && (
                            <p className="text-xs text-gray-400 mt-1.5">
                              最終接触: {new Date(p.lastContactDate).toLocaleDateString("ja-JP")}
                            </p>
                          )}
                          {p.nextAction && (
                            <p className="text-xs text-gray-600 mt-1 truncate">
                              次: {p.nextAction}
                              {p.nextActionDate && (
                                <span className="text-gray-400 ml-1">
                                  ({new Date(p.nextActionDate).toLocaleDateString("ja-JP")})
                                </span>
                              )}
                            </p>
                          )}
                          {p._count.activities > 0 && (
                            <p className="text-xs text-gray-400 mt-1">活動: {p._count.activities}件</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    {items.length === 0 && (
                      <div className="border-2 border-dashed rounded-lg p-4 text-center text-sm text-gray-400">
                        ドラッグ&ドロップ
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {terminalProspects.length > 0 && (
            <div className="space-y-2">
              {["converted", "on_hold", "passed"].map((statusId) => {
                const items = filtered.filter((p) => p.leadStatus === statusId);
                if (items.length === 0) return null;
                return (
                  <Card key={statusId} className="bg-white shadow-sm">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">
                        <Badge className={getLeadStatusColor(statusId)}>{getLeadStatusLabel(statusId)}</Badge>
                        <span className="text-gray-500 ml-2">{items.length}件</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-2">
                        {items.map((p) => (
                          <Link key={p.id} href={`/prospects/${p.id}`}>
                            <Badge variant="outline" className="cursor-pointer hover:bg-gray-50">
                              {p.name} {p.company ? `(${p.company})` : ""}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("name")}>
                  名前 {sortKey === "name" && <ArrowUpDown className="inline size-3 ml-1" />}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("company")}>
                  会社 {sortKey === "company" && <ArrowUpDown className="inline size-3 ml-1" />}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">ステータス</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("temperature")}>
                  温度感 {sortKey === "temperature" && <ArrowUpDown className="inline size-3 ml-1" />}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">ソース</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => toggleSort("lastContactDate")}>
                  最終接触 {sortKey === "lastContactDate" && <ArrowUpDown className="inline size-3 ml-1" />}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">次のアクション</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/prospects/${p.id}`} className="text-blue-700 font-medium hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.company || "-"}</td>
                  <td className="px-4 py-3">
                    <Badge className={getLeadStatusColor(p.leadStatus || "")}>
                      {getLeadStatusLabel(p.leadStatus || "")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {p.temperature && (
                      <Badge className={getTemperatureColor(p.temperature)}>
                        {getTemperatureLabel(p.temperature)}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.leadSource ? getLeadSourceLabel(p.leadSource) : "-"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {p.lastContactDate ? new Date(p.lastContactDate).toLocaleDateString("ja-JP") : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">
                    {p.nextAction || "-"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">見込客がいません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
