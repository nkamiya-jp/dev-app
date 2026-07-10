// 製造の6工程パイプライン（対応者ごと）
// assigned → cut → material → handover → delivered → inspected
export const PRODUCTION_STAGES = [
  { id: "assigned", label: "対応者決定", short: "対応者", dateField: "createdAt" as const },
  { id: "cut", label: "裁断", short: "裁断", dateField: "cutDate" as const },
  { id: "material", label: "資材準備", short: "資材", dateField: "materialDate" as const },
  { id: "handover", label: "お渡し", short: "お渡し", dateField: "handoverDate" as const },
  { id: "delivered", label: "納品", short: "納品", dateField: "deliveredDate" as const },
  { id: "inspected", label: "検品", short: "検品", dateField: "inspectedDate" as const },
] as const;

export type StageId = (typeof PRODUCTION_STAGES)[number]["id"];

export const STAGE_ORDER: StageId[] = PRODUCTION_STAGES.map((s) => s.id);

export function stageIndex(id: string): number {
  const i = STAGE_ORDER.indexOf(id as StageId);
  return i < 0 ? 0 : i;
}

export function stageLabel(id: string): string {
  return PRODUCTION_STAGES.find((s) => s.id === id)?.label ?? id;
}

// stage から従来の status（在庫・集計と連動）へ変換
export function stageToStatus(stage: string): "requested" | "in_progress" | "delivered" {
  const i = stageIndex(stage);
  if (i >= stageIndex("delivered")) return "delivered";
  if (i >= stageIndex("cut")) return "in_progress";
  return "requested";
}

// stage に応じて更新する日付フィールド名（createdAt は既存なので対象外）
export function stageDateField(stage: string): "cutDate" | "materialDate" | "handoverDate" | "deliveredDate" | "inspectedDate" | null {
  switch (stage) {
    case "cut": return "cutDate";
    case "material": return "materialDate";
    case "handover": return "handoverDate";
    case "delivered": return "deliveredDate";
    case "inspected": return "inspectedDate";
    default: return null;
  }
}
