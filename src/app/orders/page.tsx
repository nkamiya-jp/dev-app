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
import { ORDER_STATUSES, ORDER_STATUS_BG, getOrderStatusLabel, getOrderStatusColor } from "@/lib/order-status";
import { getContactTypeColor, getContactTypeLabel } from "@/lib/contact-meta";
import Link from "next/link";
import { Plus, ChevronDown, ChevronRight, ChevronUp, Search, Trash2, Pencil, Copy } from "lucide-react";
import { Celebration } from "@/components/celebration";
import { compareProductOrder } from "@/lib/product-meta";
import { salesMonth, formatMonthLabel } from "@/lib/sales-month";

interface OrderItem {
  id: string;
  productId: string;
  product: { id: string; code: string; name: string; series: string | null; wholesalePrice: number | null };
  quantity: number;
  shippedQty: number;
  unitPrice: number | null;
  monthlyPlans: string | null;
}

interface Order {
  id: string;
  contactId: string;
  contact: { id: string; name: string; company: string | null; type: string | null; closingDay?: number | null };
  orderDate: string;
  dueDate: string | null;
  status: string;
  note: string | null;
  items: OrderItem[];
}

interface Contact {
  id: string;
  name: string;
  company: string | null;
}

// 顧客ごとの実効単価（個別価格 → 上代×掛率 → 標準卸）
type EffPrice = { price: number | null; source: string };
type EffItem = { productId: string; price: number | null; source: string };
type EffByContact = Record<string, Record<string, EffPrice>>;

