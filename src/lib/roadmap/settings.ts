// ロードマップの設定（GAS版の「設定」シート）。AppSetting に「roadmap:キー」で保存。サーバー側専用
import { prisma } from "@/lib/db";

export const ROADMAP_SETTING_PREFIX = "roadmap:";

export interface RoadmapSettings {
  term: string; // 現在の期（例：第10期）
  termStart: string; // 期首日 YYYY-MM-DD
  departments: string[];
  raw: Record<string, string>;
}

export async function getRoadmapSettings(): Promise<RoadmapSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: ROADMAP_SETTING_PREFIX } } });
  const raw = Object.fromEntries(rows.map((r) => [r.key.slice(ROADMAP_SETTING_PREFIX.length), r.value]));
  return {
    term: raw["現在の期"] || "第10期",
    termStart: (raw["期首日"] || "2026-03-01").slice(0, 10),
    departments: (raw["事業・部門一覧"] || "営業、制作、出荷").split(/[、,，\s]+/).filter(Boolean),
    raw,
  };
}

// 今日（日本時間）YYYY-MM-DD
export function todayJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
