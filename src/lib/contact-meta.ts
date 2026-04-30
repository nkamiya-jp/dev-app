export const CONTACT_TYPES = [
  { id: "wholesale", label: "卸先", color: "bg-blue-100 text-blue-700" },
  { id: "amazon", label: "Amazon", color: "bg-orange-100 text-orange-700" },
  { id: "sd", label: "SD", color: "bg-purple-100 text-purple-700" },
  { id: "terakoya", label: "寺子屋", color: "bg-green-100 text-green-700" },
  { id: "exhibition", label: "展示会", color: "bg-pink-100 text-pink-700" },
  { id: "other", label: "その他", color: "bg-gray-100 text-gray-700" },
] as const;

export function getContactTypeLabel(id?: string | null) {
  if (!id) return "";
  return CONTACT_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function getContactTypeColor(id?: string | null) {
  if (!id) return "bg-gray-100 text-gray-700";
  return CONTACT_TYPES.find((t) => t.id === id)?.color ?? "bg-gray-100 text-gray-700";
}
