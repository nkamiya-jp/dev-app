export const NOTE_STATUSES = [
  { id: "new", label: "新規", color: "bg-gray-100 text-gray-700" },
  { id: "in_progress", label: "対応中", color: "bg-blue-100 text-blue-700" },
  { id: "waiting", label: "待ち", color: "bg-yellow-100 text-yellow-700" },
  { id: "done", label: "完了", color: "bg-green-100 text-green-700" },
  { id: "archived", label: "保留", color: "bg-gray-200 text-gray-500" },
] as const;

export function getNoteStatusLabel(id: string) {
  return NOTE_STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function getNoteStatusColor(id: string) {
  return NOTE_STATUSES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}
