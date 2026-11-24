// FLAMの売上集計（CSV）の取り込みと、売上目標に対する進み具合の集計。サーバー側専用。
import { prisma } from "@/lib/db";
import { getRoadmapSettings, todayJst } from "@/lib/roadmap/settings";

// 目標が未設定の月は「前年同月 × この倍率」を仮の目標にする
export const DEFAULT_TARGET_GROWTH = 1.1;

export interface FlamSaleRow {
  month: string;
  customerCode: string;
  productCode: string;
  spec: string;
  customerName: string;
  productName: string;
  amount: number;
  qty: number;
  cost: number;
}

// 引用符つきCSVを1行ずつ配列にする
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const REQUIRED = ["得意先コード", "得意先名", "集計年月", "商品コード", "商品名", "純売上額"];

// FLAM「売上集計」CSV（Shift_JIS）を読む。得意先×月×商品の形だけ受け付ける
export function parseFlamSalesCsv(buf: ArrayBuffer): FlamSaleRow[] {
  const bytes = new Uint8Array(buf);
  const isUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder(isUtf8Bom ? "utf-8" : "shift_jis").decode(bytes).replace(/^﻿/, "");
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSVにデータがありません");
  const head = rows[0].map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !head.includes(h));
  if (missing.length) {
    throw new Error(`FLAMの「売上集計」（得意先・月・商品別）のCSVではないようです。見つからない列：${missing.join("、")}`);
  }
  const col = (name: string) => head.indexOf(name);
  const num = (v: string | undefined) => Math.round(Number(String(v ?? "").replace(/,/g, "")) || 0);
  const merged = new Map<string, FlamSaleRow>();
  for (const r of rows.slice(1)) {
    const m = /^(\d{4})[\/-](\d{1,2})/.exec((r[col("集計年月")] || "").trim());
    if (!m) continue;
    const row: FlamSaleRow = {
      month: `${m[1]}-${m[2].padStart(2, "0")}`,
      customerCode: (r[col("得意先コード")] || "").trim(),
      productCode: (r[col("商品コード")] || "").trim(),
      spec: col("仕様・規格") >= 0 ? (r[col("仕様・規格")] || "").trim() : "",
      customerName: (r[col("得意先名")] || "").trim(),
      productName: (r[col("商品名")] || "").trim(),
      amount: num(r[col("純売上額")]),
      qty: col("純売上数") >= 0 ? num(r[col("純売上数")]) : 0,
      cost: col("原価計") >= 0 ? num(r[col("原価計")]) : 0,
    };
    const key = [row.month, row.customerCode, row.productCode, row.spec].join("\u0001");
    const prev = merged.get(key);
    if (prev) { prev.amount += row.amount; prev.qty += row.qty; prev.cost += row.cost; }
    else merged.set(key, row);
  }
  if (merged.size === 0) throw new Error("取り込める行がありませんでした");
  return [...merged.values()];
}

// CSVに入っている月を丸ごと入れ替える（同じ月を何度取り込んでも二重にならない）。
// Tursoは大きなトランザクションで落ちるので、月ごとに消して小分けに入れる。
export async function replaceFlamSales(rows: FlamSaleRow[]) {
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const importedAt = new Date();
  for (const month of months) {
    await prisma.flamSale.deleteMany({ where: { month } });
    const list = rows.filter((r) => r.month === month);
    for (let i = 0; i < list.length; i += 200) {
      await prisma.flamSale.createMany({ data: list.slice(i, i + 200).map((r) => ({ ...r, importedAt })) });
    }
  }
  return { months, rows: rows.length, total: rows.reduce((s, r) => s + r.amount, 0) };
}

export interface SalesGoalMonth {
  month: string; // YYYY-MM
  actual: number | null; // その月のFLAM売上（未取り込みは null）
  target: number | null; // 目標（未設定で前年も無ければ null）
  targetIsDefault: boolean; // true＝前年同月×1.1の仮目標
  lastYear: number | null;
}

export interface SalesGoalSummary {
  term: string;
  thisMonth: string;
  months: SalesGoalMonth[]; // 今期の12ヶ月
  lastImportedAt: string | null;
  latestDataMonth: string | null;
}

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function getSalesGoalSummary(): Promise<SalesGoalSummary> {
  const settings = await getRoadmapSettings();
  const thisMonth = todayJst().slice(0, 7);
  // 期首の月から12ヶ月。期首の設定が古いままでも、今月を含む期になるまで進める
  let start = settings.termStart.slice(0, 7);
  while (addMonths(start, 12) <= thisMonth) start = addMonths(start, 12);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));

  const [byMonth, targets, last] = await Promise.all([
    prisma.flamSale.groupBy({ by: ["month"], _sum: { amount: true } }),
    prisma.salesTarget.findMany(),
    prisma.flamSale.aggregate({ _max: { importedAt: true, month: true } }),
  ]);
  const actual = new Map(byMonth.map((r) => [r.month, r._sum.amount ?? 0]));
  const target = new Map(targets.map((t) => [t.month, t.amount]));

  return {
    term: settings.term,
    thisMonth,
    months: months.map((month) => {
      const lastYear = actual.get(addMonths(month, -12)) ?? null;
      const set = target.get(month);
      const fallback = lastYear != null ? Math.round((lastYear * DEFAULT_TARGET_GROWTH) / 10000) * 10000 : null;
      return {
        month,
        actual: actual.has(month) ? actual.get(month)! : null,
        target: set ?? fallback,
        targetIsDefault: set == null && fallback != null,
        lastYear,
      };
    }),
    lastImportedAt: last._max.importedAt ? last._max.importedAt.toISOString() : null,
    latestDataMonth: last._max.month ?? null,
  };
}
