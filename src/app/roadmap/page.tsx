"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { QUARTER_STYLE } from "@/lib/roadmap/goal-rules";
import { EventLine, RichText, StatusChip, type EventRow } from "./portal-ui";

interface Post { id: string; title: string; body: string; pinned: boolean; authorName: string; createdAt: string }
interface BizGoalRow { id: string; period: string; goal: string; kpi: string | null; target: string | null; actual: string | null; owner: string | null; status: string | null }
interface MonthGoalRow { id: string; dept: string; goal: string; target: string | null; actual: string | null; status: string | null }
interface MyGoal {
  id: string; kind: string; goal: string; qtype: string; target: string | null; result: string | null;
  progress: string | null; status: string; fb: string | null; weight: number | null; achievement: number | null; month: string | null;
}
interface HomeData {
  today: string; term: string; quarter: string; quarterLabel: string; month: string;
  vision: string; theme: string;
  viewer: { name: string; memberId: string | null; isPresident: boolean; isPart: boolean };
  pinned: Post[]; recent: Post[]; events: EventRow[];
  bizGoals: BizGoalRow[]; monthGoals: MonthGoalRow[]; myGoals: MyGoal[];
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

function SectionTitle({ children, href, more }: { children: React.ReactNode; href?: string; more?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-sm font-semibold">{children}</h3>
      {href && <Link href={href} className="text-xs text-blue-600">{more ?? "すべて見る"} →</Link>}
    </div>
  );
}

export default function RoadmapHome() {
  const [d, setD] = useState<HomeData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/roadmap/home").then(async (res) => {
      if (!res.ok) return setError((await res.json().catch(() => ({}))).error || "読み込めませんでした");
      setD(await res.json());
    });
  }, []);

  if (error) return <div className="p-6 text-gray-500">{error}</div>;
  if (!d) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const qs = QUARTER_STYLE[d.quarter];
  const yearGoals = d.bizGoals.filter((g) => g.period === "年間");
  const qGoals = d.bizGoals.filter((g) => g.period === d.quarter);
  const myQ = d.myGoals.filter((g) => g.kind === "四半期");
  const myM = d.myGoals.filter((g) => g.kind === "月");
  const fbs = d.myGoals.filter((g) => g.fb);
  const [y, m, day] = d.today.split("-").map(Number);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-2xl font-bold">
          ホーム <span className="text-sm font-normal text-gray-500">{d.viewer.name}さん</span>
        </h2>
        <p className="text-sm text-gray-500">
          {y}年{m}月{day}日 ・ {d.term}{" "}
          <span className="rounded px-1.5 py-0.5 text-xs text-white" style={{ background: qs?.color }}>{d.quarterLabel}</span>
        </p>
      </div>

      {(d.vision || d.theme) && (
        <Card className="bg-white shadow-sm">
          <CardContent className="space-y-2 py-4">
            {d.vision && (
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-gray-500">VISION</p>
                <RichText text={d.vision} className="text-base font-medium" />
              </div>
            )}
            {d.theme && (
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-gray-500">{d.term}のテーマ</p>
                <RichText text={d.theme} className="text-sm" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {d.pinned.length > 0 && (
        <div className="space-y-2">
          {d.pinned.map((p) => (
            <div key={p.id} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-semibold text-amber-900">📌 {p.title}</p>
              {p.body && <RichText text={p.body} className="mt-0.5 text-sm text-amber-900/90" />}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="bg-white shadow-sm">
          <CardContent className="py-3">
            <SectionTitle href="/roadmap/board#calendar" more="カレンダー">これからの予定</SectionTitle>
            {d.events.length ? (
              <div className="divide-y">
                {d.events.map((e) => <EventLine key={e.id} e={e} today={d.today} />)}
              </div>
            ) : (
              <p className="text-xs text-gray-400">1か月以内の予定はありません</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm">
          <CardContent className="py-3">
            <SectionTitle href="/roadmap/board">掲示板</SectionTitle>
            {d.recent.length ? (
              <ul className="divide-y">
                {d.recent.map((p) => (
                  <li key={p.id} className="py-1.5">
                    <Link href={`/roadmap/board#post-${p.id}`} className="flex items-baseline gap-2 text-sm hover:underline">
                      <span className="w-10 shrink-0 text-xs text-gray-500">{fmtDate(p.createdAt)}</span>
                      <span className="min-w-0 truncate">{p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">まだ投稿はありません</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm">
        <CardContent className="py-3">
          <SectionTitle href="/roadmap/biz-goals">会社の目標</SectionTitle>
          {yearGoals.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs text-gray-500">年間</p>
              <ul className="space-y-1">
                {yearGoals.map((g) => <BizLine key={g.id} g={g} />)}
              </ul>
            </div>
          )}
          <div className="rounded border-l-4 pl-2" style={{ borderColor: qs?.color, background: qs?.bg }}>
            <p className="py-1 text-xs font-medium" style={{ color: qs?.color }}>今の四半期：{d.quarterLabel}</p>
            {qGoals.length ? (
              <ul className="space-y-1 pb-2">
                {qGoals.map((g) => <BizLine key={g.id} g={g} />)}
              </ul>
            ) : (
              <p className="pb-2 text-xs text-gray-400">未登録</p>
            )}
          </div>
          {d.monthGoals.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-gray-500">{Number(d.month.slice(5))}月の事業別目標</p>
              <ul className="space-y-1">
                {d.monthGoals.map((g) => (
                  <li key={g.id} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 text-[11px] text-gray-600">{g.dept}</span>
                    <span className="min-w-0 flex-1">
                      {g.goal}
                      {(g.target || g.actual) && (
                        <span className="ml-1 text-xs text-gray-500">（{g.target || "—"} → {g.actual || "未入力"}）</span>
                      )}
                    </span>
                    <StatusChip s={g.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {d.viewer.memberId && (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-3">
            <SectionTitle href="/roadmap/my-goals" more="私の目標">
              私の目標 <span className="text-xs font-normal text-gray-500">🔒 あなたと社長だけに見えています</span>
            </SectionTitle>
            {!myQ.length && !myM.length && (
              <p className="text-xs text-gray-400">
                今の四半期の目標がまだありません。<Link href="/roadmap/my-goals" className="text-blue-600">私の目標</Link>から入れてください。
              </p>
            )}
            {myQ.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 text-xs text-gray-500">マイルストーン（{d.quarterLabel}）</p>
                <ul className="space-y-1">
                  {myQ.map((g) => <MyLine key={g.id} g={g} />)}
                </ul>
              </div>
            )}
            {myM.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 text-xs text-gray-500">{Number(d.month.slice(5))}月の目標</p>
                <ul className="space-y-1">
                  {myM.map((g) => <MyLine key={g.id} g={g} />)}
                </ul>
              </div>
            )}
            {fbs.length > 0 && (
              <div className="mt-2 space-y-1">
                {fbs.map((g) => (
                  <div key={g.id} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-900">
                    <b className="mr-2">社長FB</b>
                    <span className="text-indigo-700/70">「{g.goal}」</span> {g.fb}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BizLine({ g }: { g: BizGoalRow }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{g.goal}</span>
        {(g.target || g.actual) && (
          <span className="ml-1 text-xs text-gray-500">
            （{g.kpi ? `${g.kpi}：` : ""}{g.target || "—"} → {g.actual || "未入力"}）
          </span>
        )}
        {g.owner && <span className="ml-1 text-[11px] text-gray-400">担当 {g.owner}</span>}
      </span>
      <StatusChip s={g.status} />
    </li>
  );
}

function MyLine({ g }: { g: MyGoal }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="min-w-0 flex-1">
        {g.goal}
        {g.qtype === "定量" && (g.target || g.result) && (
          <span className="ml-1 text-xs text-gray-500">
            （{g.target || "—"} → {g.result || "未入力"}
            {g.achievement !== null && <b className="ml-1 text-gray-700">{g.achievement}%</b>}）
          </span>
        )}
      </span>
      <StatusChip s={g.kind === "四半期" ? g.status : g.progress} />
    </li>
  );
}
