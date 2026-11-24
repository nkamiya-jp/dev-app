"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QUARTERS, QUARTER_STYLE, quarterOfMonth } from "@/lib/roadmap/goal-rules";
import { BIZ_PERIODS, BIZ_STATUSES } from "@/lib/roadmap/portal";
import { Field, RichText, StatusChip, areaCls, errorOf, selectCls } from "../portal-ui";

interface BizGoal {
  id: string; period: string; grain: string; goal: string; kpi: string | null; target: string | null; actual: string | null;
  owner: string | null; status: string | null; comment: string | null; sortOrder: number; canEdit: boolean;
  support: { people: number; milestones: number; avgAchievement: number | null };
  supporters?: { id: string; memberId: string; memberName: string; goal: string; status: string; weight: number | null; achievement: number | null }[];
}
interface MonthGoal {
  id: string; month: string; dept: string; goal: string; kpi: string | null; target: string | null; actual: string | null;
  ownerComment: string | null; ceoFb: string | null; status: string | null; canEdit: boolean;
}
interface Data {
  term: string; termStart: string; today: string; months: string[]; departments: string[];
  viewer: { name: string; isPresident: boolean; departments: string[] };
  goals: BizGoal[]; monthGoals: MonthGoal[];
}

type Edit = { type: "biz"; id?: string; period?: string } | { type: "month"; id?: string; month?: string; dept?: string } | null;

