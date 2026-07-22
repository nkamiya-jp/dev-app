export const DEVELOPMENT_STATUSES = [
  { id: "active", label: "進行中", color: "bg-blue-100 text-blue-700" },
  { id: "paused", label: "一時停止", color: "bg-yellow-100 text-yellow-700" },
  // id は既存データ互換のため "released" のまま。表示は汎用プロジェクト向けに「完了」
  { id: "released", label: "完了", color: "bg-green-100 text-green-700" },
  { id: "abandoned", label: "中止", color: "bg-red-100 text-red-700" },
] as const;

export const DEVELOPMENT_STATUS_BG: Record<string, string> = {
  active: "bg-blue-50",
  paused: "bg-yellow-50",
  released: "bg-green-50",
  abandoned: "bg-red-50",
};

export function getDevelopmentStatusLabel(id: string) {
  return DEVELOPMENT_STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function getDevelopmentStatusColor(id: string) {
  return DEVELOPMENT_STATUSES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}
