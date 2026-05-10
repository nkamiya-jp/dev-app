// 顧客の取引タイプとデフォルト掛率
// 掛率は "上代に対する販売価格の比率（%値）" として保存
// 例: 40 = 上代の40% / 110 = 上代の110%（マークアップ）

export interface ContactTypeMeta {
  id: string;
  label: string;
  color: string;
  // デフォルト掛率 %値（null = 未定）
  defaultRate: number | null;
  // 掛率の取りうる候補（%値、マトリクス表示用）
  rateOptions?: number[];
  // 掛率の意味（discount=ディスカウント / markup=上代より高い）
  kind: "discount" | "markup" | "none";
  description?: string;
}

export const CONTACT_TYPES: ContactTypeMeta[] = [
  {
    id: "amazon_jp",
    label: "AmazonJP",
    color: "bg-orange-100 text-orange-700",
    defaultRate: 110,
    rateOptions: [110, 130, 150],
    kind: "markup",
    description: "国内Amazonでの販売（上代×1.1〜1.5）",
  },
  {
    id: "amazon_us",
    label: "AmazonUS",
    color: "bg-amber-100 text-amber-700",
    defaultRate: null,
    kind: "markup",
    description: "US Amazonでの販売（上代より高い）",
  },
  {
    id: "overseas_wholesale",
    label: "海外卸",
    color: "bg-cyan-100 text-cyan-700",
    defaultRate: null,
    kind: "discount",
    description: "海外卸先（未定）",
  },
  {
    id: "overseas_retail",
    label: "海外小売",
    color: "bg-teal-100 text-teal-700",
    defaultRate: null,
    kind: "discount",
    description: "海外の小売店",
  },
  {
    id: "custom_order",
    label: "別注",
    color: "bg-violet-100 text-violet-700",
    defaultRate: null,
    kind: "none",
    description: "別注品の取引先（個別単価）",
  },
  {
    id: "sd",
    label: "SD",
    color: "bg-purple-100 text-purple-700",
    defaultRate: 55,
    rateOptions: [55],
    kind: "discount",
    description: "SuperDelivery（手数料15%）",
  },
  {
    id: "retail_outside_kyoto",
    label: "京都以外の小売",
    color: "bg-pink-100 text-pink-700",
    defaultRate: 50,
    rateOptions: [50],
    kind: "discount",
  },
  {
    id: "retail_kyoto",
    label: "京都店舗",
    color: "bg-rose-100 text-rose-700",
    defaultRate: 42,
    rateOptions: [40, 42, 45],
    kind: "discount",
    description: "京都府内の小売店",
  },
  {
    id: "wholesale_outside_kyoto",
    label: "京都以外の問屋",
    color: "bg-indigo-100 text-indigo-700",
    defaultRate: 42,
    rateOptions: [40, 42, 45],
    kind: "discount",
  },
  {
    id: "wholesale_kyoto",
    label: "京都問屋",
    color: "bg-blue-100 text-blue-700",
    defaultRate: 40,
    rateOptions: [40],
    kind: "discount",
    description: "京都府内の問屋（寺子屋等）",
  },
  {
    id: "exhibition",
    label: "展示会",
    color: "bg-green-100 text-green-700",
    defaultRate: null,
    kind: "none",
  },
  {
    id: "other",
    label: "その他",
    color: "bg-gray-100 text-gray-700",
    defaultRate: null,
    kind: "none",
  },
];

export function getContactTypeLabel(id?: string | null) {
  if (!id) return "";
  return CONTACT_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function getContactTypeColor(id?: string | null) {
  if (!id) return "bg-gray-100 text-gray-700";
  return CONTACT_TYPES.find((t) => t.id === id)?.color ?? "bg-gray-100 text-gray-700";
}

export function getContactTypeMeta(id?: string | null): ContactTypeMeta | null {
  if (!id) return null;
  return CONTACT_TYPES.find((t) => t.id === id) ?? null;
}

export function getDefaultRate(typeId?: string | null): number | null {
  return getContactTypeMeta(typeId)?.defaultRate ?? null;
}

// 商品詳細ページのマトリクスで使う「全タイプの掛率を一覧化」
// 各行: タイプ名 + 掛率（%値） + マークアップかどうか
export interface MatrixRow {
  typeId: string;
  typeLabel: string;
  ratePct: number; // 例: 40, 110
  kind: "discount" | "markup" | "none";
  color: string;
}

export function getAllMatrixRows(): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const t of CONTACT_TYPES) {
    if (!t.rateOptions || t.kind === "none") continue;
    for (const ratePct of t.rateOptions) {
      rows.push({
        typeId: t.id,
        typeLabel: t.label,
        ratePct,
        kind: t.kind,
        color: t.color,
      });
    }
  }
  // 掛率の高い順
  rows.sort((a, b) => b.ratePct - a.ratePct);
  return rows;
}
