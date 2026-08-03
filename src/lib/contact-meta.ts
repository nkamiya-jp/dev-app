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

// 取引タイプ（価格表のマトリクス列）。掛率は「上代に対する販売価格の比率(%値)」。
// 既存顧客データを壊さないよう id は極力再利用している。
export const CONTACT_TYPES: ContactTypeMeta[] = [
  {
    id: "overseas_ref",
    label: "海外参考価格",
    color: "bg-cyan-100 text-cyan-700",
    defaultRate: 150,
    rateOptions: [150],
    kind: "markup",
    description: "海外向けの参考価格（上代×1.5）",
  },
  {
    id: "amazon_jp",
    label: "AmazonJP",
    color: "bg-orange-100 text-orange-700",
    defaultRate: 130,
    rateOptions: [130],
    kind: "markup",
    description: "国内Amazonでの販売（上代×1.3）",
  },
  {
    id: "ref",
    label: "参考価格",
    color: "bg-amber-100 text-amber-700",
    defaultRate: 100,
    rateOptions: [100],
    kind: "markup",
    description: "上代と同額の参考価格",
  },
  {
    id: "sd",
    label: "SD",
    color: "bg-purple-100 text-purple-700",
    defaultRate: 55,
    rateOptions: [55],
    kind: "discount",
    description: "SuperDelivery",
  },
  {
    id: "retail_outside_kyoto",
    label: "小売",
    color: "bg-pink-100 text-pink-700",
    defaultRate: 50,
    rateOptions: [50],
    kind: "discount",
    description: "小売店",
  },
  {
    id: "wholesale_outside_kyoto",
    label: "問屋",
    color: "bg-indigo-100 text-indigo-700",
    defaultRate: 45,
    rateOptions: [45],
    kind: "discount",
    description: "問屋",
  },
  {
    id: "retail_kyoto",
    label: "京都小売",
    color: "bg-rose-100 text-rose-700",
    defaultRate: 42,
    rateOptions: [42],
    kind: "discount",
    description: "京都府内の小売店",
  },
  {
    id: "wholesale_kyoto",
    label: "京都問屋",
    color: "bg-blue-100 text-blue-700",
    defaultRate: 40,
    rateOptions: [40],
    kind: "discount",
    description: "京都府内の問屋",
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
