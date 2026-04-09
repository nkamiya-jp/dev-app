export const LEAD_STATUSES = [
  { id: "untouched", label: "未接触", color: "bg-gray-100 text-gray-700" },
  { id: "first_contact", label: "初回接触", color: "bg-blue-100 text-blue-700" },
  { id: "in_negotiation", label: "商談中", color: "bg-orange-100 text-orange-700" },
  { id: "converted", label: "案件化", color: "bg-green-100 text-green-700" },
  { id: "on_hold", label: "保留", color: "bg-yellow-100 text-yellow-700" },
  { id: "passed", label: "見送り", color: "bg-red-100 text-red-700" },
] as const;

export const LEAD_SOURCES = [
  { id: "sansan", label: "Sansan" },
  { id: "exhibition", label: "展示会" },
  { id: "referral", label: "紹介" },
  { id: "web_inquiry", label: "Web問合せ" },
  { id: "other", label: "その他" },
] as const;

export const TEMPERATURES = [
  { id: "high", label: "高", color: "bg-red-100 text-red-700" },
  { id: "medium", label: "中", color: "bg-yellow-100 text-yellow-700" },
  { id: "low", label: "低", color: "bg-gray-100 text-gray-500" },
] as const;

export const ACTIVITY_TYPES = [
  { id: "phone", label: "電話" },
  { id: "email", label: "メール" },
  { id: "visit", label: "訪問" },
  { id: "exhibition", label: "展示会" },
  { id: "other", label: "その他" },
] as const;

export function getLeadStatusLabel(id: string) {
  return LEAD_STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function getLeadStatusColor(id: string) {
  return LEAD_STATUSES.find((s) => s.id === id)?.color ?? "bg-gray-100 text-gray-700";
}

export function getTemperatureLabel(id: string) {
  return TEMPERATURES.find((t) => t.id === id)?.label ?? id;
}

export function getTemperatureColor(id: string) {
  return TEMPERATURES.find((t) => t.id === id)?.color ?? "bg-gray-100 text-gray-500";
}

export function getLeadSourceLabel(id: string) {
  return LEAD_SOURCES.find((s) => s.id === id)?.label ?? id;
}

export function getActivityTypeLabel(id: string) {
  return ACTIVITY_TYPES.find((t) => t.id === id)?.label ?? id;
}