interface Product {
  id: string;
  code: string;
  name: string;
  series: string | null;
  wholesalePrice: number | null;
  sortOrder?: number | null;
  active?: boolean;
  ownerContactId: string | null; // OEM商品の依頼主（その顧客の注文にだけ出す）
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [celebration, setCelebration] = useState<{ sub: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [effByContact, setEffByContact] = useState<EffByContact>({});

  const load = useCallback(async () => {
    const [oRes, cRes, pRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/contacts"),
      fetch("/api/products"),
    ]);
    setOrders(await oRes.json());
    setContacts(await cRes.json());
    setProducts(await pRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 受注に出てくる顧客ごとに、現在の実効単価（個別→自動→標準卸）を取得。
  // 既存明細の単価と比べて差分があれば「更新」ボタンを出すのに使う。
  useEffect(() => {
    const ids = [...new Set(orders.map((o) => o.contactId))];
    if (ids.length === 0) return;
    let cancelled = false;
    Promise.all(
      ids.map((id) =>
        fetch(`/api/customer-prices/effective?contactId=${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [id, d] as const)
          .catch(() => [id, null] as const)
      )
    ).then((pairs) => {
      if (cancelled) return;
      const m: EffByContact = {};
      for (const [id, d] of pairs) {
        if (!d?.items) continue;
        const pm: Record<string, EffPrice> = {};
        for (const x of d.items as EffItem[]) {
          pm[x.productId] = { price: x.price, source: x.source };
        }
        m[id] = pm;
      }
      setEffByContact(m);
    });
    return () => {
      cancelled = true;
    };
  }, [orders]);

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  async function addItem(orderId: string, productId: string, quantity: number, unitPrice: number | null) {
    await fetch("/api/orders/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, productId, quantity, unitPrice }),
    });
    load();
  }

  async function removeItem(itemId: string) {
    await fetch("/api/orders/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId }),
    });
    load();
  }

  // 明細の並べ替え：画面を先に入れ替えてから保存（失敗したら読み直して元に戻す）
  async function moveItem(order: Order, index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= order.items.length) return;
    const items = [...order.items];
    [items[index], items[j]] = [items[j], items[index]];
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, items } : o)));
    const res = await fetch("/api/orders/items/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, ids: items.map((it) => it.id) }),
    }).catch(() => null);
    if (!res?.ok) {
      alert("並び順の保存に失敗しました");
      load();
    }
  }

  async function updateItem(itemId: string, patch: { quantity?: number; unitPrice?: number | null }) {
    await fetch("/api/orders/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, ...patch }),
    });
    load();
  }

  // その受注で「現在の顧客価格と違う」明細を返す
  function priceDiffItems(order: Order) {
    const pm = effByContact[order.contactId];
    if (!pm) return [];
    return order.items.filter((it) => {
      const e = pm[it.productId];
      return e?.price != null && e.price !== it.unitPrice;
    });
  }

  // 差分のある明細の単価をまとめて現在の顧客価格に更新
  async function applyAllPrices(order: Order) {
    const pm = effByContact[order.contactId];
    const diffs = priceDiffItems(order);
    if (diffs.length === 0) return;
    await Promise.all(
      diffs.map((it) =>
        fetch("/api/orders/items", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: it.id, unitPrice: pm[it.productId].price }),
        })
      )
    );
    load();
  }

  async function handleEditOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editOrder) return;
    const form = new FormData(e.currentTarget);
    await fetch("/api/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editOrder.id,
        contactId: form.get("contactId"),
        orderDate: form.get("orderDate"),
        dueDate: form.get("dueDate") || null,
        note: form.get("note") || null,
      }),
    });
    setEditOrder(null);
    load();
  }

  async function changeStatus(order: Order, status: string) {
    await fetch("/api/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id, status }),
    });
    // 「完了」にした瞬間だけお祝いを表示（他ステータスへは出さない）
    if (status === "completed" && order.status !== "completed") {
      const totalQ = order.items.reduce((s, it) => s + it.quantity, 0);
      setCelebration({
        sub: `${order.contact.name}${order.contact.company ? `（${order.contact.company}）` : ""} / ${order.items.length}品・計${totalQ.toLocaleString()}個`,
      });
    }
    load();
  }

  async function duplicateOrder(orderId: string) {
    const res = await fetch(`/api/orders/${orderId}/duplicate`, { method: "POST" });
    const json = await res.json();
    await load();
    if (json?.id) {
      setExpanded((prev) => new Set(prev).add(json.id));
    }
  }

  async function deleteOrder(orderId: string, label: string) {
    if (!confirm(`受注「${label}」を削除します。明細もすべて削除されます。よろしいですか？`)) return;
    await fetch("/api/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId }),
    });
    load();
  }

  const filtered = orders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hits =
        o.contact.name.toLowerCase().includes(q) ||
        (o.contact.company || "").toLowerCase().includes(q) ||
        o.items.some((it) =>
          it.product.name.toLowerCase().includes(q) ||
          it.product.code.toLowerCase().includes(q)
        );
      if (!hits) return false;
    }
    return true;
  });

  function totalAmount(order: Order) {
    return order.items.reduce((sum, it) => sum + (it.unitPrice || 0) * it.quantity, 0);
  }

  // 納品月ごとに分ける。納品日（納期、未入力なら注文日）を顧客の締め日で月に振り分ける
  // 例：20日締めの顧客なら 21日以降の納品は翌月扱い（売上集計の salesMonth と同じ計算）
  const monthGroups: { ym: string; orders: Order[] }[] = [];
  for (const o of filtered) {
    const ym = salesMonth(o.dueDate || o.orderDate, o.contact.closingDay);
    let g = monthGroups.find((x) => x.ym === ym);
    if (!g) monthGroups.push((g = { ym, orders: [] }));
    g.orders.push(o);
  }
  monthGroups.sort((a, b) => b.ym.localeCompare(a.ym));

  function shipProgress(order: Order) {
    const totalQ = order.items.reduce((s, it) => s + it.quantity, 0);
    const shippedQ = order.items.reduce((s, it) => s + it.shippedQty, 0);
    return { total: totalQ, shipped: shippedQ };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">受注</h2>
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
            {ORDER_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          {/* 入力途中で外側をクリックしても閉じない（×ボタンで閉じる） */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen} disablePointerDismissal>
            <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4 mr-1" /> 受注を追加
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>新しい受注</DialogTitle>
              </DialogHeader>
              <NewOrderForm
                contacts={contacts}
                products={products}
                onCreated={() => {
                  setCreateOpen(false);
                  load();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filtered.length === 0 && (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <p>受注がありません</p>
            <p className="text-xs mt-1">右上の「受注を追加」から登録してください</p>
          </CardContent>
        </Card>
      )}

      {monthGroups.map((group) => (
      <section key={group.ym} className="space-y-2">
        <div className="flex items-baseline justify-between gap-2 border-b pb-1 mt-4">
          <h2 className="text-sm font-bold text-gray-700">{formatMonthLabel(group.ym)}納品</h2>
          <span className="text-xs text-gray-500">
            {group.orders.length}件・合計{" "}
            <span className="font-bold text-gray-800">
              {group.orders.reduce((sum, o) => sum + totalAmount(o), 0).toLocaleString()}円
            </span>
          </span>
        </div>
      <div className="space-y-2">
        {group.orders.map((order) => {
          const isExpanded = expanded.has(order.id);
          const { total, shipped } = shipProgress(order);
          const progressPct = total > 0 ? (shipped / total) * 100 : 0;
          return (
            <Card key={order.id} className="bg-white shadow-sm">
              <CardContent className="p-0">
                <div
                  className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 ${ORDER_STATUS_BG[order.status]}`}
                  onClick={() => toggleExpand(order.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="size-4 text-gray-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/contacts/${order.contactId}`}
                        className="font-medium text-blue-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {order.contact.name}
                      </Link>
                      {order.contact.company && (
                        <span className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                          {order.contact.company}
                        </span>
                      )}
                      {order.contact.type && (
                        <Badge className={`text-xs ${getContactTypeColor(order.contact.type)}`}>
                          {getContactTypeLabel(order.contact.type)}
                        </Badge>
                      )}
                      <Badge className={`text-xs ${getOrderStatusColor(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                      <span>注文日: {new Date(order.orderDate).toLocaleDateString("ja-JP")}</span>
                      {order.dueDate && (
                        <span>納期: {new Date(order.dueDate).toLocaleDateString("ja-JP")}</span>
                      )}
                      <span>明細: {order.items.length}品</span>
                      <span className="font-medium text-gray-700">
                        合計: {totalAmount(order).toLocaleString()}円
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right text-xs">
                      <div className="text-gray-500 mb-1">{shipped}/{total}</div>
                      <div className="w-24 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 rounded-full h-1.5 transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t bg-gray-50/50 p-4 space-y-3">
                    {/* 受注ヘッダー編集 */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => setEditOrder(order)}
                        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-700 hover:bg-white border rounded px-2 py-1"
                      >
                        <Pencil className="size-3.5" /> 受注内容を編集（顧客・日付・備考）
                      </button>
                    </div>

                    {/* ステータス変更 */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">ステータス変更:</span>
                      {ORDER_STATUSES.filter((s) => s.id !== order.status).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => changeStatus(order, s.id)}
                          className={`px-2 py-1 rounded-full border hover:opacity-80 ${s.color}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    {/* 顧客価格との差分があれば一括更新を案内 */}
                    {priceDiffItems(order).length > 0 && (
                      <div className="flex items-center justify-between gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
                        <span className="text-xs text-amber-800">
                          {priceDiffItems(order).length}件の明細が、現在の顧客価格と異なります
                        </span>
                        <button
                          onClick={() => applyAllPrices(order)}
                          className="text-xs bg-white border border-amber-300 text-amber-800 rounded px-2 py-1 hover:bg-amber-100"
                        >
                          全て現在の価格に更新
                        </button>
                      </div>
                    )}

                    {/* 明細リスト */}
                    {order.items.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        明細がありません。下のフォームから商品を追加してください。
                      </p>
                    ) : (
                      <div className="bg-white rounded border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="w-6"></th>
                              <th className="text-left px-3 py-2 font-medium text-gray-500">商品</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">注文数</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">出荷済</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">残数</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">単価</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">小計</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {order.items.map((it, i) => (
                              <OrderItemRow
                                key={it.id}
                                item={it}
                                onMoveUp={i > 0 ? () => moveItem(order, i, -1) : undefined}
                                onMoveDown={i < order.items.length - 1 ? () => moveItem(order, i, 1) : undefined}
                                eff={effByContact[order.contactId]?.[it.productId]}
                                onUpdate={(patch) => updateItem(it.id, patch)}
                                onRemove={() => removeItem(it.id)}
                              />
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t">
                            <tr>
                              <td></td>
                              <td className="px-3 py-2 text-gray-500">合計</td>
                              <td className="px-3 py-2 text-right font-medium">
                                {order.items.reduce((s, it) => s + it.quantity, 0).toLocaleString()}
                              </td>
                              <td colSpan={3}></td>
                              <td className="px-3 py-2 text-right font-bold">{totalAmount(order).toLocaleString()}円</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* 明細追加フォーム */}
                    <AddItemForm products={products} contactId={order.contactId} onAdd={(p, q, u) => addItem(order.id, p, q, u)} />

                    {/* 受注 複製・削除 */}
                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <button
                        onClick={() => duplicateOrder(order.id)}
                        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-700 hover:bg-white border rounded px-2 py-1"
                      >
                        <Copy className="size-3.5" /> この受注を複製
                      </button>
                      <button
                        onClick={() => deleteOrder(order.id, `${order.contact.name} / ${new Date(order.orderDate).toLocaleDateString("ja-JP")}`)}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-2 py-1"
                      >
                        <Trash2 className="size-3.5" /> この受注を削除
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      </section>
      ))}

      {/* 納品完了お祝い */}
      {celebration && (
        <Celebration sub={celebration.sub} onClose={() => setCelebration(null)} />
      )}

      {/* 受注ヘッダー編集ダイアログ */}
      <Dialog open={!!editOrder} onOpenChange={(o) => !o && setEditOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>受注内容を編集</DialogTitle>
          </DialogHeader>
          {editOrder && (
            <form onSubmit={handleEditOrder} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">顧客 *</label>
                <select
                  name="contactId"
                  required
                  defaultValue={editOrder.contactId}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.company ? ` (${c.company})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">注文日 *</label>
                  <Input name="orderDate" type="date" required defaultValue={editOrder.orderDate.slice(0, 10)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">納期</label>
                  <Input name="dueDate" type="date" defaultValue={editOrder.dueDate ? editOrder.dueDate.slice(0, 10) : ""} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">備考</label>
                <textarea name="note" rows={2} defaultValue={editOrder.note || ""} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">保存</Button>
                <Button type="button" variant="outline" onClick={() => setEditOrder(null)}>キャンセル</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 明細行（数量・単価をインライン編集） ───
function OrderItemRow({
  item,
  eff,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onRemove,
}: {
  item: OrderItem;
  eff?: EffPrice;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onUpdate: (patch: { quantity?: number; unitPrice?: number | null }) => void;
  onRemove: () => void;
}) {
  const [qty, setQty] = useState(String(item.quantity));
  const [price, setPrice] = useState(item.unitPrice != null ? String(item.unitPrice) : "");

  useEffect(() => { setQty(String(item.quantity)); }, [item.quantity]);
  useEffect(() => { setPrice(item.unitPrice != null ? String(item.unitPrice) : ""); }, [item.unitPrice]);

  const remain = item.quantity - item.shippedQty;
  const subtotal = (item.unitPrice || 0) * item.quantity;
  // 現在の実効単価と保存済み単価が食い違っていれば更新ボタンを出す
  const priceDiff = eff?.price != null && eff.price !== item.unitPrice;

  function commitQty() {
    const n = Number(qty);
    if (!qty || n <= 0) { setQty(String(item.quantity)); return; }
    if (n !== item.quantity) onUpdate({ quantity: n });
  }
  function commitPrice() {
    const n = price === "" ? null : Number(price);
    if (n !== item.unitPrice) onUpdate({ unitPrice: n });
  }

  return (
    <tr>
      <td className="pl-2 py-1">
        <div className="flex flex-col">
          <button type="button" onClick={onMoveUp} disabled={!onMoveUp} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none" title="上へ">
            <ChevronUp className="size-4" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={!onMoveDown} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none" title="下へ">
            <ChevronDown className="size-4" />
          </button>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="font-mono text-xs text-gray-500">{item.product.code}</div>
        <div>{item.product.name}</div>
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="text"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commitQty}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-16 border rounded px-2 py-1 text-right focus:ring-1 focus:ring-blue-400 outline-none"
        />
      </td>
      <td className="px-3 py-2 text-right text-green-600">{item.shippedQty}</td>
      <td className={`px-3 py-2 text-right font-medium ${remain > 0 ? "text-orange-600" : "text-gray-400"}`}>
        {remain}
      </td>
      <td className="px-3 py-2 text-right">
        <span className="inline-flex items-center gap-0.5">
          <input
            type="text"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={commitPrice}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="-"
            className="w-20 border rounded px-2 py-1 text-right focus:ring-1 focus:ring-blue-400 outline-none"
          />
          <span className="text-xs text-gray-400">円</span>
        </span>
        {priceDiff && (
          <div className="mt-0.5">
            <button
              onClick={() => onUpdate({ unitPrice: eff!.price })}
              className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 hover:bg-amber-100 whitespace-nowrap"
              title={`現在の${PRICE_SOURCE_LABEL[eff!.source] ?? eff!.source}に更新`}
            >
              {eff!.price!.toLocaleString()}円に更新
            </button>
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right font-medium">{subtotal.toLocaleString()}円</td>
      <td className="px-3 py-2 text-right">
        <button onClick={onRemove} className="text-xs text-red-600 hover:underline">削除</button>
      </td>
    </tr>
  );
}

const PRICE_SOURCE_LABEL: Record<string, string> = {
  individual: "個別価格",
  auto: "自動（上代×掛率）",
  standard: "標準卸",
};

// 顧客の取扱商品（顧客ページで登録したもの）と、その顧客のOEM商品だけを選べる商品にする。
// 新しい商品は顧客ページの取扱商品から追加する運用。handledIds=null は読み込み中（contactId 未選択も含む）
function useHandledProducts(contactId: string, products: Product[]) {
  const [handled, setHandled] = useState<{ contactId: string; ids: Set<string> } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadHandled = useCallback(async () => {
    if (!contactId) return;
    try {
      const res = await fetch(`/api/customer-prices?contactId=${contactId}`);
      if (!res.ok) throw new Error(String(res.status));
      const rows = (await res.json()) as { productId: string }[];
      setHandled({ contactId, ids: new Set(rows.map((r) => r.productId)) });
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [contactId]);

  // 顧客ページで取扱商品を追加して戻ってきたときにも反映する
  useEffect(() => {
    loadHandled();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadHandled();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadHandled]);

  const handledIds = handled && handled.contactId === contactId ? handled.ids : null;
  const options = handledIds
    ? products
        .filter((p) => p.active !== false)
        .filter((p) => (p.ownerContactId ? p.ownerContactId === contactId : handledIds.has(p.id)))
        .sort(compareProductOrder)
    : [];
  return { handledIds, loadError, options };
}

// 顧客×商品の実効単価（個別 → 自動 → 標準卸）
async function fetchEffectivePrice(contactId: string, productId: string, products: Product[]) {
  try {
    const res = await fetch(`/api/customer-prices/effective?contactId=${contactId}&productId=${productId}`);
    if (res.ok) {
      const d = await res.json();
      if (d?.price != null) return { price: d.price as number, source: d.source as string };
    }
  } catch {
    // 取得失敗時は標準卸にフォールバック
  }
  const p = products.find((p) => p.id === productId);
  return { price: p?.wholesalePrice ?? null, source: null as string | null };
}

type DraftLine = { key: number; productId: string; quantity: string; unitPrice: string; source: string | null };
let lineKey = 0;
const newLine = (): DraftLine => ({ key: ++lineKey, productId: "", quantity: "", unitPrice: "", source: null });

// 新しい受注：顧客を選ぶ → 取扱商品から明細を入れる（並べ替え可） → 「確定」で受注と明細をまとめて保存
function NewOrderForm({
  contacts,
  products,
  onCreated,
}: {
  contacts: Contact[];
  products: Product[];
  onCreated: () => void;
}) {
  const [contactId, setContactId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { handledIds, loadError, options } = useHandledProducts(contactId, products);
  const contactLink = `/contacts/${contactId}#customer-products`;

  function update(key: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function move(index: number, dir: -1 | 1) {
    setLines((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }
  async function onProductChange(key: number, id: string) {
    update(key, { productId: id, unitPrice: "", source: null });
    if (!id) return;
    const r = await fetchEffectivePrice(contactId, id, products);
    update(key, { unitPrice: r.price != null ? String(r.price) : "", source: r.source });
  }
  function onContactChange(id: string) {
    setContactId(id);
    // 顧客が変わると取扱商品・単価が変わるので明細はやり直し
    setLines([newLine()]);
  }

  const filled = lines.filter((l) => l.productId);
  const bad = filled.some((l) => !(Number(l.quantity) > 0));
  const total = filled.reduce((sum, l) => sum + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0);

  async function submit() {
    setError("");
    if (!contactId) return setError("顧客を選んでください");
    if (filled.length === 0) return setError("明細を1行以上入れてください");
    if (bad) return setError("数量が入っていない明細があります");
    setSaving(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          orderDate: orderDate || new Date().toISOString().split("T")[0],
          dueDate: dueDate || null,
          note: note || null,
          items: filled.map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: l.unitPrice === "" ? null : Number(l.unitPrice),
          })),
        }),
      });
      if (!res.ok) throw new Error();
      onCreated();
    } catch {
      setError("保存に失敗しました。もう一度「確定」を押してください");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500">顧客 *</label>
        <select
          value={contactId}
          onChange={(e) => onContactChange(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        >
          <option value="">選択してください</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.company ? ` (${c.company})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">注文日 *</label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-gray-500">納期</label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500">明細</label>
        {!contactId ? (
          <p className="text-sm text-gray-400 border border-dashed rounded p-3">顧客を選ぶと、その顧客の取扱商品から選べます。</p>
        ) : loadError && handledIds === null ? (
          <p className="text-sm text-red-600 border border-dashed rounded p-3">取扱商品の読み込みに失敗しました。開き直してください。</p>
        ) : handledIds === null ? (
          <p className="text-sm text-gray-400 border border-dashed rounded p-3">読み込み中...</p>
        ) : options.length === 0 ? (
          <div className="text-sm text-gray-600 border border-dashed rounded p-3">
            この顧客には取扱商品がまだ登録されていません。
            <Link href={contactLink} target="_blank" className="ml-1 text-blue-600 hover:underline">
              顧客ページで取扱商品を追加する
            </Link>
            <span className="block text-[11px] text-gray-400 mt-0.5">追加してこの画面に戻ると選べるようになります。</span>
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.key} className="flex items-start gap-1.5">
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-25 leading-none" title="上へ">
                    <ChevronUp className="size-4" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === lines.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-25 leading-none" title="下へ">
                    <ChevronDown className="size-4" />
                  </button>
                </div>
                <select
                  value={l.productId}
                  onChange={(e) => onProductChange(l.key, e.target.value)}
                  className="flex-1 min-w-0 border rounded-md px-2 py-2 text-sm"
                >
                  <option value="">商品を選ぶ...</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={l.quantity}
                  onChange={(e) => update(l.key, { quantity: e.target.value })}
                  placeholder="数量"
                  className={`w-20 ${l.productId && !(Number(l.quantity) > 0) ? "border-amber-400" : ""}`}
                />
                <div className="w-24">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={l.unitPrice}
                    onChange={(e) => update(l.key, { unitPrice: e.target.value, source: null })}
                    placeholder="単価"
                  />
                  {l.source && (
                    <div className={`text-[10px] mt-0.5 ${l.source === "individual" ? "text-blue-600" : "text-gray-400"}`}>
                      {PRICE_SOURCE_LABEL[l.source] ?? l.source}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== l.key) : [newLine()]))}
                  className="text-gray-400 hover:text-red-600 p-2"
                  title="明細を削除"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setLines((prev) => [...prev, newLine()])} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-0.5">
                <Plus className="size-3.5" /> 明細を追加
              </button>
              <span className="text-sm text-gray-600">合計 <span className="font-bold text-gray-900">{total.toLocaleString()}円</span></span>
            </div>
            <p className="text-[11px] text-gray-400">
              取扱商品から選びます。ほかの商品は
              <Link href={contactLink} target="_blank" className="mx-0.5 text-blue-600 hover:underline">顧客ページ</Link>
              の取扱商品に追加してください。
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-gray-500">備考</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="button" onClick={submit} disabled={saving} className="w-full">
        {saving ? "保存中..." : `確定${filled.length > 0 ? `（明細${filled.length}件）` : ""}`}
      </Button>
    </div>
  );
}

function AddItemForm({
  products,
  contactId,
  onAdd,
}: {
  products: Product[];
  contactId: string;
  onAdd: (productId: string, quantity: number, unitPrice: number | null) => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [priceSource, setPriceSource] = useState<string | null>(null);
  const { handledIds, loadError, options } = useHandledProducts(contactId, products);
  const contactLink = `/contacts/${contactId}#customer-products`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !quantity) return;
    onAdd(productId, Number(quantity), unitPrice ? Number(unitPrice) : null);
    setProductId("");
    setQuantity("");
    setUnitPrice("");
    setPriceSource(null);
  }

  // 商品選択時に、その顧客の実効単価（個別 → 自動 → 標準卸）をセット
  async function onProductChange(id: string) {
    setProductId(id);
    setPriceSource(null);
    if (!id) return;
    const r = await fetchEffectivePrice(contactId, id, products);
    setUnitPrice(r.price != null ? String(r.price) : "");
    setPriceSource(r.source);
  }

  if (handledIds !== null && options.length === 0) {
    return (
      <div className="bg-white rounded border border-dashed p-3 text-sm text-gray-600">
        この顧客には取扱商品がまだ登録されていません。
        <Link href={contactLink} className="ml-1 text-blue-600 hover:underline">
          顧客ページで取扱商品を追加する
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded border p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500">商品</label>
          <select
            value={productId}
            onChange={(e) => onProductChange(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            required
          >
            <option value="">{handledIds === null ? (loadError ? "読み込みに失敗しました" : "読み込み中...") : "選択..."}</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="text-xs text-gray-500">数量</label>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>
        <div className="w-28">
          <label className="text-xs text-gray-500">単価</label>
          <Input
            type="number"
            value={unitPrice}
            onChange={(e) => { setUnitPrice(e.target.value); setPriceSource(null); }}
            placeholder="円"
          />
          {priceSource && (
            <div className={`text-[10px] mt-0.5 ${priceSource === "individual" ? "text-blue-600" : "text-gray-400"}`}>
              {PRICE_SOURCE_LABEL[priceSource] ?? priceSource}
            </div>
          )}
        </div>
        <Button type="submit" size="sm">
          <Plus className="size-4" />
        </Button>
      </div>
      {handledIds !== null && (
        <p className="text-[11px] text-gray-400 mt-1.5">
          取扱商品から選びます。ほかの商品は
          <Link href={contactLink} className="mx-0.5 text-blue-600 hover:underline">顧客ページ</Link>
          の取扱商品に追加してください。
        </p>
      )}
      {loadError && <p className="text-[11px] text-red-600 mt-1">取扱商品の読み込みに失敗しました。再読み込みしてください。</p>}
    </form>
  );
}
