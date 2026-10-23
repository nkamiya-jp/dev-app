// JAN台帳の共通ルール（取込・登録・画面で同じ判定を使う）

// ラベル印刷に渡すJANの選択（一覧→印刷画面）
export const LABEL_STORAGE_KEY = "janLabelIds";

export const JAN_STATUSES = [
  { id: "used", label: "使用中", color: "bg-emerald-100 text-emerald-800" },
  { id: "reserved", label: "確保", color: "bg-amber-100 text-amber-800" },
  { id: "free", label: "空き", color: "bg-gray-100 text-gray-600" },
  // 販売終了。GS1の規定で一定期間は再利用できないので採番の候補にも出さない
  { id: "discontinued", label: "廃番", color: "bg-slate-200 text-slate-600" },
] as const;

// 採番の候補にしない状態（使用中・廃番）
export const JAN_TAKEN_STATUSES: readonly string[] = ["used", "discontinued"];

export type JanStatus = (typeof JAN_STATUSES)[number]["id"];

export function getJanStatus(id?: string | null) {
  return JAN_STATUSES.find((s) => s.id === id) ?? JAN_STATUSES[2];
}

const RESERVE_WORDS = /確保|空き番|予約|リザーブ/;

// 旧台帳の行から状態を決める：商品名か名称他があれば使用中、
// 無く柄コード等に「確保」「空き番」等の用途メモがあれば確保、何も無ければ空き
export function inferJanStatus(row: { productName?: string | null; nameOther?: string | null; patternCode?: string | null }): JanStatus {
  const name = (row.productName || "").trim();
  const other = (row.nameOther || "").trim();
  if (name || (other && !RESERVE_WORDS.test(other))) return "used";
  if ((row.patternCode || "").trim() || other) return "reserved";
  return "free";
}

// CSV の1行（旧台帳の書き出し・DEVの書き出しのどちらの列名でも受ける）
export interface JanCsvRow {
  jan: string;
  productName: string | null;
  nameOther: string | null;
  patternCode: string | null;
  amazonListed: boolean;
  amazonComolife: boolean;
  pastAmazonListed: boolean;
  pastAmazonCode: string | null;
  legacyRecordNo: number | null;
  productCode: string | null; // 商品マスタコード（DEVの書き出しのみ）
  status: JanStatus | null; // 状態（DEVの書き出しのみ。無ければ推定）
  note: string | null;
  gs1Registered: boolean | null; // 列が無ければ null（既存の値を残す）
  price: number | null;
  brand: string | null;
  channels: string | null;
}

const COLS = {
  jan: ["JANコード", "JAN", "jan"],
  productName: ["商品名"],
  nameOther: ["名称他"],
  patternCode: ["柄コード"],
  amazonListed: ["Amazon[出品]"],
  amazonComolife: ["Amazon[コモライフ]"],
  pastAmazonListed: ["過去Amazon[出品]"],
  pastAmazonCode: ["過去Amazonコード"],
  legacyRecordNo: ["レコード番号"],
  productCode: ["商品マスタコード"],
  status: ["状態"],
  note: ["メモ"],
  gs1Registered: ["GS1登録", "GS1(GJDB)登録"],
  price: ["上代", "上代（税抜）"],
  brand: ["ブランド"],
  channels: ["使用先"],
} as const;

const truthy = (v: string) => ["1", "true", "TRUE", "○", "◯", "はい", "yes", "済"].includes(v.trim());
const STATUS_BY_LABEL: Record<string, JanStatus> = {
  使用中: "used", 確保: "reserved", 空き: "free", 廃番: "discontinued",
  used: "used", reserved: "reserved", free: "free", discontinued: "discontinued",
};

export function mapCsvRecord(rec: Record<string, string>): JanCsvRow {
  const get = (keys: readonly string[]) => {
    for (const k of keys) if (k in rec) return (rec[k] ?? "").trim();
    return "";
  };
  const orNull = (v: string) => (v ? v : null);
  const rn = get(COLS.legacyRecordNo);
  const has = (keys: readonly string[]) => keys.some((k) => k in rec);
  const price = get(COLS.price).replace(/[^\d]/g, "");
  return {
    jan: get(COLS.jan).replace(/\D/g, ""),
    productName: orNull(get(COLS.productName)),
    nameOther: orNull(get(COLS.nameOther)),
    patternCode: orNull(get(COLS.patternCode)),
    amazonListed: truthy(get(COLS.amazonListed)),
    amazonComolife: truthy(get(COLS.amazonComolife)),
    pastAmazonListed: truthy(get(COLS.pastAmazonListed)),
    pastAmazonCode: orNull(get(COLS.pastAmazonCode).replace(/\D/g, "")),
    legacyRecordNo: /^\d+$/.test(rn) ? Number(rn) : null,
    productCode: orNull(get(COLS.productCode)),
    status: STATUS_BY_LABEL[get(COLS.status)] ?? null,
    note: orNull(get(COLS.note)),
    gs1Registered: has(COLS.gs1Registered) ? /登録済|^1$|^true$|○/i.test(get(COLS.gs1Registered)) : null,
    price: price ? Number(price) : null,
    brand: orNull(get(COLS.brand)),
    channels: orNull(normalizeChannels(get(COLS.channels))),
  };
}

// 使用先は「、」「/」改行などで区切られていても「, 」区切りにそろえる
export function normalizeChannels(v: string | null | undefined): string {
  return String(v || "")
    .split(/[,、，/／\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
}

// 最小限のCSVパーサ（ダブルクォート・改行入りセル対応）
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}
