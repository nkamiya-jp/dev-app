"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { CONTACT_TYPES, getDefaultRate } from "@/lib/contact-meta";

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
}

export function ContactEditButton({
  contact,
  onSaved,
  variant = "default",
}: {
  contact: Contact;
  onSaved?: () => void;
  variant?: "default" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typeValue, setTypeValue] = useState(contact.type || "");
  const [rateValue, setRateValue] = useState(contact.discountRate?.toString() || "");
  const router = useRouter();

  function handleTypeChange(newType: string) {
    setTypeValue(newType);
    // タイプ変更時、掛率が空なら自動セット
    const defaultRate = getDefaultRate(newType);
    if (defaultRate !== null && !rateValue) {
      setRateValue(String(defaultRate));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const data = {
      name: form.get("name"),
      company: form.get("company") || null,
      department: form.get("department") || null,
      title: form.get("title") || null,
      email: form.get("email") || null,
      phone: form.get("phone") || null,
      address: form.get("address") || null,
      type: form.get("type") || null,
      discountRate: form.get("discountRate") ? Number(form.get("discountRate")) : null,
      closingDay: form.get("closingDay") ? Number(form.get("closingDay")) : null,
      paymentMonthOffset: form.get("paymentMonthOffset") ? Number(form.get("paymentMonthOffset")) : null,
      paymentDay: form.get("paymentDay") ? Number(form.get("paymentDay")) : null,
    };

    await fetch(`/api/contacts/${contact.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setLoading(false);
    setOpen(false);
    if (onSaved) onSaved();
    else router.refresh();
  }

  const triggerClass = variant === "icon"
    ? "inline-flex items-center justify-center rounded-md border border-input bg-background p-1.5 hover:bg-accent hover:text-accent-foreground"
    : "inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={triggerClass}>
        <Pencil className="size-4" />
        {variant !== "icon" && <span className="ml-1">編集</span>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>顧客を編集</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">名前 *</label>
            <Input name="name" defaultValue={contact.name} required />
          </div>
          <div>
            <label className="text-xs text-gray-500">会社</label>
            <Input name="company" defaultValue={contact.company || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">部署</label>
            <Input name="department" defaultValue={contact.department || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">役職</label>
            <Input name="title" defaultValue={contact.title || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">メール</label>
            <Input name="email" type="email" defaultValue={contact.email || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">電話</label>
            <Input name="phone" defaultValue={contact.phone || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">住所</label>
            <Input name="address" defaultValue={contact.address || ""} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">取引先タイプ</label>
              <select
                name="type"
                value={typeValue}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">未設定</option>
                {CONTACT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">掛率（%）</label>
              <Input
                name="discountRate"
                type="number"
                step="0.1"
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                placeholder="例: 50"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">締日（月次売上の集計に使用）</label>
            <select
              name="closingDay"
              defaultValue={contact.closingDay != null ? String(contact.closingDay) : ""}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">末日締め</option>
              {[5, 10, 15, 20, 25].map((d) => (
                <option key={d} value={d}>{d}日締め</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              例: 20日締め → 21日〜翌月20日の受注を翌月の売上として集計
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">支払サイト（着金予定の計算）</label>
              <select
                name="paymentMonthOffset"
                defaultValue={contact.paymentMonthOffset != null ? String(contact.paymentMonthOffset) : ""}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">翌月（デフォルト）</option>
                <option value="1">翌月</option>
                <option value="2">翌々月</option>
                <option value="3">3ヶ月後</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">入金日</label>
              <select
                name="paymentDay"
                defaultValue={contact.paymentDay != null ? String(contact.paymentDay) : ""}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">末日</option>
                {[5, 10, 15, 20, 25].map((d) => (
                  <option key={d} value={d}>{d}日</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">
            例: 締め翌月末払い → 7月締め分は8月末に着金予定
          </p>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "保存中..." : "保存"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
