"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, Archive, Download, Printer, ChevronUp, ChevronDown, LayoutGrid, User, X } from "lucide-react";
import { getContactTypeMeta, getContactTypeLabel, getContactTypeColor } from "@/lib/contact-meta";

interface MatrixRow {
  typeId: string;
  typeLabel: string;
  ratePct: number;
  kind: string;
  color: string;
}

interface PriceCell {
  ratePct: number;
  price: number;
  profit: number;
  profitRate: number;
  costRatio: number;
}

interface PriceItem {
  productId: string;
  code: string | null;
  name: string;
  series: string | null;
  size: string | null;
  sortOrder: number;
  cost: number;
  retailPrice: number;
  wholesalePrice: number | null;
  costRatioVsRetail: number;
  prices: Record<string, PriceCell>;
}

interface PriceListResponse {
  matrixRows: MatrixRow[];
  items: PriceItem[];
  generatedAt: string;
}

interface Snapshot {
  id: string;
  name: string;
  note: string | null;
  kind?: string;              // "matrix" | "customer"
  contactId?: string | null;
  contactName?: string | null;
  contactRate?: number | null;
  snappedAt: string;
  _count: { items: number };
}

interface Contact {
  id: string;
  name: string;
  company: string | null;
  type: string | null;
  discountRate: number | null;
}

type Mode = "matrix" | "customer";

