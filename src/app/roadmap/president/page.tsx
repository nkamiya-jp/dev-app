"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { GOAL_STATUSES, QUARTER_STYLE, quarterOfMonth } from "@/lib/roadmap/goal-rules";
import { PersonGoals, type GoalsData } from "../person-goals";

interface MemberRow { id: string; name: string; role: string | null; permission: string; goalCount: number }
interface Resp extends GoalsData {
  viewer: { isPresident: boolean };
  members?: MemberRow[];
}
interface BizRow {
  id: string;
  grain: string;
  period: string;
  goal: string;
  support: { people: number; milestones: number; avgAchievement: number | null };
  supporters?: { id: string; memberId: string; memberName: string; goal: string; status: string; weight: number | null; achievement: number | null }[];
}

const SEL_KEY = "roadmap-president-member";

export default function PresidentPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [biz, setBiz] = useState<BizRow[]>([]);
  const [sel, setSel] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [res, bres] = await Promise.all([fetch("/api/roadmap/goals?memberId=*"), fetch("/api/roadmap/biz-goals")]);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "読み込めませんでした");
      return;
    }
    const d: Resp = await res.json();
    if (!d.viewer.isPresident) {
      setError("このページは社長だけが見られます");
      return;
    }
    setData(d);
    if (bres.ok) setBiz((await bres.json()).goals);
    setSel((cur) => {
      if (cur) return cur;
      let saved = "";
      try { saved = sessionStorage.getItem(SEL_KEY) || ""; } catch {}
      return d.members?.some((m) => m.id === saved) || saved === "*" ? saved : d.members?.[0]?.id || "";
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function choose(id: string) {
    setSel(id);
    try { sessionStorage.setItem(SEL_KEY, id); } catch {}
  }

  if (error) return <div className="p-6 text-gray-500">{error}</div>;
  if (!data) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const members = data.members || [];
  const curQ = quarterOfMonth(data.today.slice(0, 7));
  const cnt = (st: string) => data.goals.filter((g) => g.kind === "四半期" && g.quarter === curQ && g.status === st).length;
  const shown = members.filter((m) => sel === "*" || m.id === sel);
  const qBiz = biz.filter((b) => b.grain === "四半期");

  return (
    <div className="space-y-4 max-w-5xl">
      <h2 className="text-2xl font-bold">
        社長ページ <span className="text-sm font-normal text-gray-500">社長だけが見られます</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-white shadow-sm">
          <CardContent className="py-3">
            <p className="text-sm font-medium mb-2">
              個人目標の進み具合 <span className="text-xs text-gray-500 font-normal">{QUARTER_STYLE[curQ].label}のマイルストーン</span>
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {GOAL_STATUSES.map((s) => (
                <div key={s}>
                  <p className="text-2xl font-bold tabular-nums">{cnt(s)}</p>
                  <p className="text-xs text-gray-500">{s}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm">
          <CardContent className="py-3 space-y-2">
            <p className="text-sm font-medium">事業目標を支えている個人目標</p>
            {qBiz.length === 0 && <p className="text-xs text-gray-400">今期の四半期の事業目標がありません</p>}
            {qBiz.map((b) => (
              <div key={b.id} className="text-xs border-l-4 pl-2" style={{ borderColor: QUARTER_STYLE[b.period]?.color || "#ccc" }}>
                <p className="font-medium">{b.period}：{b.goal}</p>
                <p className="text-gray-500">
                  {b.support.people}人・マイルストーン{b.support.milestones}件
                  {b.support.avgAchievement !== null && `・平均達成率 ${b.support.avgAchievement}%`}
                </p>
                {b.supporters && b.supporters.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5">
                    {b.supporters.map((s) => (
                      <li key={s.id}>
                        <button type="button" className="text-blue-600 hover:underline" onClick={() => choose(s.memberId)}>{s.memberName}</button>
                        ：{s.goal}
                        <span className="text-gray-400">（{s.status}{s.achievement !== null ? `・${s.achievement}%` : ""}）</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm">
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-medium">
            全員の個人目標・FB・査定 <span className="text-xs text-gray-500 font-normal">対象者を選ぶ（1年分＝3月〜翌2月をまとめて表示・代理入力できます）</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => choose(m.id)}
                className={`rounded-full border px-3 py-1 text-sm ${sel === m.id ? "bg-zinc-900 text-white border-zinc-900" : "bg-white hover:bg-gray-50"}`}
              >
                {m.name}
                {m.goalCount > 0 && <span className="ml-1 opacity-70 text-xs">{m.goalCount}</span>}
              </button>
            ))}
            <button
              type="button"
              onClick={() => choose("*")}
              className={`rounded-full border px-3 py-1 text-sm ${sel === "*" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white hover:bg-gray-50"}`}
            >
              全員
            </button>
          </div>
          {members.length === 0 && (
            <p className="text-sm text-gray-500">ログインできるメンバーがいません。スタッフ画面でメール・権限を登録してください。</p>
          )}
          {shown.map((m) => (
            <div key={m.id} className="pt-3 border-t">
              <h3 className="font-semibold mb-2">
                {m.name} <span className="text-xs text-gray-500 font-normal">{m.role || ""}</span>
              </h3>
              <PersonGoals memberId={m.id} asCeo data={data} onChanged={load} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
