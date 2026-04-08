export const STAGES = [
  { id: "inquiry", label: "問合せ", color: "bg-gray-100 text-gray-700", group: 0 },
  { id: "hearing", label: "ヒアリング", color: "bg-blue-100 text-blue-700", group: 1 },
  { id: "prototype", label: "試作", color: "bg-orange-100 text-orange-700", group: 1 },
  { id: "estimate", label: "見積", color: "bg-yellow-100 text-yellow-700", group: 2 },
  { id: "sample", label: "サンプル", color: "bg-purple-100 text-purple-700", group: 2 },
  { id: "decided", label: "確定", color: "bg-green-100 text-green-700", group: 3 },
  { id: "manufacturing", label: "Manufacturing", color: "bg-emerald-100 text-emerald-700", group: 4 },
  { id: "lost", label: "失注", color: "bg-red-100 text-red-700", group: -1 },
] as const;

// グループ①: ヒアリング・試作（同時期） グループ②: 見積・サンプル（同時期）
export const CYCLE_STAGES = ["hearing", "prototype", "estimate", "sample"] as const;

export function getStageLabel(id: string) {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}

export function getStageColor(id: string) {
  return STAGES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}

export function isCycleStage(stageId: string): boolean {
  return CYCLE_STAGES.includes(stageId as (typeof CYCLE_STAGES)[number]);
}

export function getNextStage(currentStage: string): string | null {
  // サイクル内はタスク完了で自動昇格しない
  if (isCycleStage(currentStage)) return null;
  // 問合せ → ヒアリング
  if (currentStage === "inquiry") return "hearing";
  // 決定 → Manufacturing
  if (currentStage === "decided") return "manufacturing";
  return null;
}

// 同グループ内と次グループへの遷移候補を返す（手動遷移用）
export function getCycleNextOptions(currentStage: string): string[] {
  const current = STAGES.find((s) => s.id === currentStage);
  if (!current) return ["decided"];
  const group = current.group;

  // グループ①(ヒアリング・試作) → 同グループ + グループ②へ
  if (group === 1) {
    return ["hearing", "prototype", "estimate", "sample", "decided"].filter((s) => s !== currentStage);
  }
  // グループ②(見積・サンプル) → 同グループ + グループ①に戻る + 確定へ
  if (group === 2) {
    return ["estimate", "sample", "hearing", "prototype", "decided"].filter((s) => s !== currentStage);
  }
  return ["decided"];
}
