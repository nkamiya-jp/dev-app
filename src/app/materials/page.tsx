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
import { Search, Plus, Pencil, Layers, Trash2 } from "lucide-react";

interface Material {
  id: string;
  code: string | null;
  name: string;
  category: string;
  unitPrice: number;
  unitType: string;
  active: boolean;
  note: string | null;
  _count: { productMaterials: number };
}

const CATEGORIES = [
  { id: "fabric", label: "生地", color: "bg-purple-100 text-purple-700" },
  { id: "other", label: "その他資材", color: "bg-orange-100 text-orange-700" },
];

const UNIT_TYPES = [
  { id: "meter", label: "m" },
  { id: "piece", label: "個" },
  { id: "set", label: "セット" },
];

function getCategoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
function getCategoryColor(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.color ?? "bg-gray-100 text-gray-700";
}

export default function MaterialsPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryFilter) params.set("category", categoryFilter);
    params.set("includeInactive", "1");
    try {
      const res = await fetch(`/api/materials?${params}`);
      if (!res.ok) {
        const text = await res.text();
        setError(`API ${res.status}: ${text.slice(0, 200)}`);
        setItems([]);
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        setError(`想定外のレスポンス: ${JSON.stringify(data).slice(0, 200)}`);
        setItems([]);
        return;
      }
      setItems(data);
    } catch (e) {
      setError(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
      setItems([]);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(data: Partial<Material>, id?: string) {
    if (id) {
      await fetch("/api/materials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
    } else {
      await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setCreateOpen(false);
    setEditTarget(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("この資材を非アクティブ化しますか？")) return;
    await fetch("/api/materials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  // カテゴリ別グループ
  const grouped = CATEGORIES.map((c) => ({
    category: c,
    items: items.filter((m) => m.category === c.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">資材マスタ</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="資材名・コードで検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">全カテゴリ</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4 mr-1" /> 資材を追加
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい資材</DialogTitle>
              </DialogHeader>
              <MaterialForm onSave={(data) => save(data)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-200 shadow-sm">
          <CardContent className="py-4 text-sm text-red-700">
            <p className="font-medium mb-1">読み込みに失敗しました</p>
            <p className="text-xs font-mono">{error}</p>
          </CardContent>
        </Card>
      )}
      {items.length === 0 ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <Layers className="size-12 mx-auto mb-3 text-gray-300" />
            <p>資材が登録されていません</p>
            <p className="text-xs mt-1">右上の「資材を追加」から登録してください</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, items }) => (
            <div key={category.id}>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={category.color}>{category.label}</Badge>
                <span className="text-sm text-gray-500">{items.length}件</span>
              </div>
              <Card className="bg-white shadow-sm">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-500 w-24">コード</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">資材名</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">単価</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-500 w-20">単位</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">使用商品</th>
                        <th className="px-3 py-2 w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((m) => (
                        <tr key={m.id} className={`hover:bg-gray-50 ${!m.active ? "opacity-50" : ""}`}>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{m.code || "-"}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{m.name}</div>
                            {m.note && <div className="text-xs text-gray-400">{m.note}</div>}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {m.unitPrice.toLocaleString()}<span className="text-xs text-gray-500">円/{UNIT_TYPES.find((u) => u.id === m.unitType)?.label}</span>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">
                            {UNIT_TYPES.find((u) => u.id === m.unitType)?.label}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {m._count.productMaterials > 0 ? (
                              <Badge variant="secondary">{m._count.productMaterials}</Badge>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => setEditTarget(m)}
                                className="text-gray-400 hover:text-gray-700 p-1"
                                title="編集"
                              >
                                <Pencil className="size-4" />
                              </button>
                              {m.active && (
                                <button
                                  onClick={() => remove(m.id)}
                                  className="text-red-400 hover:text-red-600 p-1"
                                  title="非アクティブ化"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>資材を編集</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <MaterialForm material={editTarget} onSave={(data) => save(data, editTarget.id)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MaterialForm({
  material,
  onSave,
}: {
  material?: Material;
  onSave: (d: Partial<Material>) => void;
}) {
  const [code, setCode] = useState(material?.code || "");
  const [name, setName] = useState(material?.name || "");
  const [category, setCategory] = useState(material?.category || "fabric");
  const [unitPrice, setUnitPrice] = useState(material?.unitPrice?.toString() || "");
  const [unitType, setUnitType] = useState(material?.unitType || "meter");
  const [active, setActive] = useState(material?.active ?? true);
  const [note, setNote] = useState(material?.note || "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          code: code || null,
          name,
          category,
          unitPrice: unitPrice ? Number(unitPrice) : 0,
          unitType,
          active,
          note: note || null,
        });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">コード（任意）</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例: FAB-001" />
        </div>
        <div>
          <label className="text-xs text-gray-500">カテゴリ *</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">資材名 *</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="例: 西陣裂A" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">単価（円）*</label>
          <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-gray-500">単位 *</label>
          <select value={unitType} onChange={(e) => setUnitType(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
            {UNIT_TYPES.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-gray-400 -mt-1">
        ※ 取れ数（1単位から何個取れるか）は商品ごとに大きく変わるため、商品詳細画面で個別に設定します
      </p>
      <div>
        <label className="text-xs text-gray-500">備考</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        有効
      </label>
      <Button type="submit" className="w-full">保存</Button>
    </form>
  );
}

// Re-export so other modules can also use category helpers if needed
export { getCategoryLabel, getCategoryColor };
