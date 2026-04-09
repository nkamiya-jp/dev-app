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
  ACTIVITY_TYPES,
  getLeadStatusColor,
  getLeadStatusLabel,
  getTemperatureColor,
  getTemperatureLabel,
  getLeadSourceLabel,
  getActivityTypeLabel,
} from "@/lib/lead-status";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Phone, Mail, MapPin, ArrowRight, Plus } from "lucide-react";

interface Prospect {
  id: string;
  name: string;
  company: string | null;
  department: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  leadStatus: string | null;
  leadSource: string | null;
  temperature: string | null;
  lastContactDate: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
}

interface Activity {
  id: string;
  type: string;
  content: string;
  activityDate: string;
  createdAt: string;
}

export function ProspectDetail({ contactId }: { contactId: string }) {
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const [pRes, aRes] = await Promise.all([
      fetch(`/api/contacts/${contactId}`),
      fetch(`/api/activities?contactId=${contactId}`),
    ]);
    setProspect(await pRes.json());
    setActivities(await aRes.json());
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!prospect) return <div className="p-8 text-gray-400">読み込み中...</div>;

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/prospects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: contactId,
        name: form.get("name"),
        company: form.get("company") || null,
        department: form.get("department") || null,
        title: form.get("title") || null,
        email: form.get("email") || null,
        phone: form.get("phone") || null,
        leadSource: form.get("leadSource") || null,
        temperature: form.get("temperature") || null,
        nextAction: form.get("nextAction") || null,
        nextActionDate: form.get("nextActionDate") || null,
      }),
    });
    setEditOpen(false);
    load();
  }

  async function handleAddActivity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        type: form.get("type"),
        content: form.get("content"),
        activityDate: form.get("activityDate") || new Date().toISOString(),
      }),
    });
    setActivityOpen(false);
    load();
  }

  async function handleConvert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setConvertLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/prospects/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        dealTitle: form.get("dealTitle"),
        dealDescription: form.get("dealDescription") || null,
      }),
    });
    const deal = await res.json();
    setConvertLoading(false);
    setConvertOpen(false);
    router.push(`/deals/${deal.id}`);
  }

  async function handleStatusChange(status: string) {
    await fetch("/api/prospects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contactId, leadStatus: status }),
    });
    load();
  }

  const ACTIVITY_TYPE_COLORS: Record<string, string> = {
    phone: "bg-blue-100 text-blue-700",
    email: "bg-purple-100 text-purple-700",
    visit: "bg-green-100 text-green-700",
    exhibition: "bg-orange-100 text-orange-700",
    other: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/prospects" className="text-gray-500 hover:text-gray-700">← 開拓一覧</Link>
        <div className="flex items-center gap-2">
          {prospect.leadStatus !== "converted" && (
            <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
              <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                <ArrowRight className="size-4 mr-1" /> 案件化
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>案件化</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleConvert} className="space-y-3">
                  <p className="text-sm text-gray-500">
                    {prospect.name}{prospect.company ? ` (${prospect.company})` : ""} を案件として登録します。
                  </p>
                  <Input
                    name="dealTitle"
                    placeholder="案件名 *"
                    defaultValue={prospect.company ? `${prospect.company} - 新規案件` : `${prospect.name} - 新規案件`}
                    required
                  />
                  <textarea
                    name="dealDescription"
                    placeholder="説明（任意）"
                    rows={2}
                    className="w-full border rounded-md px-3 py-2 text-sm resize-y"
                  />
                  <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={convertLoading}>
                    {convertLoading ? "作成中..." : "案件を作成"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
              <Pencil className="size-4 mr-1" /> 編集
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>見込客を編集</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEdit} className="space-y-3 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="text-xs text-gray-500">名前 *</label>
                  <Input name="name" defaultValue={prospect.name} required />
                </div>
                <div>
                  <label className="text-xs text-gray-500">会社</label>
                  <Input name="company" defaultValue={prospect.company || ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">部署</label>
                  <Input name="department" defaultValue={prospect.department || ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">役職</label>
                  <Input name="title" defaultValue={prospect.title || ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">メール</label>
                  <Input name="email" type="email" defaultValue={prospect.email || ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">電話</label>
                  <Input name="phone" defaultValue={prospect.phone || ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">リードソース</label>
                  <select name="leadSource" defaultValue={prospect.leadSource || ""} className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="">未設定</option>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">温度感</label>
                  <select name="temperature" defaultValue={prospect.temperature || "medium"} className="w-full border rounded-md px-3 py-2 text-sm">
                    {TEMPERATURES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">次のアクション</label>
                  <Input name="nextAction" defaultValue={prospect.nextAction || ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">次のアクション日</label>
                  <Input name="nextActionDate" type="date" defaultValue={prospect.nextActionDate ? prospect.nextActionDate.split("T")[0] : ""} />
                </div>
                <Button type="submit" className="w-full">保存</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Basic Info */}
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{prospect.name}</CardTitle>
              {prospect.temperature && (
                <Badge className={getTemperatureColor(prospect.temperature)}>
                  温度: {getTemperatureLabel(prospect.temperature)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {prospect.company && <p className="font-medium">{prospect.company}</p>}
            {prospect.department && <p className="text-gray-500">{prospect.department} {prospect.title}</p>}
            {prospect.email && (
              <p className="flex items-center gap-2 text-gray-600">
                <Mail className="size-4 text-gray-400" />
                <a href={`mailto:${prospect.email}`} className="text-blue-600 hover:underline">{prospect.email}</a>
              </p>
            )}
            {prospect.phone && (
              <p className="flex items-center gap-2 text-gray-600">
                <Phone className="size-4 text-gray-400" /> {prospect.phone}
              </p>
            )}
            <div className="pt-3 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">ステータス</span>
                <Badge className={getLeadStatusColor(prospect.leadStatus || "")}>
                  {getLeadStatusLabel(prospect.leadStatus || "")}
                </Badge>
              </div>
              {prospect.leadSource && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">ソース</span>
                  <span>{getLeadSourceLabel(prospect.leadSource)}</span>
                </div>
              )}
              {prospect.lastContactDate && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">最終接触</span>
                  <span>{new Date(prospect.lastContactDate).toLocaleDateString("ja-JP")}</span>
                </div>
              )}
            </div>
            {prospect.nextAction && (
              <div className="pt-3 border-t">
                <p className="text-xs text-gray-500 mb-1">次のアクション</p>
                <p className="font-medium">{prospect.nextAction}</p>
                {prospect.nextActionDate && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(prospect.nextActionDate).toLocaleDateString("ja-JP")}
                  </p>
                )}
              </div>
            )}
            {/* Status quick change */}
            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500 mb-2">ステータス変更</p>
              <div className="flex flex-wrap gap-1">
                {LEAD_STATUSES.filter((s) => s.id !== prospect.leadStatus && s.id !== "converted").map((s) => (
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

        {/* Right: Activity Log */}
        <div className="md:col-span-2 space-y-4">
          <Card className="bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">活動ログ</CardTitle>
              <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
                <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                  <Plus className="size-4 mr-1" /> 活動を追加
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>活動を記録</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddActivity} className="space-y-3">
                    <select name="type" required className="w-full border rounded-md px-3 py-2 text-sm">
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    <textarea
                      name="content"
                      placeholder="内容 *"
                      rows={3}
                      required
                      className="w-full border rounded-md px-3 py-2 text-sm resize-y"
                    />
                    <div>
                      <label className="text-xs text-gray-500">日付</label>
                      <Input
                        name="activityDate"
                        type="date"
                        defaultValue={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                    <Button type="submit" className="w-full">記録</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">まだ活動がありません</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((a) => (
                    <div key={a.id} className="flex gap-3 pb-3 border-b last:border-0">
                      <div className="shrink-0 pt-0.5">
                        <Badge className={`text-xs ${ACTIVITY_TYPE_COLORS[a.type] || "bg-gray-100 text-gray-700"}`}>
                          {getActivityTypeLabel(a.type)}
                        </Badge>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap">{a.content}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(a.activityDate).toLocaleDateString("ja-JP")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
