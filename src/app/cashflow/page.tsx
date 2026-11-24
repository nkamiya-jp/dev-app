import { getViewer } from "@/lib/viewer";
import { getCollectionOutlook } from "@/lib/collection-outlook-server";
import { CollectionOutlookView } from "./collection-outlook";

export const dynamic = "force-dynamic";

// 入金見込み（当月・翌月・翌々月）。部品は CollectionOutlookView なので、トップページにもそのまま載せられる
export default async function CashflowPage() {
  const viewer = await getViewer();
  if (!viewer || viewer.isPart) {
    return <div className="p-6 text-gray-500">売上の数字は表示できません</div>;
  }
  const outlook = await getCollectionOutlook();
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">入金見込み</h2>
      <CollectionOutlookView outlook={outlook} />
    </div>
  );
}
