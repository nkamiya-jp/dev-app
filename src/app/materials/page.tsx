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
  Search,
  Plus,
  Pencil,
  Layers,
  Trash2,
  Settings2,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";

interface Material {
  id: string;
  code: string | null;
  name: string;
  category: string;
  unitPrice: number;
  unitType: string;
  fabricWidth: number | null;
  fabricLength: number | null;
  active: boolean;
  note: string | null;
  _count: { productMaterials: number };
}

interface Category {
  id: string;
  name: string;
  color: string;
  unitType: string;
  sortOrder: number;
  active: boolean;
  parentId?: string | null; // 大分類(top)への紐付け
  kind?: string;            // "top" | "leaf"
}

// 大分類(top)の既定表示順。DBに未登録でも動作するためのフォールバック。
const TOP_ORDER = ["生地費", "資材費", "梱包資材費"];

const UNIT_TYPES = [
  { id: "meter", label: "m" },
  { id: "piece", label: "個" },
  { id: "set", label: "セット" },
];

const COLOR_PALETTE = [
  { id: "bg-purple-100 text-purple-700", label: "紫" },
  { id: "bg-blue-100 text-blue-700", label: "青" },
  { id: "bg-cyan-100 text-cyan-700", label: "シアン" },
  { id: "bg-emerald-100 text-emerald-700", label: "緑" },
  { id: "bg-amber-100 text-amber-700", label: "黄" },
  { id: "bg-orange-100 text-orange-700", label: "橙" },
  { id: "bg-rose-100 text-rose-700", label: "ピンク" },
  { id: "bg-gray-100 text-gray-700", label: "グレー" },
];

type SortKey = "code" | "name" | "price-asc" | "price-desc" | "usage";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "code", label: "コード順" },
  { id: "name", label: "名前順" },
  { id: "price-asc", label: "単価 安い順" },
  { id: "price-desc", label: "単価 高い順" },
  { id: "usage", label: "使用商品数 多い順" },
];

function sortMaterials(items: Material[], key: SortKey): Material[] {
  const sorted = [...items];
  switch (key) {
    case "code":
      sorted.sort((a, b) => (a.code || "zzz").localeCompare(b.code || "zzz"));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      break;
    case "price-asc":
      sorted.sort((a, b) => a.unitPrice - b.unitPrice);
      break;
    case "price-desc":
      sorted.sort((a, b) => b.unitPrice - a.unitPrice);
      break;
    case "usage":
      sorted.sort((a, b) => b._count.productMaterials - a._count.productMaterials);
      break;
  }
  return sorted;
}

