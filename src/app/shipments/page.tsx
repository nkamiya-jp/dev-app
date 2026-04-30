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
import { SHIPMENT_STATUSES, getShipmentStatusLabel, getShipmentStatusColor } from "@/lib/order-status";
import { getContactTypeColor, getContactTypeLabel } from "@/lib/contact-meta";
import { Plus, Search, Truck, Calendar } from "lucide-react";

interface Shipment {
  id: string;
  shipDate: string;
  quantity: number;
  amount: number;
  status: string;
  note: string | null;
  contact: { id: string; name: string; company: string | null; type: string | null };
  product: { id: string; code: string; name: string; series: string | null; wholesalePrice: number | null };
  order: { id: string } | null;
}

interface Contact {
  id: string;
  name: string;
  company: string | null;
}

interface Product {
  id: string;
  code: string;
  name: string;
  wholesalePrice: number | null;
}

interface OrderLite {
  id: string;
  orderDate: string;
  contact: { id: string; name: string };
  items: { product: { id: string; code: string; name: string }; quantity: number; shippedQty: number; unitPrice: number | null }[];
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");

  const load = useCallback(async () => {
    const [sRes, cRes, pRes, oRes] = await Promise.all([
      fetch("/api/shipments"),
      fetch("/api/contacts"),
      fetch("/api/products"),
      fetch("/api/orders?status=pending,in_progress"),
    ]);
    setShipments(await sRes.json());
    setContacts(await cRes.json());
    setProducts(await pRes.json());
    setOrders(await oRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const quantity = Number(form.get("quantity"));
    const unitPrice = Number(form.get("unitPrice"));
    await fetch("/api/shipments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: form.get("contactId"),
        productId: form.get("productId"),
        orderId: form.get("orderId") || null,
        shipDate: form.get("shipDate"),
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
        status: form.get("status") || "scheduled",
        note: form.get("note") || null,
      }),
    });
    setCreateOpen(false);
    load();
  }

  async function changeStatus(id: string, status: string) {
    await fetch("/api/shipments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  const filtered = shipments.filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.contact.name.toLowerCase().includes(q) ||
        (s.contact.company || "").toLowerCase().includes(q) ||
        s.product.name.toLowerCase().includes(q) ||
        s.product.code.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // 月別売上集計
  const monthlyTotals = new Map<string, { count: number; amount: number; shipped: number }>();
  for (const s of shipments) {
    const ym = s.shipDate.slice(0, 7);
    const key = ym;
    const cur = monthlyTotals.get(key) || { count: 0, amount: 0, shipped: 0 };
    cur.count += 1;
    if (s.status === "shipped" || s.status === "delivered") {
      cur.amount += s.amount;
      cur.shipped += s.quantity;
    }
    monthlyTotals.set(key, cur);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">出荷</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="顧客・商品で検索..."
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
            {SHIPMENT_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-2 text-sm ${view === "list" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              <Truck className="size-4" />
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-2 text-sm ${view === "calendar" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              <Calendar className="size-4" />
            </button>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4 mr-1" /> 出荷を追加
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい出荷</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">顧客 *</label>
                  <select name="contactId" required className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="">選択...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.company ? ` (${c.company})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">商品 *</label>
                  <select name="productId" required className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="">選択...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id} data-price={p.wholesalePrice ?? ""}>
                        {p.code} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">関連受注（任意）</label>
                  <select name="orderId" className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="">なし（個別出荷）</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.contact.name} / {new Date(o.orderDate).toLocaleDateString("ja-JP")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">出荷日 *</label>
                    <Input name="shipDate" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">数量 *</label>
                    <Input name="quantity" type="number" required />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">単価 *</label>
                    <Input name="unitPrice" type="number" required />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">ステータス</label>
                  <select name="status" defaultValue="scheduled" className="w-full border rounded-md px-3 py-2 text-sm">
                    {SHIPMENT_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">備考</label>
                  <textarea name="note" rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
                </div>
                <Button type="submit" className="w-full">登録</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 月別サマリー */}
      {monthlyTotals.size > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[...monthlyTotals.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 4)
            .map(([ym, t]) => (
              <Card key={ym} className="bg-white shadow-sm">
                <CardContent className="p-3">
                  <p className="text-xs text-gray-500">{ym.replace("-", "年") + "月"}</p>
                  <p className="text-xl font-bold">{t.amount.toLocaleString()}<span className="text-sm font-normal text-gray-500">円</span></p>
                  <p className="text-xs text-gray-400">{t.count}件 / 出荷{t.shipped}個</p>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {filtered.length === 0 && (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <Truck className="size-12 mx-auto mb-3 text-gray-300" />
            <p>出荷データがありません</p>
          </CardContent>
        </Card>
      )}

      {view === "list" && filtered.length > 0 && (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">出荷日</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">顧客</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">商品</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">数量</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">金額</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">ステータス</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">
                    {new Date(s.shipDate).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.contact.name}</div>
                    {s.contact.company && <div className="text-xs text-gray-500">{s.contact.company}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-gray-500">{s.product.code}</div>
                    <div>{s.product.name}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{s.quantity}</td>
                  <td className="px-4 py-3 text-right font-medium">{s.amount.toLocaleString()}円</td>
                  <td className="px-4 py-3">
                    <select
                      value={s.status}
                      onChange={(e) => changeStatus(s.id, e.target.value)}
                      className={`text-xs rounded-full border-0 px-2 py-1 ${getShipmentStatusColor(s.status)}`}
                    >
                      {SHIPMENT_STATUSES.map((st) => (
                        <option key={st.id} value={st.id}>{st.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "calendar" && (
        <CalendarView shipments={filtered} />
      )}
    </div>
  );
}

function CalendarView({ shipments }: { shipments: Shipment[] }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: (Date | null)[] = [];
  const startDay = (first.getDay() + 6) % 7;
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));

  function shipsOn(date: Date) {
    return shipments.filter((s) => {
      const d = new Date(s.shipDate);
      return d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate();
    });
  }

  function prev() {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  }
  function next() {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  }

  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prev} className="px-3 py-1 border rounded hover:bg-gray-50">← 前月</button>
          <h3 className="text-lg font-medium">{year}年{month + 1}月</h3>
          <button onClick={next} className="px-3 py-1 border rounded hover:bg-gray-50">次月 →</button>
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-200 border">
          {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
            <div key={d} className="bg-gray-50 text-gray-500 text-xs font-medium p-2 text-center">{d}</div>
          ))}
          {days.map((day, i) => {
            if (!day) return <div key={i} className="bg-gray-50 min-h-[80px]" />;
            const ships = shipsOn(day);
            return (
              <div key={i} className="bg-white min-h-[80px] p-1">
                <div className="text-xs text-gray-500 mb-1">{day.getDate()}</div>
                <div className="space-y-0.5">
                  {ships.slice(0, 3).map((s) => (
                    <div
                      key={s.id}
                      className={`text-[10px] px-1 py-0.5 rounded truncate ${getShipmentStatusColor(s.status)}`}
                      title={`${s.contact.name} / ${s.product.name} × ${s.quantity}`}
                    >
                      {s.contact.name} {s.quantity}
                    </div>
                  ))}
                  {ships.length > 3 && (
                    <div className="text-[10px] text-gray-400">+{ships.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
