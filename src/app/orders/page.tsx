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
import { Plus, ChevronDown, ChevronRight, Search, Trash2, Pencil, Copy } from "lucide-react";
import { Celebration } from "@/components/celebration";

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
  contact: { id: string; name: string; company: string | null; type: string | null };
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

interface Product {
  id: string;
  code: string;
  name: string;
  series: string | null;
  wholesalePrice: number | null;
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

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: form.get("contactId"),
        orderDate: form.get("orderDate") || new Date().toISOString().split("T")[0],
        dueDate: form.get("dueDate") || null,
        note: form.get("note") || null,
      }),
    });
    setCreateOpen(false);
    load();
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

  async function updateItem(itemId: string, patch: { quantity?: number; unitPrice?: number | null }) {
    await fetch("/api/orders/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, ...patch }),
    });
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
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4 mr-1" /> 受注を追加
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい受注</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">顧客 *</label>
                  <select name="contactId" required className="w-full border rounded-md px-3 py-2 text-sm">
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
                    <Input name="orderDate" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">納期</label>
                    <Input name="dueDate" type="date" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">備考</label>
                  <textarea name="note" rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
                </div>
                <Button type="submit" className="w-full">作成（明細は後から追加）</Button>
              </form>
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

      <div className="space-y-2">
        {filtered.map((order) => {
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
                            {order.items.map((it) => (
                              <OrderItemRow
                                key={it.id}
                                item={it}
                                onUpdate={(patch) => updateItem(it.id, patch)}
                                onRemove={() => removeItem(it.id)}
                              />
                            ))}
                          </tbody>
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
  onUpdate,
  onRemove,
}: {
  item: OrderItem;
  onUpdate: (patch: { quantity?: number; unitPrice?: number | null }) => void;
  onRemove: () => void;
}) {
  const [qty, setQty] = useState(String(item.quantity));
  const [price, setPrice] = useState(item.unitPrice != null ? String(item.unitPrice) : "");

  useEffect(() => { setQty(String(item.quantity)); }, [item.quantity]);
  useEffect(() => { setPrice(item.unitPrice != null ? String(item.unitPrice) : ""); }, [item.unitPrice]);

  const remain = item.quantity - item.shippedQty;
  const subtotal = (item.unitPrice || 0) * item.quantity;

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
    try {
      const res = await fetch(`/api/customer-prices/effective?contactId=${contactId}&productId=${id}`);
      if (res.ok) {
        const d = await res.json();
        if (d?.price != null) {
          setUnitPrice(String(d.price));
          setPriceSource(d.source);
          return;
        }
      }
    } catch {
      // 取得失敗時は標準卸にフォールバック
    }
    const p = products.find((p) => p.id === id);
    setUnitPrice(p?.wholesalePrice != null ? String(p.wholesalePrice) : "");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 bg-white rounded border p-3">
      <div className="flex-1">
        <label className="text-xs text-gray-500">商品</label>
        <select
          value={productId}
          onChange={(e) => onProductChange(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
          required
        >
          <option value="">選択...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} - {p.name}
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
    </form>
  );
}
