// FLAMの回収予定（売上 › 回収予定 のCSV）の取り込み。サーバー側専用。
import { prisma } from "@/lib/db";
import { parseCsv } from "@/lib/flam-sales-server";

export interface FlamCollectionRow {
  month: string;
  slipNo: string;
  kind: string; // 請求 | 入金
  customerCode: string;
  customerName: string;
  dueDate: string;
  amount: number;
  received: number;
  method: string | null;
}
export interface FlamCollectionHead {
  month: string;
  planned: number;
  carryover: number;
  total: number;
  received: number;
}

const REQUIRED = ["回収年月", "回収予定日", "請求先コード", "請求先名", "伝票No", "請求先回収予定額"];

// Shift_JIS（またはBOM付きUTF-8）の回収予定CSVを読む
export function parseFlamCollectionCsv(buf: ArrayBuffer): { rows: FlamCollectionRow[]; heads: FlamCollectionHead[] } {
  const bytes = new Uint8Array(buf);
  const isUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder(isUtf8Bom ? "utf-8" : "shift_jis").decode(bytes).replace(/^﻿/, "");
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("CSVにデータがありません");
  const head = table[0].map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !head.includes(h));
  if (missing.length) throw new Error(`FLAMの「回収予定」のCSVではないようです。見つからない列：${missing.join("、")}`);
  const get = (r: string[], name: string) => (head.indexOf(name) >= 0 ? (r[head.indexOf(name)] ?? "").trim() : "");
  const num = (v: string) => Math.round(Number(v.replace(/,/g, "")) || 0);

  const rows = new Map<string, FlamCollectionRow>();
  const heads = new Map<string, FlamCollectionHead>();
  for (const r of table.slice(1)) {
    const m = /^(\d{4})\D+(\d{1,2})/.exec(get(r, "回収年月"));
    if (!m) continue;
    const month = `${m[1]}-${m[2].padStart(2, "0")}`;
    if (!heads.has(month)) {
      heads.set(month, {
        month,
        planned: num(get(r, "当月回収予定額")),
        carryover: num(get(r, "前月までの回収予定額")),
        total: num(get(r, "回収予定額合計")),
        received: num(get(r, "当月入金額")),
      });
    }
    const customerCode = get(r, "請求先コード");
    if (!customerCode) continue;
    const due = get(r, "回収予定日").replace(/\//g, "-");
    const row: FlamCollectionRow = {
      month,
      slipNo: get(r, "伝票No") || `${customerCode}-${due}`,
      kind: get(r, "明細分類") || "請求",
      customerCode,
      customerName: get(r, "請求先名"),
      dueDate: /^\d{4}-\d{1,2}-\d{1,2}$/.test(due)
        ? due.split("-").map((x, i) => (i ? x.padStart(2, "0") : x)).join("-")
        : `${month}-31`,
      amount: num(get(r, "請求先回収予定額")),
      received: num(get(r, "請求先入金額")),
      method: get(r, "回収方法") || null,
    };
    const key = [row.month, row.slipNo, row.customerCode].join("\u0001");
    const prev = rows.get(key);
    if (prev) { prev.amount += row.amount; prev.received += row.received; }
    else rows.set(key, row);
  }
  if (heads.size === 0) throw new Error("取り込める行がありませんでした");
  return { rows: [...rows.values()], heads: [...heads.values()] };
}

// CSVに入っている回収月を丸ごと入れ替える（何度取り込んでも二重にならない）。
// Tursoは大きなトランザクションで落ちるので、月ごとに消して小分けに入れる。
export async function replaceFlamCollections(data: { rows: FlamCollectionRow[]; heads: FlamCollectionHead[] }) {
  const importedAt = new Date();
  for (const h of data.heads) {
    await prisma.flamCollection.deleteMany({ where: { month: h.month } });
    const list = data.rows.filter((r) => r.month === h.month);
    for (let i = 0; i < list.length; i += 200) {
      await prisma.flamCollection.createMany({ data: list.slice(i, i + 200).map((r) => ({ ...r, importedAt })) });
    }
    await prisma.flamCollectionMonth.upsert({
      where: { month: h.month },
      create: { ...h, importedAt },
      update: { ...h, importedAt },
    });
  }
  return {
    months: data.heads.map((h) => h.month).sort(),
    rows: data.rows.length,
    total: data.rows.reduce((s, r) => s + r.amount, 0),
  };
}
