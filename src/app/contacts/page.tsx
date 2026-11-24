"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContactFormDialog } from "@/components/contact-form-dialog";
import { SansanImportDialog } from "@/components/sansan-import-dialog";
import { CONTACT_TYPES, getContactTypeLabel, getContactTypeColor } from "@/lib/contact-meta";
import { ContactEditButton } from "./[id]/contact-edit";

interface Contact {
  id: string;
  name: string;
  company: string | null;
  department: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  type: string | null;
  discountRate: number | null;
  closingDay: number | null;
  paymentMonthOffset: number | null;
  paymentDay: number | null;
  dailyOrder?: boolean;
  orderAliases?: string | null;
  createdAt: string;
  _count: { deals: number; tasks: number };
}

// 並べ替えできる列。常にタイプ順が先で、その中をこの列で並べる。
// 既定（sortKey なし）はタイプ内を更新が新しい順（APIの並び）
type SortKey = "company" | "name" | "discountRate" | "deals" | "tasks";
const TYPE_RANK = new Map<string, number>(CONTACT_TYPES.map((t, i) => [t.id, i]));

// タイプの並び順（設定順）。未設定は最後
function typeRank(c: Contact): number {
  return c.type ? TYPE_RANK.get(c.type) ?? CONTACT_TYPES.length : CONTACT_TYPES.length + 1;
}

function sortValue(c: Contact, key: SortKey): string | number | null {
  switch (key) {
    // 「（株）」「株式会社」などは飛ばして、社名そのもので並べる
    case "company": return (c.company || c.name || "").replace(/[（(]\s*[株有]\s*[）)]|株式会社|有限会社|合同会社/g, "").trim() || null;
    case "name": return c.company ? c.name || null : null;
    case "discountRate": return c.discountRate;
    case "deals": return c._count.deals;
    case "tasks": return c._count.tasks;
  }
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const loadContacts = useCallback(async () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`/api/contacts${params}`);
    setContacts(await res.json());
  }, [search]);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // タイプ（第1キー）の向き。見出しを押すと逆順になる
  const [typeDir, setTypeDir] = useState<"asc" | "desc">("asc");

  // 見出しを押すたびに 昇順 → 降順 → 解除（更新順）と切り替える
  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      // 数字の列は大きい順から始めるほうが使いやすい
      setSortDir(key === "deals" || key === "tasks" ? "desc" : "asc");
    } else if (sortDir === (key === "deals" || key === "tasks" ? "desc" : "asc")) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(null);
    }
  };

  const filtered = useMemo(() => {
    const list = typeFilter ? contacts.filter((c) => c.type === typeFilter) : contacts;
    const sign = sortDir === "asc" ? 1 : -1;
    const tsign = typeDir === "asc" ? 1 : -1;
    // Array.sort は安定ソートなので、同じタイプ内で sortKey が無ければ APIの並び（更新順）が残る
    return [...list].sort((a, b) => {
      const ta = typeRank(a);
      const tb = typeRank(b);
      if (ta !== tb) {
        // タイプ未設定は向きに関係なく最後
        if (!a.type) return 1;
        if (!b.type) return -1;
        return (ta - tb) * tsign;
      }
      if (!sortKey) return 0;
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      // 未入力は昇順・降順どちらでも最後
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign;
      return String(va).localeCompare(String(vb), "ja") * sign;
    });
  }, [contacts, typeFilter, sortKey, sortDir, typeDir]);

  const sortHead = (key: SortKey, label: string, className = "") => (
    <TableHead className={className} aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-1 hover:text-blue-600 ${sortKey === key ? "text-blue-600 font-semibold" : ""}`}
        title="クリックで並べ替え"
      >
        {label}
        <span className={`text-xs ${sortKey === key ? "" : "text-gray-300"}`}>
          {sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </TableHead>
  );

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">顧客</h2>
        <div className="flex gap-2">
          <SansanImportDialog onImported={loadContacts} />
          <ContactFormDialog onCreated={loadContacts} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="名前、会社名、メールで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="">全タイプ</option>
          {CONTACT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {filtered.length}件（タイプ順{sortKey ? "" : "・タイプ内は更新が新しい順"}）
        </span>
      </div>

      <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead aria-sort={typeDir === "asc" ? "ascending" : "descending"}>
              <button
                type="button"
                onClick={() => setTypeDir(typeDir === "asc" ? "desc" : "asc")}
                className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:text-blue-800"
                title="タイプ順は常に先。クリックで逆順"
              >
                タイプ
                <span className="text-xs">{typeDir === "asc" ? "▲" : "▼"}</span>
              </button>
            </TableHead>
            {sortHead("company", "社名")}
            {sortHead("name", "担当者")}
            {sortHead("discountRate", "掛率", "text-right")}
            <TableHead>部署 / 役職</TableHead>
            <TableHead>メール</TableHead>
            <TableHead>電話</TableHead>
            {sortHead("deals", "案件")}
            {sortHead("tasks", "タスク")}
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-gray-500 py-8">
                顧客がいません
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  {c.type ? (
                    <Badge className={getContactTypeColor(c.type)}>
                      {getContactTypeLabel(c.type)}
                    </Badge>
                  ) : "-"}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {c.company || c.name || "-"}
                  </Link>
                </TableCell>
                <TableCell>{c.company ? (c.name || "-") : "-"}</TableCell>
                <TableCell className="text-right text-sm">
                  {c.discountRate != null ? `${Math.round(c.discountRate * 10) / 10}%` : "-"}
                </TableCell>
                <TableCell>
                  {[c.department, c.title].filter(Boolean).join(" / ") || "-"}
                </TableCell>
                <TableCell className="text-sm">{c.email || "-"}</TableCell>
                <TableCell className="text-sm">{c.phone || "-"}</TableCell>
                <TableCell>
                  {c._count.deals > 0 && (
                    <Badge variant="secondary">{c._count.deals}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {c._count.tasks > 0 && (
                    <Badge variant="secondary">{c._count.tasks}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <ContactEditButton
                    contact={{
                      id: c.id,
                      name: c.name,
                      company: c.company,
                      department: c.department,
                      title: c.title,
                      email: c.email,
                      phone: c.phone,
                      address: c.address,
                      type: c.type,
                      discountRate: c.discountRate,
                      closingDay: c.closingDay,
                      paymentMonthOffset: c.paymentMonthOffset,
                      paymentDay: c.paymentDay,
                      dailyOrder: c.dailyOrder,
                      orderAliases: c.orderAliases,
                    }}
                    onSaved={loadContacts}
                    variant="icon"
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
