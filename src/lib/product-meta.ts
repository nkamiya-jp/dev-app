export const PRODUCT_SERIES = [
  { id: "nishijin", label: "西陣", color: "bg-purple-100 text-purple-700" },
  { id: "yuzen", label: "友禅", color: "bg-pink-100 text-pink-700" },
  { id: "ise", label: "伊勢", color: "bg-blue-100 text-blue-700" },
  { id: "other", label: "その他", color: "bg-gray-100 text-gray-700" },
] as const;

export function getSeriesLabel(id?: string | null) {
  if (!id) return "";
  return PRODUCT_SERIES.find((s) => s.id === id)?.label ?? id;
}

export function getSeriesColor(id?: string | null) {
  if (!id) return "bg-gray-100 text-gray-700";
  return PRODUCT_SERIES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}