export default function PriceListPage() {
  const [data, setData] = useState<PriceListResponse | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [mode, setMode] = useState<Mode>("matrix");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  // 顧客の取扱商品＋個別価格（productId → { price:自動ならnull, note }）
  const [custPrices, setCustPrices] = useState<Record<string, { price: number | null; note: string | null }>>({});

  const load = useCallback(async () => {
    const [pl, s, c] = await Promise.all([
      fetch("/api/price-list").then((r) => r.json()),
      fetch("/api/price-list/snapshots").then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
    ]);
    setData(pl);
    setSnaps(Array.isArray(s) ? s : []);
    setContacts(Array.isArray(c) ? c : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 顧客選択時に取扱商品を読み込み
  useEffect(() => {
    if (mode !== "customer" || !selectedContactId) {
      setCustPrices({});
      return;
    }
    let cancelled = false;
    fetch(`/api/customer-prices?contactId=${selectedContactId}`)
      .then((r) => r.json())
      .then((rows) => {
        if (cancelled) return;
        const m: Record<string, { price: number | null; note: string | null }> = {};
        if (Array.isArray(rows)) {
          rows.forEach((x: { productId: string; price: number | null; note: string | null }) => {
            m[x.productId] = { price: x.price ?? null, note: x.note ?? null };
          });
        }
        setCustPrices(m);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selectedContactId]);

  // 取扱商品を追加
  async function addHandledProduct(productId: string) {
    if (!selectedContactId) return;
    setCustPrices((p) => ({ ...p, [productId]: { price: null, note: null } }));
    await fetch("/api/customer-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: selectedContactId, productId }),
    });
  }

  // 個別価格を設定（null=自動に戻す）
  async function setHandledPrice(productId: string, price: number | null) {
    if (!selectedContactId) return;
    setCustPrices((p) => ({ ...p, [productId]: { price, note: p[productId]?.note ?? null } }));
    await fetch("/api/customer-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: selectedContactId, productId, price }),
    });
  }

  // 個別価格のメモ（理由）を設定
  async function setHandledNote(productId: string, note: string | null) {
    if (!selectedContactId) return;
    setCustPrices((p) => ({ ...p, [productId]: { price: p[productId]?.price ?? null, note } }));
    await fetch("/api/customer-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: selectedContactId, productId, note }),
    });
  }

  // 取扱商品から削除
  async function removeHandledProduct(productId: string) {
    if (!selectedContactId) return;
    setCustPrices((p) => {
      const n = { ...p };
      delete n[productId];
      return n;
    });
    await fetch(`/api/customer-prices?contactId=${selectedContactId}&productId=${productId}`, {
      method: "DELETE",
    });
  }

  async function saveSnapshot() {
    if (!saveName.trim()) {
      alert("名前を入力してください");
      return;
    }
    // 顧客別モードで顧客選択中なら、その顧客のアーカイブとして保存
    const asCustomer = mode === "customer" && !!selectedContactId;
    const body = asCustomer
      ? { name: saveName.trim(), note: saveNote || null, kind: "customer", contactId: selectedContactId }
      : { name: saveName.trim(), note: saveNote || null, kind: "matrix" };
    setSaving(true);
    try {
      const res = await fetch("/api/price-list/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveOpen(false);
        setSaveName("");
        setSaveNote("");
        load();
      } else {
        const e = await res.json().catch(() => ({}));
        alert(e.error || "保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  }

  // id を targetId（画面上の隣の商品）の位置へ移動して商品マスタ順を入れ替える。
  // 絞り込み中でも「表示上の隣」と入れ替わるよう、direction ではなく targetId を渡す。
  async function reorderTo(id: string, targetId: string) {
    if (reordering) return;
    setReordering(true);
    try {
      await fetch("/api/products/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, targetId }),
      });
      await load();
    } finally {
      setReordering(false);
    }
  }

  if (!data) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const seriesOptions = Array.from(new Set(data.items.map((i) => i.series).filter((s): s is string => !!s))).sort();
  const visibleItems = seriesFilter
    ? data.items.filter((i) => i.series === seriesFilter)
    : data.items;

  const visibleRows = selectedTypes.size === 0
    ? data.matrixRows
    : data.matrixRows.filter((r) => selectedTypes.has(`${r.typeId}_${r.ratePct}`));

  function toggleType(key: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 選択中顧客とその掛率
  const selectedContact = contacts.find((c) => c.id === selectedContactId) || null;
  const contactRate = selectedContact
    ? (selectedContact.discountRate ?? getContactTypeMeta(selectedContact.type)?.defaultRate ?? null)
    : null;

  // CSV エクスポート（モードで内容が変わる）
  function exportCSV() {
    let header: string[];
    let rows: string[][];
    if (mode === "customer" && selectedContact && contactRate != null) {
      header = ["コード", "商品名", "原価", "上代", "卸価格", "個別/自動", "原価率(卸)", "原価率(上代)"];
      rows = visibleItems
        .filter((it) => it.productId in custPrices)
        .map((it) => {
          const auto = Math.round(it.retailPrice * contactRate / 100);
          const override = custPrices[it.productId]?.price ?? null;
          const wholesale = override ?? auto;
          const crWholesale = wholesale > 0 ? (it.cost / wholesale) * 100 : 0;
          return [
            it.code || "",
            it.name,
            String(it.cost),
            String(it.retailPrice),
            String(wholesale),
            override != null ? "個別" : "自動",
            `${crWholesale.toFixed(1)}%`,
            `${it.costRatioVsRetail.toFixed(1)}%`,
          ];
        });
    } else {
      header = ["コード", "商品名", "シリーズ", "原価", "上代", "原価率(上代)", ...visibleRows.map((r) => `${r.typeLabel} ${r.ratePct}%`)];
      rows = visibleItems.map((it) => [
        it.code || "",
        it.name,
        it.series || "",
        String(it.cost),
        String(it.retailPrice),
        `${it.costRatioVsRetail.toFixed(1)}%`,
        ...visibleRows.map((r) => String(it.prices[`${r.typeId}_${r.ratePct}`]?.price ?? 0)),
      ]);
    }
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    const suffix = mode === "customer" && selectedContact ? `_${selectedContact.name}` : "";
    a.download = `価格表${suffix}_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold">価格表</h2>
          <p className="text-xs text-gray-500 mt-1">
            {mode === "matrix" ? "商品 × 顧客タイプ別の販売価格マトリクス" : "顧客別の価格・原価率（営業調整用）"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* モード切替 */}
          <div className="inline-flex rounded-md border overflow-hidden">
            <button
              onClick={() => setMode("matrix")}
              className={`px-3 py-2 text-sm flex items-center gap-1 ${mode === "matrix" ? "bg-primary text-primary-foreground" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <LayoutGrid className="size-4" /> タイプ別
            </button>
            <button
              onClick={() => setMode("customer")}
              className={`px-3 py-2 text-sm flex items-center gap-1 ${mode === "customer" ? "bg-primary text-primary-foreground" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <User className="size-4" /> 顧客別
            </button>
          </div>
          <select
            value={seriesFilter}
            onChange={(e) => setSeriesFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">全シリーズ</option>
            {seriesOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="size-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4 mr-1" /> 印刷
          </Button>
          <Button size="sm" onClick={() => {
            const today = new Date().toLocaleDateString("ja-JP");
            const asCustomer = mode === "customer" && !!selectedContact;
            setSaveName(asCustomer ? `${selectedContact!.name} 価格表 ${today}` : `価格表 ${today}`);
            setSaveOpen(true);
          }}>
            <Camera className="size-4 mr-1" />
            {mode === "customer" && selectedContact ? "この顧客の価格を保存" : "現在の価格を保存"}
          </Button>
        </div>
      </div>

      {mode === "matrix" ? (
        <>
          {/* 顧客タイプ絞り込み */}
          <div className="bg-white border rounded-md p-3 print:hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">表示する顧客タイプ:</span>
              {data.matrixRows.map((r) => {
                const key = `${r.typeId}_${r.ratePct}`;
                const active = selectedTypes.size === 0 || selectedTypes.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleType(key)}
                    className={`text-xs px-2 py-1 rounded ${active ? r.color : "bg-gray-50 text-gray-400 line-through"}`}
                  >
                    {r.typeLabel} {r.ratePct}%
                  </button>
                );
              })}
              {selectedTypes.size > 0 && (
                <button onClick={() => setSelectedTypes(new Set())} className="text-xs text-blue-600 hover:underline">
                  全タイプ表示
                </button>
              )}
            </div>
          </div>

          {/* 価格マトリクス */}
          <Card className="bg-white shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="px-1 py-2 w-8 print:hidden"></th>
                    <th className="text-left px-2 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[160px]">商品</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 w-16">原価</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 w-16 bg-amber-50">上代</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500 w-16">原価率</th>
                    {visibleRows.map((r) => (
                      <th key={`${r.typeId}_${r.ratePct}`} className="text-right px-2 py-2 font-medium text-gray-500 min-w-[80px]">
                        <div className={`inline-block px-1 rounded ${r.color}`}>{r.typeLabel}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{r.ratePct}%</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={visibleRows.length + 5} className="text-center text-gray-400 py-8">
                        商品がありません
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((it, idx) => (
                      <tr key={it.productId} className="hover:bg-gray-50">
                        <td className="px-1 py-1 print:hidden">
                          <div className="flex flex-col">
                            <button
                              onClick={() => reorderTo(it.productId, visibleItems[idx - 1].productId)}
                              disabled={idx === 0 || reordering}
                              className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
                              title="上へ"
                            >
                              <ChevronUp className="size-3.5" />
                            </button>
                            <button
                              onClick={() => reorderTo(it.productId, visibleItems[idx + 1].productId)}
                              disabled={idx === visibleItems.length - 1 || reordering}
                              className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
                              title="下へ"
                            >
                              <ChevronDown className="size-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                          <Link href={`/products/${it.productId}`} className="text-blue-600 hover:underline font-medium">
                            {it.name}
                          </Link>
                          <div className="text-[10px] font-mono text-gray-400">{it.code || "-"}</div>
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-600">{it.cost.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right font-medium bg-amber-50/30">{it.retailPrice.toLocaleString() || "-"}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">
                          {it.retailPrice > 0 ? `${it.costRatioVsRetail.toFixed(0)}%` : "-"}
                        </td>
                        {visibleRows.map((r) => {
                          const cell = it.prices[`${r.typeId}_${r.ratePct}`];
                          const price = cell?.price ?? 0;
                          const profit = cell?.profit ?? 0;
                          return (
                            <td key={`${r.typeId}_${r.ratePct}`} className="px-2 py-1.5 text-right">
                              <div className="font-medium">{price > 0 ? price.toLocaleString() : "-"}</div>
                              {price > 0 && (
                                <div className={`text-[10px] ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                                  {profit >= 0 ? "+" : ""}{profit.toLocaleString()}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : (
        <CustomerPriceTable
          contacts={contacts}
          selectedContactId={selectedContactId}
          setSelectedContactId={setSelectedContactId}
          selectedContact={selectedContact}
          contactRate={contactRate}
          items={visibleItems}
          allItems={data.items}
          custPrices={custPrices}
          onAddProduct={addHandledProduct}
          onSetPrice={setHandledPrice}
          onSetNote={setHandledNote}
          onRemoveProduct={removeHandledProduct}
          onReorderTo={reorderTo}
          reordering={reordering}
        />
      )}

      <p className="text-xs text-gray-400 print:hidden">
        全 {visibleItems.length} 商品 / 生成: {new Date(data.generatedAt).toLocaleString("ja-JP")}
      </p>

      {/* スナップショット一覧 */}
      <Card className="bg-white shadow-sm print:hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Archive className="size-5" />
            アーカイブ（過去の価格表）
          </CardTitle>
          <span className="text-sm text-gray-500">{snaps.length}件</span>
        </CardHeader>
        <CardContent className="p-0">
          {snaps.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              アーカイブはまだありません
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">名前</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 w-32">対象</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">メモ</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-20">商品数</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-40">保存日時</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {snaps.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2">
                      {s.kind === "customer" ? (
                        <Badge className="bg-blue-100 text-blue-700 inline-flex items-center gap-1">
                          <User className="size-3" />{s.contactName || "顧客"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">全体</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{s.note || "-"}</td>
                    <td className="px-3 py-2 text-right">{s._count.items}</td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">
                      {new Date(s.snappedAt).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/price-list/snapshots/${s.id}`} className="text-blue-600 hover:underline text-xs">
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* 保存ダイアログ */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>現在の価格を保存</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">名前 *</label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="例: 2026年5月価格改定"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">メモ（理由など）</label>
              <textarea
                value={saveNote}
                onChange={(e) => setSaveNote(e.target.value)}
                placeholder="例: 生地価格高騰のため改定"
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm resize-y"
              />
            </div>
            <p className="text-xs text-gray-400">
              {mode === "customer" && selectedContact
                ? `「${selectedContact.name}」の取扱商品の卸価格・原価・メモをこの時点で保存します（掛率 ${contactRate ?? "未設定"}%）。`
                : `現在の全${data.items.length}商品の上代・原価・各顧客タイプ別の卸価格を保存します。`}
            </p>
            <Button onClick={saveSnapshot} disabled={saving} className="w-full">
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 顧客別価格表 ───
function CustomerPriceTable({
  contacts,
  selectedContactId,
  setSelectedContactId,
  selectedContact,
  contactRate,
  items,
  allItems,
  custPrices,
  onAddProduct,
  onSetPrice,
  onSetNote,
  onRemoveProduct,
  onReorderTo,
  reordering,
}: {
  contacts: Contact[];
  selectedContactId: string;
  setSelectedContactId: (id: string) => void;
  selectedContact: Contact | null;
  contactRate: number | null;
  items: PriceItem[];
  allItems: PriceItem[];
  custPrices: Record<string, { price: number | null; note: string | null }>;
  onAddProduct: (productId: string) => void;
  onSetPrice: (productId: string, price: number | null) => void;
  onSetNote: (productId: string, note: string | null) => void;
  onRemoveProduct: (productId: string) => void;
  onReorderTo: (id: string, targetId: string) => void;
  reordering: boolean;
}) {
  // 取扱商品のみ表示（シリーズ絞り込み後の items から）
  const handled = items.filter((it) => it.productId in custPrices);
  // 追加候補 = まだ取扱いに入っていない全商品
  const addable = allItems.filter((it) => !(it.productId in custPrices));

  return (
    <>
      <div className="bg-white border rounded-md p-3 print:hidden flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-600">顧客を選択:</span>
        <select
          value={selectedContactId}
          onChange={(e) => setSelectedContactId(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm min-w-[240px]"
        >
          <option value="">-- 顧客を選んでください --</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.company ? `（${c.company}）` : ""} {c.type ? `[${getContactTypeLabel(c.type)}]` : ""}
            </option>
          ))}
        </select>
        {selectedContact && (
          <div className="flex items-center gap-2 text-sm">
            {selectedContact.type && (
              <Badge className={getContactTypeColor(selectedContact.type)}>
                {getContactTypeLabel(selectedContact.type)}
              </Badge>
            )}
            <span className="text-gray-600">
              掛率 <strong>{contactRate != null ? `${contactRate}%` : "未設定"}</strong>
              {selectedContact.discountRate != null && (
                <span className="text-[10px] text-blue-500 ml-1">（個別設定）</span>
              )}
            </span>
          </div>
        )}
      </div>

      {!selectedContact ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <User className="size-10 mx-auto mb-3 text-gray-300" />
            <p>顧客を選択すると、取扱商品の価格表が表示されます</p>
          </CardContent>
        </Card>
      ) : contactRate == null ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <p>この顧客は掛率が未設定です</p>
            <Link href={`/contacts`} className="text-blue-600 hover:underline text-xs mt-1 inline-block">
              顧客編集で掛率を設定 →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-white shadow-sm">
          {/* 印刷用ヘッダ */}
          <div className="hidden print:block px-4 pt-4">
            <h1 className="text-lg font-bold">
              {selectedContact.name} 御中 価格表
            </h1>
            <p className="text-xs text-gray-500">{new Date().toLocaleDateString("ja-JP")} 時点</p>
          </div>

          {/* 取扱商品を追加 */}
          <div className="px-3 py-2 border-b bg-gray-50/60 print:hidden flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">取扱商品を追加:</span>
            <select
              value=""
              onChange={(e) => { if (e.target.value) onAddProduct(e.target.value); }}
              className="border rounded-md px-2 py-1.5 text-sm min-w-[220px] bg-white"
            >
              <option value="">＋ 商品を選んで追加...</option>
              {addable.map((it) => (
                <option key={it.productId} value={it.productId}>
                  {it.name}{it.code ? `（${it.code}）` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">取扱 {handled.length} 商品</span>
          </div>

          {handled.length === 0 ? (
            <CardContent className="py-12 text-center text-gray-400">
              <p>取扱商品がありません</p>
              <p className="text-xs mt-1">上の「＋ 商品を選んで追加」から登録してください</p>
            </CardContent>
          ) : (
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-1 py-2 w-8 print:hidden"></th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 min-w-[200px]">商品</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">原価</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24 bg-amber-50">上代</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-700 w-32 bg-green-50">卸価格</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">粗利</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">原価率(卸)</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">原価率(上代)</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 min-w-[140px] print:hidden">メモ（理由）</th>
                  <th className="px-2 py-2 w-8 print:hidden"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {handled.map((it, idx) => {
                  const auto = it.retailPrice > 0 ? Math.round(it.retailPrice * contactRate / 100) : 0;
                  const override = custPrices[it.productId]?.price ?? null;
                  const wholesale = override ?? auto;
                  const profit = wholesale - it.cost;
                  const crWholesale = wholesale > 0 ? (it.cost / wholesale) * 100 : 0;
                  return (
                    <tr key={it.productId} className="hover:bg-gray-50">
                      <td className="px-1 py-1 print:hidden">
                        <div className="flex flex-col">
                          <button
                            onClick={() => onReorderTo(it.productId, handled[idx - 1].productId)}
                            disabled={idx === 0 || reordering}
                            className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
                            title="上へ"
                          >
                            <ChevronUp className="size-3.5" />
                          </button>
                          <button
                            onClick={() => onReorderTo(it.productId, handled[idx + 1].productId)}
                            disabled={idx === handled.length - 1 || reordering}
                            className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
                            title="下へ"
                          >
                            <ChevronDown className="size-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/products/${it.productId}`} className="text-blue-600 hover:underline font-medium">
                          {it.name}
                        </Link>
                        <div className="text-[10px] font-mono text-gray-400">{it.code || "-"}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{it.cost.toLocaleString()}円</td>
                      <td className="px-3 py-2 text-right bg-amber-50/30">{it.retailPrice > 0 ? `${it.retailPrice.toLocaleString()}円` : "-"}</td>
                      <td className="px-3 py-2 text-right bg-green-50/40">
                        {/* 印刷時は確定値をテキスト表示 */}
                        <div className="hidden print:block font-bold">{wholesale > 0 ? `${wholesale.toLocaleString()}円` : "-"}</div>
                        {/* 編集用 */}
                        <div className="print:hidden flex items-center justify-end gap-1">
                          <input
                            key={`${it.productId}_${override ?? ""}`}
                            type="text"
                            inputMode="numeric"
                            defaultValue={override ?? ""}
                            placeholder={auto > 0 ? auto.toLocaleString() : "0"}
                            onBlur={(e) => {
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              const val = raw === "" ? null : parseInt(raw, 10);
                              if (val === override) return;
                              onSetPrice(it.productId, val);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="w-20 text-right border rounded px-1 py-0.5 font-bold text-gray-900"
                          />
                          <span className="text-gray-400">円</span>
                        </div>
                        <div className="print:hidden text-[10px] text-right mt-0.5">
                          {override != null ? (
                            <button
                              onClick={() => onSetPrice(it.productId, null)}
                              className="text-blue-600 hover:underline"
                              title="自動計算に戻す"
                            >
                              個別 · 自動に戻す
                            </button>
                          ) : (
                            <span className="text-gray-400">自動（上代×{contactRate}%）</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {wholesale > 0 ? `${profit >= 0 ? "+" : ""}${profit.toLocaleString()}円` : "-"}
                      </td>
                      <td className={`px-3 py-2 text-right ${crWholesale > 80 ? "text-red-500 font-medium" : "text-gray-500"}`}>
                        {wholesale > 0 ? `${crWholesale.toFixed(0)}%` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {it.retailPrice > 0 ? `${it.costRatioVsRetail.toFixed(0)}%` : "-"}
                      </td>
                      <td className="px-3 py-2 print:hidden">
                        <input
                          key={`note_${it.productId}_${custPrices[it.productId]?.note ?? ""}`}
                          type="text"
                          defaultValue={custPrices[it.productId]?.note ?? ""}
                          placeholder="例: 長年の取引先価格"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            const cur = custPrices[it.productId]?.note ?? "";
                            if (v === cur) return;
                            onSetNote(it.productId, v === "" ? null : v);
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className="w-full border rounded px-1.5 py-0.5 text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 text-center print:hidden">
                        <button
                          onClick={() => onRemoveProduct(it.productId)}
                          className="text-gray-300 hover:text-red-500"
                          title="取扱商品から削除"
                        >
                          <X className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
          )}
        </Card>
      )}
    </>
  );
}
