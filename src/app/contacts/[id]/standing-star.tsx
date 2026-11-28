"use client";

import { useState } from "react";
import { Star } from "lucide-react";

// 顧客ページの☆：定期顧客（毎月のように注文があるお客さん）。☆を付けると商品別出荷管理・受注ページの発注カードにいつも並ぶ
export function StandingStar({ contactId, initial }: { contactId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  async function toggle() {
    const next = !on;
    setSaving(true);
    setErr(false);
    const res = await fetch("/api/orders/standing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, standing: next }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) { setErr(true); return; }
    setOn(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      title={on ? "定期顧客（商品別出荷管理・発注カードにいつも並びます）。押すと外します" : "定期顧客にする（商品別出荷管理・発注カードにいつも並びます）"}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${on ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-400 hover:text-amber-600"}`}
    >
      <Star className={`size-3.5 ${on ? "fill-amber-400 text-amber-400" : ""}`} />
      定期顧客
      {err && <span className="text-red-600">（保存できませんでした）</span>}
    </button>
  );
}
