// 顧客の「基本の並び順」：タイプ順（CONTACT_TYPES の順・未設定は最後）→ タイプ内は顧客ページで手で決めた順
// 手で並べていない顧客は、そのタイプの最後に更新が新しい順で付く。
// 並び順そのものは AppSetting（contact-order）に顧客IDの配列で持つ（列の追加なし）。サーバー側は contact-order-server.ts
import { CONTACT_TYPES } from "@/lib/contact-meta";

export const CONTACT_ORDER_SETTING_KEY = "contact-order";

const TYPE_RANK = new Map<string, number>(CONTACT_TYPES.map((t, i) => [t.id, i]));

// タイプの並び順（設定順）。一覧にないタイプは設定済みの後、未設定は最後
export function contactTypeRank(type: string | null | undefined): number {
  return type ? TYPE_RANK.get(type) ?? CONTACT_TYPES.length : CONTACT_TYPES.length + 1;
}

export interface OrderableContact {
  id: string;
  type: string | null;
  updatedAt: Date | string;
}

// 基本の並びに並べ替えた新しい配列を返す。manual は手で決めた順（顧客IDの配列）
export function sortContactsByOrder<T extends OrderableContact>(list: T[], manual: string[]): T[] {
  const pos = new Map(manual.map((id, i) => [id, i]));
  const time = (c: T) => new Date(c.updatedAt).getTime() || 0;
  return [...list].sort((a, b) => {
    const t = contactTypeRank(a.type) - contactTypeRank(b.type);
    if (t) return t;
    const pa = pos.get(a.id);
    const pb = pos.get(b.id);
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return time(b) - time(a);
  });
}

// 順位（0始まり）で比べる。順位が無い顧客（削除済みなど）は最後
export function compareByRank(ranks: Record<string, number> | Map<string, number>, a: string | null | undefined, b: string | null | undefined): number {
  const get = (id: string | null | undefined) => {
    if (!id) return Number.MAX_SAFE_INTEGER;
    const r = ranks instanceof Map ? ranks.get(id) : ranks[id];
    return r ?? Number.MAX_SAFE_INTEGER - 1;
  };
  return get(a) - get(b);
}