export default function MaterialsPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      params.set("includeInactive", "1");
      const [matsRes, catsRes] = await Promise.all([
        fetch(`/api/materials?${params}`),
        fetch(`/api/material-categories`),
      ]);
      if (!matsRes.ok) {
        setError(`API ${matsRes.status}: ${(await matsRes.text()).slice(0, 200)}`);
        return;
      }
      const mats = await matsRes.json();
      const cats = await catsRes.json();
      setItems(Array.isArray(mats) ? mats : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (e) {
      setError(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
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

  function toggleCollapse(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // 表示対象: 非アクティブ非表示の場合フィルタ
  const visibleItems = showInactive ? items : items.filter((m) => m.active);

  // カテゴリ別グループ化（カテゴリ一覧の順番に従う）
  // 大分類(top)は資材を直接持たないので除外
  const grouped = categories
    .filter((c) => c.active && c.kind !== "top")
    .map((c) => ({
      category: c,
      items: sortMaterials(
        visibleItems.filter((m) => m.category === c.name),
        sortKey
      ),
    }))
    .filter((g) => g.items.length > 0);

  // カテゴリ未定義の資材（孤児）
  const knownCatNames = new Set(categories.map((c) => c.name));
  const orphans = visibleItems.filter((m) => !knownCatNames.has(m.category));
  if (orphans.length > 0) {
    grouped.push({
      category: {
        id: "_orphan",
        name: "未分類",
        color: "bg-red-100 text-red-700",
        unitType: "piece",
        sortOrder: 999,
        active: true,
      },
      items: sortMaterials(orphans, sortKey),
    });
  }

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
            title="カテゴリ絞り込み"
          >
            <option value="">全カテゴリ</option>
            {categories.filter((c) => c.active && c.kind !== "top").map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="border rounded-md px-3 py-2 text-sm"
            title="並び順"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive((v) => !v)}
            title={showInactive ? "非アクティブも表示中" : "非アクティブを非表示中"}
          >
            {showInactive ? <Eye className="size-4 mr-1" /> : <EyeOff className="size-4 mr-1" />}
            {showInactive ? "全件" : "アクティブのみ"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCategoryDialogOpen(true)}>
            <Settings2 className="size-4 mr-1" /> カテゴリ管理
          </Button>
          <CsvImportDialog
            title="資材マスタ"
            endpoint="/api/materials/import"
            onDone={load}
            columns={[
              { key: "code", label: "コード", example: "FAB-100" },
              { key: "name", label: "資材名", required: true, example: "西陣裂A" },
              { key: "category", label: "カテゴリ", example: "表地" },
              { key: "unitPrice", label: "単価", example: "1500" },
              { key: "unitType", label: "単位", example: "m" },
              { key: "fabricWidth", label: "生地巾", example: "72" },
              { key: "fabricLength", label: "尺", example: "30" },
            ]}
          />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4 mr-1" /> 資材を追加
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい資材</DialogTitle>
              </DialogHeader>
              <MaterialForm categories={categories} onSave={(data) => save(data)} />
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

      {grouped.length === 0 ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <Layers className="size-12 mx-auto mb-3 text-gray-300" />
            <p>資材が登録されていません</p>
            <p className="text-xs mt-1">右上の「資材を追加」から登録してください</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ category, items: groupItems }) => {
            const isCollapsed = collapsed.has(category.name);
            return (
              <div key={category.id}>
                <button
                  onClick={() => toggleCollapse(category.name)}
                  className="flex items-center gap-2 mb-2 hover:opacity-80"
                >
                  {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                  <Badge className={category.color}>{category.name}</Badge>
                  <span className="text-sm text-gray-500">{groupItems.length}件</span>
                </button>
                {!isCollapsed && (
                  <Card className="bg-white shadow-sm">
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-500 w-24">コード</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">資材名</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500 w-32">単価</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-500 w-20">単位</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">使用商品</th>
                            <th className="px-3 py-2 w-24"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {groupItems.map((m) => (
                            <tr key={m.id} className={`hover:bg-gray-50 ${!m.active ? "opacity-50" : ""}`}>
                              <td className="px-3 py-2 font-mono text-xs text-gray-500">{m.code || "-"}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium">{m.name}</div>
                                {m.note && <div className="text-xs text-gray-400">{m.note}</div>}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {m.unitPrice.toLocaleString()}
                                <span className="text-xs text-gray-500">円/{UNIT_TYPES.find((u) => u.id === m.unitType)?.label}</span>
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
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>資材を編集</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <MaterialForm
              categories={categories}
              material={editTarget}
              onSave={(data) => save(data, editTarget.id)}
            />
          )}
        </DialogContent>
      </Dialog>

      <CategoryManageDialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        categories={categories}
        onChange={load}
      />
    </div>
  );
}

// ─── 資材登録/編集フォーム ───
function MaterialForm({
  material,
  categories,
  onSave,
}: {
  material?: Material;
  categories: Category[];
  onSave: (d: Partial<Material>) => void;
}) {
  const activeCats = categories.filter((c) => c.active && c.kind !== "top");
  const [code, setCode] = useState(material?.code || "");
  const [name, setName] = useState(material?.name || "");
  const [category, setCategory] = useState(material?.category || activeCats[0]?.name || "その他");
  const [unitPrice, setUnitPrice] = useState(material?.unitPrice?.toString() || "");
  const [unitType, setUnitType] = useState(
    material?.unitType || activeCats.find((c) => c.name === (material?.category || activeCats[0]?.name))?.unitType || "piece"
  );
  const [fabricWidth, setFabricWidth] = useState(material?.fabricWidth?.toString() || "");
  const [fabricLength, setFabricLength] = useState(material?.fabricLength?.toString() || "");
  const [active, setActive] = useState(material?.active ?? true);
  const [note, setNote] = useState(material?.note || "");
  // 生地費カテゴリ（生地費 / 表地 / 裏地 / 芯材）は生地扱い＝巾・尺を設定できる
  const FABRIC_CATS = new Set(["生地費", "生地", "fabric", "表地", "裏地", "芯材"]);
  const isFabric = FABRIC_CATS.has(category);

  function handleCategoryChange(newCat: string) {
    setCategory(newCat);
    // カテゴリ変更で、空の場合はデフォルト単位をセット
    if (!material) {
      const cat = activeCats.find((c) => c.name === newCat);
      if (cat) setUnitType(cat.unitType);
    }
  }

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
          fabricWidth: isFabric && fabricWidth ? Number(fabricWidth) : null,
          fabricLength: isFabric && fabricLength ? Number(fabricLength) : null,
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
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            {activeCats.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
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
      {isFabric && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">生地巾（cm）</label>
            <Input
              type="number"
              value={fabricWidth}
              onChange={(e) => setFabricWidth(e.target.value)}
              placeholder="例: 72"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">尺（1反の長さ）</label>
            <Input
              type="number"
              step="0.1"
              value={fabricLength}
              onChange={(e) => setFabricLength(e.target.value)}
              placeholder="例: 30"
            />
          </div>
          <p className="col-span-2 text-xs text-gray-400">
            ※ 生地自体の仕様サイズ。巾×尺で1反の大きさを記録します
          </p>
        </div>
      )}
      <p className="text-xs text-gray-400 -mt-1">
        ※ 取れ数（1単位から何個取れるか）は商品ごとに異なるため、商品詳細画面で個別に設定します
      </p>
      <div>
        <label className="text-xs text-gray-500">備考</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full border rounded-md px-3 py-2 text-sm resize-y"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        有効
      </label>
      <Button type="submit" className="w-full">保存</Button>
    </form>
  );
}

// ─── カテゴリ管理ダイアログ ───
function CategoryManageDialog({
  open,
  onClose,
  categories,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onChange: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_PALETTE[0].id);
  const [newUnitType, setNewUnitType] = useState("piece");

  // 大分類(top)一覧と、並べ替え/編集対象の leaf 一覧に分ける
  const topCats = categories
    .filter((c) => c.kind === "top")
    .sort((a, b) => TOP_ORDER.indexOf(a.name) - TOP_ORDER.indexOf(b.name));
  const leafCats = categories.filter((c) => c.kind !== "top");
  const [newParentId, setNewParentId] = useState("");

  async function add() {
    if (!newName.trim()) return;
    await fetch("/api/material-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        color: newColor,
        unitType: newUnitType,
        kind: "leaf",
        parentId: newParentId || topCats[0]?.id || null,
      }),
    });
    setNewName("");
    onChange();
  }

  async function update(c: Category, data: Partial<Category>) {
    await fetch("/api/material-categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, oldName: c.name, ...data }),
    });
    onChange();
  }

  async function remove(c: Category) {
    if (!confirm(`カテゴリ「${c.name}」を削除します。\n紐付く資材は「その他」へ移動します。`)) return;
    await fetch("/api/material-categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    });
    onChange();
  }

  // 並べ替え後の配列順に沿って sortOrder を連番で振り直す。
  // 「その他」(sortOrder 99) は末尾固定なので触らない。
  // 値の交換方式だと sortOrder が重複しているカテゴリ同士で
  // 入れ替えが効かないため、連番振り直し方式にしている。
  async function persistOrder(list: Category[]) {
    let seq = 1;
    const updates: Promise<unknown>[] = [];
    for (const c of list) {
      const target = c.sortOrder === 99 ? 99 : seq++;
      if (c.sortOrder !== target) {
        updates.push(
          fetch("/api/material-categories", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: c.id, oldName: c.name, sortOrder: target }),
          })
        );
      }
    }
    await Promise.all(updates);
    onChange();
  }

  async function moveUp(c: Category, idx: number) {
    if (idx === 0 || c.sortOrder === 99) return;
    const list = [...leafCats];
    [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    await persistOrder(list);
  }

  async function moveDown(c: Category, idx: number) {
    const next = leafCats[idx + 1];
    // 末尾、または直後が「その他」(99固定) の場合は移動不可
    if (!next || c.sortOrder === 99 || next.sortOrder === 99) return;
    const list = [...leafCats];
    [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    await persistOrder(list);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>カテゴリ管理</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="border rounded-md divide-y">
            {leafCats.map((c, idx) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex flex-col">
                  <button
                    onClick={() => moveUp(c, idx)}
                    disabled={idx === 0 || c.sortOrder === 99}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-0.5"
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    onClick={() => moveDown(c, idx)}
                    disabled={
                      idx === leafCats.length - 1 ||
                      c.sortOrder === 99 ||
                      leafCats[idx + 1]?.sortOrder === 99
                    }
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-0.5"
                  >
                    <ArrowDown className="size-3" />
                  </button>
                </div>
                {editingId === c.id ? (
                  <CategoryEditRow
                    category={c}
                    topCats={topCats}
                    onSave={(data) => {
                      update(c, data);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <Badge className={c.color}>{c.name}</Badge>
                    <span className="text-xs text-gray-500">
                      大分類: {topCats.find((t) => t.id === c.parentId)?.name ?? "未設定"}
                    </span>
                    <span className="text-xs text-gray-400">
                      単位: {UNIT_TYPES.find((u) => u.id === c.unitType)?.label}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <button
                        onClick={() => setEditingId(c.id)}
                        className="text-gray-400 hover:text-gray-700 p-1"
                        title="編集"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => remove(c)}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="削除"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2">新しいカテゴリを追加</p>
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                placeholder="カテゴリ名"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 min-w-[140px]"
              />
              <select
                value={newParentId || topCats[0]?.id || ""}
                onChange={(e) => setNewParentId(e.target.value)}
                className="border rounded-md px-2 py-2 text-sm"
                title="大分類"
              >
                {topCats.map((t) => (
                  <option key={t.id} value={t.id}>大分類:{t.name}</option>
                ))}
              </select>
              <select
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="border rounded-md px-2 py-2 text-sm"
              >
                {COLOR_PALETTE.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <select
                value={newUnitType}
                onChange={(e) => setNewUnitType(e.target.value)}
                className="border rounded-md px-2 py-2 text-sm"
              >
                {UNIT_TYPES.map((u) => (
                  <option key={u.id} value={u.id}>単位:{u.label}</option>
                ))}
              </select>
              <Button onClick={add} size="sm">
                <Plus className="size-4 mr-1" /> 追加
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryEditRow({
  category,
  onSave,
  onCancel,
  topCats,
}: {
  category: Category;
  onSave: (d: Partial<Category>) => void;
  onCancel: () => void;
  topCats: Category[];
}) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [unitType, setUnitType] = useState(category.unitType);
  const [parentId, setParentId] = useState(category.parentId || topCats[0]?.id || "");

  return (
    <div className="flex-1 flex gap-2 items-center flex-wrap">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[100px]" />
      <select
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        className="border rounded-md px-2 py-1.5 text-sm"
        title="大分類"
      >
        {topCats.map((t) => (
          <option key={t.id} value={t.id}>大分類:{t.name}</option>
        ))}
      </select>
      <select
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="border rounded-md px-2 py-1.5 text-sm"
      >
        {COLOR_PALETTE.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>
      <select
        value={unitType}
        onChange={(e) => setUnitType(e.target.value)}
        className="border rounded-md px-2 py-1.5 text-sm"
      >
        {UNIT_TYPES.map((u) => (
          <option key={u.id} value={u.id}>{u.label}</option>
        ))}
      </select>
      <Button size="sm" onClick={() => onSave({ name, color, unitType, parentId: parentId || null })}>保存</Button>
      <Button size="sm" variant="outline" onClick={onCancel}>取消</Button>
    </div>
  );
}
