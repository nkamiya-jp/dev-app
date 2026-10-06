"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ChevronRight, MessageSquareText, Plus, Search } from "lucide-react";
import { SlackImportDialog } from "./slack-import";

interface BoardItem {
  id: string;
  quantity: number;
  shippedQty: number;
  product: { id: string; code: string; name: string; inventory: { stock: number } | null };
}

interface OrderDraftRow {
  id: string;
  rawText: string;
  slackUserName: string | null;
  postedAt: string | null;
  createdAt: string;
}

interface BoardOrder {
  id: string;
  orderDate: string;
  dueDate: string | null;
  stage: string;
  stageUpdatedAt: string | null;
  note: string | null;
  contact: { id: string; name: string; company: string | null };
  items: BoardItem[];
}

const STAGES = [
  { id: "received", label: "受注", color: "bg-gray-100 text-gray-700", head: "border-gray-300" },
  { id: "production", label: "制作中", color: "bg-amber-100 text-amber-800", head: "border-amber-400" },
  { id: "preparing", label: "出荷準備", color: "bg-blue-100 text-blue-800", head: "border-blue-400" },
  { id: "shipped", label: "出荷済", color: "bg-emerald-100 text-emerald-800", head: "border-emerald-400" },
] as const;

const NEXT: Record<string, string> = { received: "production", production: "preparing", preparing: "shipped" };
const SHIPPED_DAYS = 14; // 出荷済は直近この日数だけ表示