export default function BizGoalsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Edit>(null);
  const [month, setMonth] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/roadmap/biz-goals");
    if (!res.ok) return setError(await errorOf(res, "読み込めませんでした"));
    const j: Data = await res.json();
    setD(j);
    setMonth((cur) => cur || (j.months.includes(j.today.slice(0, 7)) ? j.today.slice(0, 7) : j.months[0]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="p-6 text-gray-500">{error}</div>;
  if (!d) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const isP = d.viewer.isPresident;
  const curQ = quarterOfMonth(d.today.slice(0, 7));
  const done = () => { setEdit(null); load(); };
  const ctx = { d, edit, setEdit, done };
  const yearGoals = d.goals.filter((g) => g.period === "年間");
  const monthRows = d.monthGoals.filter((m) => m.month === month);
  const depts = [...new Set([...d.departments, ...monthRows.map((m) => m.dept)])];

  return (
    <div className="max-w-5xl space-y-4">
      <h2 className="text-2xl font-bold">
        事業目標 <span className="text-sm font-normal text-gray-500">{d.term}（3月〜翌2月）</span>
      </h2>
      <p className="text-xs text-gray-500">
        会社全体の目標です。全員が見られます。
        {isP ? "社長はすべて編集できます。" : "担当が自分の部門の目標は、実績と状況を入れられます。"}
        「支える個人目標」は人数と平均達成率だけが出ます{isP ? "（社長には中身も出ます）" : ""}。
      </p>

      <Card className="bg-white shadow-sm">
        <CardContent className="space-y-2 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">年間目標</h3>
            {isP && <Button size="sm" variant="outline" onClick={() => setEdit({ type: "biz", period: "年間" })}><Plus className="size-4" />追加</Button>}
          </div>
          {edit?.type === "biz" && !edit.id && edit.period === "年間" && <BizForm {...ctx} period="年間" />}
          {!yearGoals.length && <p className="text-xs text-gray-400">未登録</p>}
          {yearGoals.map((g) => <BizItem key={g.id} g={g} {...ctx} />)}
        </CardContent>
      </Card>

      {QUARTERS.map((q) => {
        const qs = QUARTER_STYLE[q];
        const list = d.goals.filter((g) => g.period === q);
        const now = q === curQ;
        return (
          <div
            key={q}
            className={`rounded-md border-l-4 p-3 ${now ? "ring-2 ring-offset-1" : ""}`}
            style={{ borderColor: qs.color, background: qs.bg, ...(now && { ["--tw-ring-color" as string]: qs.color }) }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: qs.color }}>
                {qs.label}
                {now && <span className="rounded px-1.5 py-0.5 text-[10px] text-white" style={{ background: qs.color }}>今</span>}
              </h3>
              {isP && <Button size="sm" variant="outline" className="bg-white" onClick={() => setEdit({ type: "biz", period: q })}><Plus className="size-4" />追加</Button>}
            </div>
            <div className="space-y-2">
              {edit?.type === "biz" && !edit.id && edit.period === q && <BizForm {...ctx} period={q} />}
              {!list.length && <p className="text-xs text-gray-400">未登録</p>}
              {list.map((g) => <BizItem key={g.id} g={g} {...ctx} />)}
            </div>
          </div>
        );
      })}

      <Card className="bg-white shadow-sm">
        <CardContent className="space-y-3 py-3">
          <h3 className="font-semibold">事業別の月目標</h3>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {d.months.map((m) => {
              const qs = QUARTER_STYLE[quarterOfMonth(m)];
              const sel = m === month;
              const n = d.monthGoals.filter((x) => x.month === m).length;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonth(m)}
                  className={`shrink-0 rounded border px-2.5 py-1 text-xs ${sel ? "text-white" : "bg-white text-gray-700"}`}
                  style={sel ? { background: qs.color, borderColor: qs.color } : { borderColor: qs.color + "55" }}
                >
                  {Number(m.slice(5))}月
                  {m === d.today.slice(0, 7) && <span className="ml-0.5">●</span>}
                  {n > 0 && <span className={`ml-1 ${sel ? "text-white/80" : "text-gray-400"}`}>{n}</span>}
                </button>
              );
            })}
          </div>
          {depts.map((dept) => {
            const rows = monthRows.filter((m) => m.dept === dept);
            const mine = isP || d.viewer.departments.includes(dept);
            return (
              <div key={dept} className="rounded border">
                <div className="flex items-center justify-between border-b bg-gray-50 px-3 py-1.5">
                  <p className="text-sm font-medium">
                    {dept}
                    {!isP && mine && <span className="ml-2 text-[11px] font-normal text-blue-700">あなたの部門</span>}
                  </p>
                  {isP && (
                    <button type="button" className="text-xs text-blue-600" onClick={() => setEdit({ type: "month", month, dept })}>＋ 追加</button>
                  )}
                </div>
                <div className="space-y-2 p-2">
                  {edit?.type === "month" && !edit.id && edit.dept === dept && <MonthForm {...ctx} month={month} dept={dept} />}
                  {!rows.length && !(edit?.type === "month" && !edit.id && edit.dept === dept) && <p className="text-xs text-gray-400">未設定</p>}
                  {rows.map((m) =>
                    edit?.type === "month" && edit.id === m.id ? (
                      <MonthForm key={m.id} {...ctx} g={m} month={m.month} dept={m.dept} />
                    ) : (
                      <MonthItem key={m.id} g={m} onEdit={() => setEdit({ type: "month", id: m.id })} />
                    )
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

interface Ctx { d: Data; edit: Edit; setEdit: (e: Edit) => void; done: () => void }

function BizItem({ g, d, edit, setEdit, done }: Ctx & { g: BizGoal }) {
  if (edit?.type === "biz" && edit.id === g.id) return <BizForm d={d} edit={edit} setEdit={setEdit} done={done} g={g} period={g.period} />;
  return (
    <div className="rounded border bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{g.goal}</p>
        <div className="flex shrink-0 items-center gap-2">
          <StatusChip s={g.status} />
          {g.canEdit && <button type="button" className="text-xs text-blue-600" onClick={() => setEdit({ type: "biz", id: g.id })}>{d.viewer.isPresident ? "編集" : "実績を入れる"}</button>}
        </div>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {g.kpi && (<><dt className="text-gray-500">指標</dt><dd>{g.kpi}</dd></>)}
        {(g.target || g.actual) && (
          <>
            <dt className="text-gray-500">目標値 → 実績</dt>
            <dd>{g.target || "—"} → {g.actual || <span className="text-gray-400">未入力</span>}</dd>
          </>
        )}
        {g.owner && (<><dt className="text-gray-500">担当</dt><dd>{g.owner}</dd></>)}
      </dl>
      {g.comment && (
        <div className="mt-2 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-900">
          <b className="mr-2">社長コメント</b><RichText text={g.comment} className="inline" />
        </div>
      )}
      {g.grain === "四半期" && (
        <div className="mt-2 border-t pt-2 text-xs text-gray-600">
          この目標を支える個人目標：
          {g.support.people ? (
            <>
              <b>{g.support.people}人</b>（マイルストーン{g.support.milestones}件）
              {g.support.avgAchievement !== null && <> ・ 平均達成率 <b>{g.support.avgAchievement}%</b></>}
            </>
          ) : (
            <span className="text-gray-400">まだありません</span>
          )}
          {g.supporters && g.supporters.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {g.supporters.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{s.memberName}</span>
                  <span className="text-gray-700">{s.goal}</span>
                  <StatusChip s={s.status} />
                  {s.achievement !== null && <span className="text-gray-500">{s.achievement}%</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BizForm({ d, setEdit, done, g, period }: Ctx & { g?: BizGoal; period: string }) {
  const isP = d.viewer.isPresident;
  const [f, setF] = useState({
    period: g?.period ?? period,
    goal: g?.goal ?? "",
    kpi: g?.kpi ?? "",
    target: g?.target ?? "",
    actual: g?.actual ?? "",
    owner: g?.owner ?? "",
    status: g?.status ?? "",
    comment: g?.comment ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (isP && !f.goal.trim()) return setError("目標を入力してください");
    setSaving(true);
    const body = isP ? f : { actual: f.actual, status: f.status };
    const res = await fetch(g ? `/api/roadmap/biz-goals/${g.id}` : "/api/roadmap/biz-goals", {
      method: g ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res));
    done();
  }
  async function del() {
    setSaving(true);
    const res = await fetch(`/api/roadmap/biz-goals/${g!.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res, "削除できませんでした"));
    done();
  }

  return (
    <div className="space-y-2 rounded border-2 border-blue-300 bg-white p-3 text-sm">
      {!isP && <p className="font-medium">{g?.goal}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {isP && (
          <Field label="期間">
            <select value={f.period} onChange={(e) => set("period", e.target.value)} className={selectCls}>
              {BIZ_PERIODS.map((p) => <option key={p} value={p}>{p === "年間" ? "年間" : QUARTER_STYLE[p].label}</option>)}
            </select>
          </Field>
        )}
        {isP && <Field label="指標"><Input value={f.kpi} onChange={(e) => set("kpi", e.target.value)} /></Field>}
        {isP && <Field label="目標値"><Input value={f.target} onChange={(e) => set("target", e.target.value)} /></Field>}
        {!isP && <Field label="目標値"><Input value={f.target} disabled /></Field>}
        <Field label="実績"><Input value={f.actual} onChange={(e) => set("actual", e.target.value)} autoFocus={!isP} /></Field>
        {isP && <Field label="担当（部門・人）"><Input value={f.owner} onChange={(e) => set("owner", e.target.value)} placeholder="例：営業" /></Field>}
        <Field label="状況">
          <select value={f.status} onChange={(e) => set("status", e.target.value)} className={selectCls}>
            <option value="">—</option>
            {BIZ_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      {isP && <Field label="目標"><Input value={f.goal} onChange={(e) => set("goal", e.target.value)} autoFocus /></Field>}
      {isP && <Field label="社長コメント（全員に見えます）"><textarea value={f.comment} onChange={(e) => set("comment", e.target.value)} className={areaCls} /></Field>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中..." : g ? "保存" : "追加"}</Button>
        <Button size="sm" variant="outline" onClick={() => setEdit(null)} disabled={saving}>やめる</Button>
        {g && isP && (
          confirmDel ? (
            <span className="ml-auto flex items-center gap-2 text-xs">
              削除すると、ひも付いた個人目標は「会社の目標なし」になります。
              <Button size="sm" variant="destructive" onClick={del} disabled={saving}>削除する</Button>
              <button type="button" className="text-gray-500" onClick={() => setConfirmDel(false)}>戻る</button>
            </span>
          ) : (
            <button type="button" className="ml-auto text-xs text-red-600" onClick={() => setConfirmDel(true)}>削除</button>
          )
        )}
      </div>
    </div>
  );
}

function MonthItem({ g, onEdit }: { g: MonthGoal; onEdit: () => void }) {
  return (
    <div className="rounded border bg-white p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{g.goal}</p>
        <div className="flex shrink-0 items-center gap-2">
          <StatusChip s={g.status} />
          {g.canEdit && <button type="button" className="text-xs text-blue-600" onClick={onEdit}>編集</button>}
        </div>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {g.kpi && (<><dt className="text-gray-500">指標</dt><dd>{g.kpi}</dd></>)}
        {(g.target || g.actual) && (
          <>
            <dt className="text-gray-500">目標値 → 実績</dt>
            <dd>{g.target || "—"} → {g.actual || <span className="text-gray-400">未入力</span>}</dd>
          </>
        )}
        {g.ownerComment && (<><dt className="text-gray-500">担当コメント</dt><dd className="whitespace-pre-wrap">{g.ownerComment}</dd></>)}
      </dl>
      {g.ceoFb && (
        <div className="mt-1.5 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-900"><b className="mr-2">社長FB</b>{g.ceoFb}</div>
      )}
    </div>
  );
}

function MonthForm({ d, setEdit, done, g, month, dept }: Ctx & { g?: MonthGoal; month: string; dept: string }) {
  const isP = d.viewer.isPresident;
  const [f, setF] = useState({
    month: g?.month ?? month,
    dept: g?.dept ?? dept,
    goal: g?.goal ?? "",
    kpi: g?.kpi ?? "",
    target: g?.target ?? "",
    actual: g?.actual ?? "",
    ownerComment: g?.ownerComment ?? "",
    ceoFb: g?.ceoFb ?? "",
    status: g?.status ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (isP && !f.goal.trim()) return setError("目標を入力してください");
    setSaving(true);
    const body = isP ? f : { actual: f.actual, ownerComment: f.ownerComment, status: f.status };
    const res = await fetch(g ? `/api/roadmap/biz-month-goals/${g.id}` : "/api/roadmap/biz-month-goals", {
      method: g ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res));
    done();
  }
  async function del() {
    setSaving(true);
    const res = await fetch(`/api/roadmap/biz-month-goals/${g!.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res, "削除できませんでした"));
    done();
  }

  return (
    <div className="space-y-2 rounded border-2 border-blue-300 bg-white p-3 text-sm">
      {!isP && <p className="font-medium">{g?.goal}</p>}
      {isP && <Field label="目標"><Input value={f.goal} onChange={(e) => set("goal", e.target.value)} autoFocus /></Field>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {isP && (
          <Field label="事業・部門">
            <select value={f.dept} onChange={(e) => set("dept", e.target.value)} className={selectCls}>
              {[...new Set([...d.departments, f.dept])].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        )}
        {isP && <Field label="指標"><Input value={f.kpi} onChange={(e) => set("kpi", e.target.value)} /></Field>}
        <Field label="目標値"><Input value={f.target} onChange={(e) => set("target", e.target.value)} disabled={!isP} /></Field>
        <Field label="実績"><Input value={f.actual} onChange={(e) => set("actual", e.target.value)} autoFocus={!isP} /></Field>
        <Field label="状況">
          <select value={f.status} onChange={(e) => set("status", e.target.value)} className={selectCls}>
            <option value="">—</option>
            {BIZ_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="担当コメント"><textarea value={f.ownerComment} onChange={(e) => set("ownerComment", e.target.value)} className={areaCls} /></Field>
      {isP && <Field label="社長FB"><textarea value={f.ceoFb} onChange={(e) => set("ceoFb", e.target.value)} className={areaCls} /></Field>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中..." : g ? "保存" : "追加"}</Button>
        <Button size="sm" variant="outline" onClick={() => setEdit(null)} disabled={saving}>やめる</Button>
        {g && isP && (
          confirmDel ? (
            <span className="ml-auto flex items-center gap-2 text-xs">
              本当に削除しますか？
              <Button size="sm" variant="destructive" onClick={del} disabled={saving}>削除する</Button>
              <button type="button" className="text-gray-500" onClick={() => setConfirmDel(false)}>戻る</button>
            </span>
          ) : (
            <button type="button" className="ml-auto text-xs text-red-600" onClick={() => setConfirmDel(true)}>削除</button>
          )
        )}
      </div>
    </div>
  );
}
