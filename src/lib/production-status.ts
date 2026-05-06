export const PRODUCTION_STATUSES = [
  { id: "requested", label: "依頼中", color: "bg-gray-100 text-gray-700" },
  { id: "in_progress", label: "制作中", color: "bg-blue-100 text-blue-700" },
  { id: "delivered", label: "納品済", color: "bg-green-100 text-green-700" },
] as const;

export const PRODUCTION_STATUS_BG: Record<string, string> = {
  requested: "bg-gray-100/70",
  in_progress: "bg-blue-50",
  delivered: "bg-green-50",
};

export function getProductionStatusLabel(id: string) {
  return PRODUCTION_STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function getProductionStatusColor(id: string) {
  return PRODUCTION_STATUSES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}
