"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PersonGoals, type GoalsData } from "../person-goals";

interface Resp extends GoalsData {
  viewer: { memberId: string | null; name: string; isPresident: boolean };
}

export default function MyGoalsPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/roadmap/goals");
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "読み込めませんでした");
      return;
    }
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="p-6 text-gray-500">{error}</div>;
  if (!data) return <div className="p-6 text-gray-400">読み込み中...</div>;

  return (
    <div className="space-y-4 max-w-5xl">
      <h2 className="text-2xl font-bold">
        私の目標 <span className="text-sm font-normal text-gray-500">{data.term}</span>
      </h2>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        🔒 このページの内容は、あなたと社長だけが見られます。給与査定に使います。
      </div>
      <Card className="bg-white shadow-sm">
        <CardContent className="py-3 text-xs text-gray-600 leading-relaxed">
          <p className="font-medium text-sm text-gray-800 mb-1">進め方</p>
          1年分（3月〜翌2月）をこのページにまとめて書きます。① 年間目標を決める → ② 四半期ごとのマイルストーンと月目標に分ける（設定中）→
          ③ 社長と面談して合意（合意済）→ ④ 実績・結果を毎月入れる → ⑤ 四半期末に本人評価（評価中）→ ⑥ 社長が評価して確定（確定）。
          目標は「定量（数字）」か「定性（どうなったら達成か）」で立て、その結果が評価になります。評価は四半期ごとに S/A/B/C/D。社長FBはいつでも届きます。
          マイルストーンは「どの会社の目標に効くか」も選べます。
        </CardContent>
      </Card>
      {data.viewer.memberId ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-4">
            <PersonGoals memberId={data.viewer.memberId} asCeo={false} data={data} onChanged={load} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-gray-500">メンバーに登録されていないため、目標を入力できません。</p>
      )}
    </div>
  );
}
