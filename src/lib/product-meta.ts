export const PRODUCT_SERIES = [
  { id: "nishijin", label: "西陣", color: "bg-purple-100 text-purple-700" },
  { id: "yuzen", label: "友禅", color: "bg-pink-100 text-pink-700" },
  { id: "ise", label: "伊勢", color: "bg-blue-100 text-blue-700" },
  { id: "sensu", label: "扇子", color: "bg-amber-100 text-amber-700" },
  { id: "purchase", label: "仕入", color: "bg-emerald-100 text-emerald-700" },
  { id: "other", label: "その他", color: "bg-gray-100 text-gray-700" },
] as const;

// CSVインポート等で来た値を series の id に正規化する。
// id そのもの（"nishijin"）も、日本語ラベル（"西陣" "仕入"）も受け付ける。
export function normalizeSeries(raw?: string | null): string | null {
  if (raw == null) return null;
  const v = String(raw).trim();
  if (!v) return null;
  const byId = PRODUCT_SERIES.find((s) => s.id === v);
  if (byId) return byId.id;
  const byLabel = PRODUCT_SERIES.find((s) => s.label === v);
  if (byLabel) return byLabel.id;
  return v; // 未知の値はそのまま（既存挙動を壊さない）
}

// ── 商品の「マスタ順」を全画面共通の基準にするための並び替えヘルパ ──
// マスタ（商品一覧）の並び = シリーズ順(PRODUCT_SERIES の定義順) → シリーズ内 sortOrder → コード。
// 価格表・原価比較・顧客取扱商品などはこの比較関数で並べ、商品マスタと一致させる。
export function seriesRank(seriesId?: string | null): number {
  if (!seriesId) return PRODUCT_SERIES.length; // 未分類は最後
  const i = PRODUCT_SERIES.findIndex((s) => s.id === seriesId);
  return i === -1 ? PRODUCT_SERIES.length : i;
}

export function compareProductOrder(
  a: { series?: string | null; sortOrder?: number | null; code?: string | null },
  b: { series?: string | null; sortOrder?: number | null; code?: string | null }
): number {
  const sr = seriesRank(a.series) - seriesRank(b.series);
  if (sr !== 0) return sr;
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (so !== 0) return so;
  return (a.code ?? "").localeCompare(b.code ?? "");
}

export function getSeriesLabel(id?: string | null) {
  if (!id) return "";
  return PRODUCT_SERIES.find((s) => s.id === id)?.label ?? id;
}

export function getSeriesColor(id?: string | null) {
  if (!id) return "bg-gray-100 text-gray-700";
  return PRODUCT_SERIES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}