function dayDiff(iso: string): number {
  // 発送予定日 - 今日（日単位・ローカル日付で比較）
  const d = new Date(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function OrderBoardPage() {
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [drafts, setDrafts] = useState<OrderDraftRow[]>([]);
  const [activeDraft, setActiveDraft] = useState<OrderDraftRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/orders");
    if (res.ok) setOrders(await res.json());
    const dr = await fetch("/api/order-drafts");
    if (dr.ok) setDrafts(await dr.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStage(id: string, stage: string) {
    setSavingId(id);
    // 楽観的更新
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, stage, stageUpdatedAt: new Date().toISOString() } : o)));
    const res = await fetch("/api/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stage }),
    });
    setSavingId(null);
    if (!res.ok) {
      alert("進捗の更新に失敗しました。時間をおいて再度お試しください。");
      load();
    }
  }

  const visible = useMemo(() => {
    const q = search.trim();
    return orders.filter((o) => {
      if (o.stage === "cancelled") return false;
      if (o.stage === "shipped") {
        const at = new Date(o.stageUpdatedAt || o.orderDate).getTime();
        if (Date.now() - at > SHIPPED_DAYS * 86400000) return false;
      }
      if (!q) return true;
      const hay = `${o.contact.company || ""} ${o.contact.name} ${o.note || ""} ${o.items.map((i) => i.product.name).join(" ")}`;
      return hay.includes(q);
    });
  }, [orders, search]);

  // 遅れ：発送予定日を過ぎていて未出荷
  const overdue = visible.filter((o) => o.stage !== "shipped" && o.dueDate && dayDiff(o.dueDate) < 0);

  function sortInColumn(a: BoardOrder, b: BoardOrder) {
    const da = a.dueDate ? dayDiff(a.dueDate) : 9999;
    const db = b.dueDate ? dayDiff(b.dueDate) : 9999;
    if (da !== db) return da - db;
    return new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
  }

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">受注進捗</h2>
          <p className="text-xs text-gray-500 mt-1">
            受注 → 制作中 → 出荷準備 → 出荷済。発送予定日を過ぎた受注は赤で表示します。
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="顧客・商品で検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full sm:w-56"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              setActiveDraft(null);
              setImportOpen(true);
            }}
          >
            <MessageSquareText className="size-4 mr-1" /> Slackから登録
          </Button>
          <Link href="/orders">
            <Button size="sm" variant="outline">
              <Plus className="size-4 mr-1" /> 手入力
            </Button>
          </Link>
        </div>
      </div>

      <SlackImportDialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) setActiveDraft(null);
        }}
        onCreated={load}
        draft={activeDraft ? { id: activeDraft.id, rawText: activeDraft.rawText } : null}
      />

      {drafts.length > 0 && (
        <Card className="border-blue-300 bg-blue-50/50">
          <CardContent className="py-3 space-y-2">
            <p className="text-sm font-medium text-blue-900 flex items-center gap-1.5">
              <MessageSquareText className="size-4" /> Slackから届いた確認待ち {drafts.length}件
            </p>
            <ul className="space-y-2">
              {drafts.map((d) => (
                <li key={d.id} className="bg-white rounded-md border p-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-500">
                      {d.postedAt
                        ? new Date(d.postedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : ""}
                      {d.slackUserName ? `・${d.slackUserName}` : ""}
                    </p>
                    <p className="text-sm whitespace-pre-line line-clamp-3">{d.rawText}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setActiveDraft(d);
                        setImportOpen(true);
                      }}
                    >
                      確認して登録
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={async () => {
                        if (!confirm("この投稿は受注ではないものとして、確認待ちから外しますか？")) return;
                        setDrafts((prev) => prev.filter((x) => x.id !== d.id));
                        const res = await fetch("/api/order-drafts", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: d.id, status: "dismissed" }),
                        });
                        if (!res.ok) {
                          alert("更新に失敗しました。時間をおいて再度お試しください。");
                          load();
                        }
                      }}
                    >
                      対象外
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {overdue.length > 0 && (
        <Card className="border-red-300 bg-red-50/60">
          <CardContent className="py-3">
            <p className="text-sm font-medium text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="size-4" /> 発送予定を過ぎている受注 {overdue.length}件
            </p>
            <ul className="mt-1.5 text-sm text-red-800 space-y-0.5">
              {overdue.sort(sortInColumn).map((o) => (
                <li key={o.id}>
                  {o.contact.company || o.contact.name}
                  <span className="text-red-600">（予定 {fmtDate(o.dueDate)}・{-dayDiff(o.dueDate!)}日遅れ・{STAGES.find((s) => s.id === o.stage)?.label}）</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {STAGES.map((st) => {
          const list = visible.filter((o) => o.stage === st.id).sort(sortInColumn);
          return (
            <div key={st.id} className="space-y-2">
              <div className={`flex items-center justify-between border-b-2 ${st.head} pb-1`}>
                <span className="font-medium text-sm">{st.label}</span>
                <span className="text-xs text-gray-500">
                  {list.length}件{st.id === "shipped" ? `（直近${SHIPPED_DAYS}日）` : ""}
                </span>
              </div>
              {list.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">なし</p>}
              {list.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  saving={savingId === o.id}
                  onSetStage={(s) => setStage(o.id, s)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  saving,
  onSetStage,
}: {
  order: BoardOrder;
  saving: boolean;
  onSetStage: (stage: string) => void;
}) {
  const diff = order.dueDate ? dayDiff(order.dueDate) : null;
  const done = order.stage === "shipped";
  const late = !done && diff !== null && diff < 0;
  const soon = !done && diff !== null && diff >= 0 && diff <= 3;

  // 明細ごとの在庫充足（在庫は全受注で共有の総数なので目安）
  const lines = order.items.map((it) => {
    const need = Math.max(0, it.quantity - it.shippedQty);
    const stock = it.product.inventory?.stock ?? 0;
    return { ...it, need, stock, enough: stock >= need };
  });
  const allInStock = lines.length > 0 && lines.every((l) => l.enough);
  const next = NEXT[order.stage];

  return (
    <Card className={`bg-white shadow-sm ${late ? "border-red-400 ring-1 ring-red-200" : ""}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{order.contact.company || order.contact.name}</p>
            <p className="text-[11px] text-gray-400">受注 {fmtDate(order.orderDate)}</p>
          </div>
          {order.dueDate && (
            <Badge
              className={
                late ? "bg-red-600 text-white" : soon ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"
              }
            >
              発送 {fmtDate(order.dueDate)}
              {late ? `（${-diff!}日遅れ）` : diff === 0 ? "（今日）" : soon ? `（あと${diff}日）` : ""}
            </Badge>
          )}
        </div>

        <ul className="space-y-0.5">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">
                {l.product.name} <span className="text-gray-500">×{l.quantity}</span>
              </span>
              {!done && l.need > 0 && (
                <span className={`shrink-0 ${l.enough ? "text-emerald-600" : "text-amber-700"}`}>
                  {l.enough ? "在庫あり" : `要制作（在庫${l.stock}）`}
                </span>
              )}
            </li>
          ))}
          {lines.length === 0 && <li className="text-xs text-gray-400">明細なし</li>}
        </ul>

        {order.note && <p className="text-[11px] text-gray-500 line-clamp-2 whitespace-pre-line">{order.note}</p>}

        {order.stage === "received" && allInStock && (
          <p className="text-[11px] text-emerald-700">在庫で出せます → 出荷準備へ進められます</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1 border-t">
          <select
            value={order.stage}
            disabled={saving}
            onChange={(e) => onSetStage(e.target.value)}
            className="border rounded px-1.5 py-1 text-xs bg-white"
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
            <option value="cancelled">キャンセル</option>
          </select>
          {next && (
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => onSetStage(order.stage === "received" && allInStock ? "preparing" : next)}
              className="h-7 text-xs"
            >
              {order.stage === "received" && allInStock
                ? "出荷準備へ"
                : `${STAGES.find((s) => s.id === next)?.label}へ`}
              <ChevronRight className="size-3.5 ml-0.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
