// 別注プロジェクトの段階。承認（正式発注）までが量産前、量産中、納品完了。
export const DEV_PHASES = [
  { id: "consult", label: "相談・企画", group: "量産前", color: "bg-gray-100 text-gray-700" },
  { id: "quote", label: "見積", group: "量産前", color: "bg-slate-100 text-slate-700" },
  { id: "sample", label: "試作・サンプル", group: "量産前", color: "bg-purple-100 text-purple-700" },
  { id: "approved", label: "承認（正式発注）", group: "量産前", color: "bg-blue-100 text-blue-700" },
  { id: "production", label: "量産中", group: "量産中", color: "bg-amber-100 text-amber-800" },
  { id: "delivered", label: "納品完了", group: "完了", color: "bg-emerald-100 text-emerald-800" },
] as const;

export type DevPhase = (typeof DEV_PHASES)[number]["id"];

export function getDevPhase(id?: string | null) {
  return DEV_PHASES.find((p) => p.id === id) ?? DEV_PHASES[0];
}

export function isDevPhase(id: unknown): id is DevPhase {
  return typeof id === "string" && DEV_PHASES.some((p) => p.id === id);
}
