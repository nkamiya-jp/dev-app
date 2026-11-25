// 顧客の基本の並び順（サーバー側）。並びのルールは contact-order.ts
import { prisma } from "@/lib/db";
import { CONTACT_ORDER_SETTING_KEY, sortContactsByOrder } from "@/lib/contact-order";

// 手で決めた順（顧客IDの配列）
export async function getManualContactOrder(): Promise<string[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: CONTACT_ORDER_SETTING_KEY } });
  if (!row) return [];
  try {
    const v = JSON.parse(row.value);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// 1つのタイプの中の並びを保存する。ids はそのタイプの顧客を新しい順に並べたもの。
// タイプ順が先に効くので、全体の配列からこの顧客たちを抜いて末尾に足せば、タイプ内の順だけが変わる
export async function saveContactGroupOrder(ids: string[]): Promise<string[]> {
  const set = new Set(ids);
  const current = await getManualContactOrder();
  const next = [...current.filter((id) => !set.has(id)), ...ids];
  const value = JSON.stringify(next);
  await prisma.appSetting.upsert({
    where: { key: CONTACT_ORDER_SETTING_KEY },
    update: { value },
    create: { key: CONTACT_ORDER_SETTING_KEY, value },
  });
  return next;
}

// 全顧客の順位（0始まり）。顧客を自前で集めて並べる画面（売上・出荷計画など）で使う
export async function getContactRanks(): Promise<Map<string, number>> {
  const [contacts, manual] = await Promise.all([
    prisma.contact.findMany({ select: { id: true, type: true, updatedAt: true } }),
    getManualContactOrder(),
  ]);
  return new Map(sortContactsByOrder(contacts, manual).map((c, i) => [c.id, i]));
}
