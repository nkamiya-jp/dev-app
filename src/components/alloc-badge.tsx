// 未出荷分の手当て（在庫から出せる／製造中待ち／未手配）を短く出す。分納の見える化用
export type ItemAlloc = { remain: number; fromStock: number; fromProduction: number; unplanned: number };

export function AllocBadge({ alloc, className = "" }: { alloc: ItemAlloc | null | undefined; className?: string }) {
  if (!alloc || alloc.remain <= 0) return null;
  if (alloc.fromStock === alloc.remain) {
    return <span className={`text-[11px] text-emerald-600 ${className}`} title="今の在庫から出せます">在庫で出せる</span>;
  }
  const parts: { label: string; cls: string; title: string }[] = [];
  if (alloc.fromStock > 0) parts.push({ label: `在庫${alloc.fromStock}`, cls: "text-emerald-600", title: "今の在庫から出せる数" });
  if (alloc.fromProduction > 0) parts.push({ label: `製造待ち${alloc.fromProduction}`, cls: "text-blue-600", title: "製造中の分が上がれば出せる数" });
  if (alloc.unplanned > 0) parts.push({ label: `未手配${alloc.unplanned}`, cls: "text-rose-600 font-medium", title: "まだ製造を頼んでいない数（要製造）" });
  return (
    <span className={`text-[11px] inline-flex flex-wrap gap-x-1.5 ${className}`}>
      {parts.map((p) => <span key={p.label} className={p.cls} title={p.title}>{p.label}</span>)}
    </span>
  );
}
