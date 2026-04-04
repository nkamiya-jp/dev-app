export const TASK_STATUSES = [
  { id: "todo", label: "未着手", color: "bg-gray-100 text-gray-700" },
  { id: "in_progress", label: "進行中", color: "bg-blue-100 text-blue-700" },
  { id: "waiting", label: "待ち", color: "bg-yellow-100 text-yellow-700" },
  { id: "done", label: "完了", color: "bg-green-100 text-green-700" },
] as const;

export function getTaskStatusLabel(id: string) {
  return TASK_STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function getTaskStatusColor(id: string) {
  return TASK_STATUSES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}
