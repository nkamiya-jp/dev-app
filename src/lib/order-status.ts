export const ORDER_STATUSES = [
  { id: "pending", label: "未着手", color: "bg-gray-100 text-gray-700" },
  { id: "in_progress", label: "対応中", color: "bg-blue-100 text-blue-700" },
  { id: "completed", label: "完了", color: "bg-green-100 text-green-700" },
  { id: "cancelled", label: "キャンセル", color: "bg-red-100 text-red-700" },
] as const;

export const ORDER_STATUS_BG: Record<string, string> = {
  pending: "bg-gray-100/70",
  in_progress: "bg-blue-50",
  completed: "bg-green-50",
  cancelled: "bg-red-50",
};

export function getOrderStatusLabel(id: string) {
  return ORDER_STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function getOrderStatusColor(id: string) {
  return ORDER_STATUSES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}

export const SHIPMENT_STATUSES = [
  { id: "scheduled", label: "出荷予定", color: "bg-blue-100 text-blue-700" },
  { id: "shipped", label: "出荷済", color: "bg-green-100 text-green-700" },
  { id: "delivered", label: "納品完了", color: "bg-emerald-100 text-emerald-700" },
] as const;

export function getShipmentStatusLabel(id: string) {
  return SHIPMENT_STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function getShipmentStatusColor(id: string) {
  return SHIPMENT_STATUSES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}
