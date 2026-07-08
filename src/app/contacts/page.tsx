"use client";

import { useEffect, useState, useCallback } from "react";
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
  createdAt: string;
  _count: { deals: number; tasks: number };
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

  const filtered = typeFilter
    ? contacts.filter((c) => c.type === typeFilter)
    : contacts;

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
      </div>

      <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>会社</TableHead>
            <TableHead>タイプ</TableHead>
            <TableHead className="text-right">掛率</TableHead>
            <TableHead>部署 / 役職</TableHead>
            <TableHead>メール</TableHead>
            <TableHead>電話</TableHead>
            <TableHead>案件</TableHead>
            <TableHead>タスク</TableHead>
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
                  <Link
                    href={`/contacts/${c.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{c.company || "-"}</TableCell>
                <TableCell>
                  {c.type ? (
                    <Badge className={getContactTypeColor(c.type)}>
                      {getContactTypeLabel(c.type)}
                    </Badge>
                  ) : "-"}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {c.discountRate != null ? `${c.discountRate}%` : "-"}
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
