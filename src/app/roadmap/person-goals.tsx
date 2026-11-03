"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GOAL_STATUSES, GRADES, PROGRESS, QUARTERS, QUARTER_STYLE,
  achievement, monthsOfQuarter, quarterOfMonth,
} from "@/lib/roadmap/goal-rules";

export interface Goal {
  id: string;
  memberId: string;
  term: string;
  kind: string;
  quarter: string | null;
  month: string | null;
  parentId: string | null;
  bizGoalId: string | null;
  qtype: string;
  goal: string;
  criteria: string | null;
  kpi: string | null;
  target: string | null;
  result: string | null;
  progress: string | null;
  weight: number | null;
  selfGrade: string | null;
  selfComment: string | null;
  fb: string | null;
  ceoGrade?: string | null;
  ceoComment?: string | null;
  status: string;
  updatedAt: string;
}

export interface BizGoalOpt { id: string; grain: string; period: string; goal: string }

export interface GoalsData {
  term: string;
  termStart: string;
  today: string;
  goals: Goal[];
  bizGoals: BizGoalOpt[];
}

const LOCK_MSG: Record<string, string> = {
  設定中: "目標を入力したら社長と面談 → 社長が「合意済」にします。",
  合意済: "目標は合意済みです。実績・結果は随時入れてください。四半期末に社長が「評価中」に切り替えます。",
  評価中: "実績・結果と本人評価を入力してください。",
  確定: "評価が確定しました。",
};

const STATUS_COLOR: Record<string, string> = {
  設定中: "bg-gray-100 text-gray-700",
  合意済: "bg-blue-100 text-blue-800",
  評価中: "bg-amber-100 text-amber-800",
  確定: "bg-emerald-100 text-emerald-800",
  未着手: "bg-gray-100 text-gray-600",
  進行中: "bg-blue-50 text-blue-700",
  達成: "bg-emerald-100 text-emerald-800",
  未達: "bg-rose-100 text-rose-700",
};

const fmtUpdated = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 1人分を1年まとめて：年間目標 → 1Q〜4Q のマイルストーン（評価S〜Dはこの単位）→ 各3か月の月目標
export function PersonGoals({
  memberId, asCeo, data, onChanged,
}: {
  memberId: string;
  asCeo: boolean;
  data: GoalsData;
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const mine = data.goals.filter((g) => g.memberId === memberId);
  const yearGoals = mine.filter((g) => g.kind === "年間");
  const curMonth = data.today.slice(0, 7);
  const curQ = quarterOfMonth(curMonth);
  const k = (s: string) => `${s}-${memberId}`;

  const ctx = { asCeo, mine, data, edit, setEdit, onChanged, memberId };

  return (
    <div className="space-y-4">
      <section>
        <h4 className="font-semibold text-sm mb-2">
          年間目標 <span className="text-xs text-gray-500 font-normal">{data.term}（3月〜翌2月）</span>
        </h4>
        <div className="space-y-2">
          {yearGoals.map((g) => <SimpleCard key={g.id} g={g} {...ctx} parents={[]} />)}
          {!yearGoals.length && <p className="text-xs text-gray-400">未登録</p>}
          {edit === k("ny") ? (
            <GoalForm {...ctx} isNewCtx={{ kind: "年間" }} />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEdit(k("ny"))}>＋ 年間目標</Button>
          )}
        </div>
      </section>

      {QUARTERS.map((q) => {
        const qs = QUARTER_STYLE[q];
        const qGoals = mine.filter((g) => g.kind === "四半期" && g.quarter === q);
        const mGoals = mine.filter((g) => g.kind === "月" && g.quarter === q);
        const now = q === curQ;
        const wsum = qGoals.reduce((a, g) => a + (g.weight || 0), 0);
        return (
          <section
            key={q}
            className={`rounded-md border-l-4 p-3 ${now ? "ring-2 ring-offset-1" : ""}`}
            style={{ borderLeftColor: qs.color, background: qs.bg, ...(now && { ["--tw-ring-color" as string]: qs.color }) }}
          >
            <h4 className="font-semibold text-sm mb-2 flex flex-wrap items-center gap-2">
              <span style={{ color: qs.color }}>{qs.label} マイルストーン</span>
              {now && <span className="text-[10px] rounded px-1.5 py-0.5 text-white" style={{ background: qs.color }}>今</span>}
              <span className="text-xs text-gray-500 font-normal">評価（S〜D）はこの単位</span>
              {qGoals.length > 0 && (
                <span className={`text-xs font-normal ${wsum === 100 ? "text-gray-500" : "text-rose-600"}`}>
                  ウェイト合計 {wsum}%{wsum === 100 ? "" : "（100%に）"}
                </span>
              )}
            </h4>
            <div className="space-y-2">
              {qGoals.map((g) => <MilestoneCard key={g.id} g={g} {...ctx} />)}
              {!qGoals.length && <p className="text-xs text-gray-400">未登録</p>}
              {edit === k("nq-" + q) ? (
                <GoalForm {...ctx} isNewCtx={{ kind: "四半期", quarter: q }} />
              ) : (
                <Button size="sm" variant="outline" className="bg-white" onClick={() => setEdit(k("nq-" + q))}>
                  ＋ {q.slice(1)}Qのマイルストーン
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
              {monthsOfQuarter(data.termStart, q).map((m) => {
                const list = mGoals.filter((g) => g.month === m.key);
                const isNow = m.key === curMonth;
                return (
                  <div key={m.key} className={`rounded border bg-white p-2 space-y-2 ${isNow ? "border-2" : ""}`} style={isNow ? { borderColor: qs.color } : undefined}>
                    <p className="text-xs font-medium flex items-center gap-1">
                      {m.m}月
                      {isNow && <span className="text-[10px] rounded px-1 text-white" style={{ background: qs.color }}>今月</span>}
                    </p>
                    {list.map((g) => <SimpleCard key={g.id} g={g} {...ctx} parents={qGoals} />)}
                    {!list.length && <p className="text-[11px] text-gray-400">未設定</p>}
                    {edit === k("nm-" + m.key) ? (
                      <GoalForm {...ctx} isNewCtx={{ kind: "月", quarter: q, month: m.key }} />
                    ) : (
                      <button type="button" className="text-xs text-blue-600" onClick={() => setEdit(k("nm-" + m.key))}>＋ {m.m}月</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface Ctx {
  asCeo: boolean;
  mine: Goal[];
  data: GoalsData;
  edit: string | null;
  setEdit: (k: string | null) => void;
  onChanged: () => void;
  memberId: string;
}

function QtypeChip({ g }: { g: Goal }) {
  return (
    <span className={`text-[10px] rounded px-1.5 py-0.5 mr-1 ${g.qtype === "定性" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
      {g.qtype || "定量"}
    </span>
  );
}

function ResultLines({ g }: { g: Goal }) {
  if (g.qtype === "定性") {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-gray-500">達成基準</dt><dd>{g.criteria || "—"}</dd>
        <dt className="text-gray-500">結果</dt><dd>{g.result || <span className="text-gray-400">未入力</span>}</dd>
      </dl>
    );
  }
  const p = achievement(g);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      <dt className="text-gray-500">指標</dt><dd>{g.kpi || "—"}</dd>
      <dt className="text-gray-500">目標値 → 実績</dt>
      <dd>
        {g.target || "—"} → <b>{g.result || "—"}</b>
        {p !== null && <span className={p >= 100 ? "text-emerald-700" : "text-rose-600"}>（{p}%）</span>}
      </dd>
      {g.criteria && (<><dt className="text-gray-500">補足</dt><dd>{g.criteria}</dd></>)}
    </dl>
  );
}

function FbBox({ fb, showEmpty }: { fb: string | null; showEmpty?: boolean }) {
  if (!fb && !showEmpty) return null;
  return (
    <div className={`mt-2 rounded border-l-4 px-2 py-1 text-xs ${fb ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
      <b className="mr-2">社長FB</b>{fb || "まだありません"}
    </div>
  );
}

// 年間目標・月目標のカード
function SimpleCard({ g, parents, ...ctx }: Ctx & { g: Goal; parents: Goal[] }) {
  if (ctx.edit === g.id) return <GoalForm {...ctx} goal={g} />;
  const par = parents.find((p) => p.id === g.parentId);
  const canEdit = ctx.asCeo || g.status !== "確定";
  return (
    <div className="rounded border bg-white p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium"><QtypeChip g={g} />{g.goal}</p>
        {g.progress && <span className={`text-[10px] rounded px-1.5 py-0.5 shrink-0 ${STATUS_COLOR[g.progress] || ""}`}>{g.progress}</span>}
      </div>
      {par && <p className="text-[11px] text-gray-500 mt-0.5">↳ {par.goal}</p>}
      <div className="mt-1"><ResultLines g={g} /></div>
      {g.selfComment && <p className="text-xs mt-1"><span className="text-gray-500 mr-2">振り返り</span>{g.selfComment}</p>}
      <FbBox fb={g.fb} />
      {canEdit && (
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" onClick={() => ctx.setEdit(g.id)}>{ctx.asCeo ? "編集・FB" : "実績を入力・編集"}</Button>
          <DeleteButton g={g} {...ctx} />
        </div>
      )}
    </div>
  );
}

// 四半期マイルストーン（評価・ウェイト・状態はこの単位）
function MilestoneCard({ g, ...ctx }: Ctx & { g: Goal }) {
  if (ctx.edit === g.id) return <GoalForm {...ctx} goal={g} />;
  const st = g.status;
  const canPlan = ctx.asCeo || st === "設定中";
  const canRes = ctx.asCeo || st !== "確定";
  const year = ctx.mine.find((x) => x.id === g.parentId && x.kind === "年間");
  const biz = ctx.data.bizGoals.find((b) => b.id === g.bizGoalId);
  const showCeo = ctx.asCeo || st === "確定";
  return (
    <div className="rounded border bg-white p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium"><QtypeChip g={g} />{g.goal}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-gray-500">{g.weight ?? 0}%</span>
          <span className={`text-[10px] rounded px-1.5 py-0.5 ${STATUS_COLOR[st] || ""}`}>{st}</span>
        </div>
      </div>
      {year && <p className="text-[11px] text-gray-500 mt-0.5">↳ 年間：{year.goal}</p>}
      {biz && <p className="text-[11px] text-indigo-700 mt-0.5">↳ 会社の目標（{biz.period}）：{biz.goal}</p>}
      <div className="mt-1"><ResultLines g={g} /></div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs mt-1">
        {g.selfComment && (<><dt className="text-gray-500">振り返り</dt><dd>{g.selfComment}</dd></>)}
        <dt className="text-gray-500">本人評価</dt><dd>{g.selfGrade || "—"}</dd>
        <dt className="text-gray-500">社長評価</dt>
        <dd>
          {showCeo ? (
            <>{g.ceoGrade || "—"}{g.ceoComment && <span className="text-gray-500 ml-2">{g.ceoComment}</span>}</>
          ) : (
            <span className="text-gray-400">確定後に表示</span>
          )}
        </dd>
      </dl>
      <FbBox fb={g.fb} showEmpty />
      {!ctx.asCeo && <p className="text-[11px] text-gray-500 mt-1">{LOCK_MSG[st]}</p>}
      <div className="flex items-center gap-2 mt-2">
        {(canPlan || canRes) && (
          <Button size="sm" variant="outline" onClick={() => ctx.setEdit(g.id)}>
            {ctx.asCeo ? "編集・FB・評価" : canPlan ? "編集" : "実績・評価を入力"}
          </Button>
        )}
        {(ctx.asCeo || st === "設定中") && <DeleteButton g={g} {...ctx} />}
        <span className="ml-auto text-[11px] text-gray-400">更新 {fmtUpdated(g.updatedAt)}</span>
      </div>
    </div>
  );
}

function DeleteButton({ g, onChanged }: Ctx & { g: Goal }) {
  async function del() {
    if (!confirm("この目標を削除しますか？")) return;
    const res = await fetch(`/api/roadmap/goals/${g.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || "削除できませんでした");
      return;
    }
    onChanged();
  }
  return <Button size="sm" variant="ghost" className="text-gray-500" onClick={del}>削除</Button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <label className="text-[11px] text-gray-500">{label}</label>
      {children}
    </div>
  );
}

const selectCls = "w-full border rounded-md px-2 py-1.5 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400";
const areaCls = "w-full border rounded-md px-2 py-1.5 text-sm min-h-[56px] disabled:bg-gray-50 disabled:text-gray-400";

// 目標の入力フォーム（新規 or 編集）。状態によって触れる欄が変わる（サーバー側でも同じ判定）
function GoalForm({
  goal, isNewCtx, asCeo, mine, data, setEdit, onChanged, memberId,
}: Ctx & { goal?: Goal; isNewCtx?: { kind: string; quarter?: string; month?: string } }) {
  const isNew = !goal;
  const kind = goal?.kind ?? isNewCtx!.kind;
  const quarter = goal?.quarter ?? isNewCtx?.quarter ?? null;
  const month = goal?.month ?? isNewCtx?.month ?? null;
  const st = goal?.status ?? "設定中";
  const isMonth = kind === "月";
  const isYear = kind === "年間";
  const isQ = kind === "四半期";
  const planOk = asCeo || isMonth || st === "設定中";
  const resOk = asCeo || st !== "確定";
  const selfOk = asCeo || st === "評価中";

  const [f, setF] = useState({
    qtype: goal?.qtype ?? "定量",
    parentId: goal?.parentId ?? "",
    bizGoalId: goal?.bizGoalId ?? "",
    weight: goal?.weight == null ? "" : String(goal.weight),
    goal: goal?.goal ?? "",
    kpi: goal?.kpi ?? "",
    target: goal?.target ?? "",
    criteria: goal?.criteria ?? "",
    result: goal?.result ?? "",
    progress: goal?.progress ?? "",
    selfComment: goal?.selfComment ?? "",
    selfGrade: goal?.selfGrade ?? "",
    fb: goal?.fb ?? "",
    ceoGrade: goal?.ceoGrade ?? "",
    ceoComment: goal?.ceoComment ?? "",
    status: st,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof f, v: string) => setF((p) => ({ ...p, [key]: v }));

  const parents = isMonth
    ? mine.filter((x) => x.kind === "四半期" && x.quarter === quarter)
    : isQ
      ? mine.filter((x) => x.kind === "年間")
      : [];
  // 同じ四半期の会社目標を先に、年間・他の四半期は後ろに
  const bizOpts = [...data.bizGoals].sort((a, b) => Number(b.period === quarter) - Number(a.period === quarter));

  const heading = isMonth
    ? `月目標：${Number(month?.slice(5, 7))}月`
    : isYear
      ? `年間目標：${data.term}（3月〜翌2月）`
      : `マイルストーン（四半期目標）：${QUARTER_STYLE[quarter || "Q1"].label}`;

  async function save() {
    if (!f.goal.trim()) {
      setError("目標を入力してください");
      return;
    }
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = {
      qtype: f.qtype, goal: f.goal, kpi: f.kpi, target: f.target, criteria: f.criteria,
      result: f.result, selfComment: f.selfComment,
      ...(!isYear && { parentId: f.parentId || null }),
      ...(isQ && { weight: f.weight, bizGoalId: f.bizGoalId || null }),
      ...(!isQ && { progress: f.progress || null }),
      ...(isQ && !isNew && { selfGrade: f.selfGrade || null }),
      ...(asCeo && { fb: f.fb }),
      ...(asCeo && isQ && !isNew && { ceoGrade: f.ceoGrade || null, ceoComment: f.ceoComment, status: f.status }),
    };
    if (isNew) Object.assign(body, { kind, quarter, month, memberId });
    const res = await fetch(isNew ? "/api/roadmap/goals" : `/api/roadmap/goals/${goal!.id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "保存できませんでした");
      return;
    }
    setEdit(null);
    onChanged();
  }

  return (
    <div className="rounded border-2 border-blue-300 bg-white p-3 space-y-2 text-sm">
      <p className="text-xs text-gray-500">{heading}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="区分">
          <select value={f.qtype} onChange={(e) => set("qtype", e.target.value)} disabled={!planOk} className={selectCls}>
            <option>定量</option>
            <option>定性</option>
          </select>
        </Field>
        {!isYear && (
          <div className="col-span-2">
            <Field label={isMonth ? "どのマイルストーンの（任意）" : "どの年間目標の（任意）"}>
              <select value={f.parentId} onChange={(e) => set("parentId", e.target.value)} disabled={!planOk} className={selectCls}>
                <option value="">—</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{p.goal}</option>)}
              </select>
            </Field>
          </div>
        )}
        {isQ && (
          <Field label="ウェイト(%)">
            <Input type="number" min={0} max={100} value={f.weight} onChange={(e) => set("weight", e.target.value)} disabled={!planOk} />
          </Field>
        )}
      </div>
      {isQ && (
        <Field label="どの会社の目標に効くか（任意）">
          <select value={f.bizGoalId} onChange={(e) => set("bizGoalId", e.target.value)} disabled={!planOk} className={selectCls}>
            <option value="">—</option>
            {bizOpts.map((b) => <option key={b.id} value={b.id}>{b.period === "年間" ? "年間" : b.period}：{b.goal}</option>)}
          </select>
        </Field>
      )}
      <Field label="目標">
        <Input value={f.goal} onChange={(e) => set("goal", e.target.value)} disabled={!planOk} placeholder="例）新規の卸先を開拓する" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field label="指標（定量）">
            <Input value={f.kpi} onChange={(e) => set("kpi", e.target.value)} disabled={!planOk} placeholder="例）新規取引先数" />
          </Field>
        </div>
        <Field label="目標値（定量）">
          <Input value={f.target} onChange={(e) => set("target", e.target.value)} disabled={!planOk} placeholder="例）5" />
        </Field>
      </div>
      <Field label="達成基準（定性：どうなったら達成か／定量：補足）">
        <textarea value={f.criteria} onChange={(e) => set("criteria", e.target.value)} disabled={!planOk} className={areaCls} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <div className={isQ ? "col-span-3" : "col-span-2"}>
          <Field label="実績・結果（定量は数字、定性は何ができたか）">
            <Input value={f.result} onChange={(e) => set("result", e.target.value)} disabled={!resOk} />
          </Field>
        </div>
        {!isQ && (
          <Field label="進捗">
            <select value={f.progress} onChange={(e) => set("progress", e.target.value)} disabled={!resOk} className={selectCls}>
              <option value="">—</option>
              {PROGRESS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        )}
      </div>
      <Field label="振り返り（本人）">
        <textarea value={f.selfComment} onChange={(e) => set("selfComment", e.target.value)} disabled={!resOk} className={areaCls} />
      </Field>
      {isQ && !isNew && (
        <div className="max-w-[140px]">
          <Field label="本人評価">
            <select value={f.selfGrade} onChange={(e) => set("selfGrade", e.target.value)} disabled={!selfOk} className={selectCls}>
              <option value="">—</option>
              {GRADES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>
      )}
      {asCeo && (
        <Field label="社長FB（いつでも本人に見えます）">
          <textarea value={f.fb} onChange={(e) => set("fb", e.target.value)} className={areaCls} />
        </Field>
      )}
      {asCeo && isQ && !isNew && (
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <Field label="社長評価">
            <select value={f.ceoGrade} onChange={(e) => set("ceoGrade", e.target.value)} className={selectCls}>
              <option value="">—</option>
              {GRADES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="社長コメント（確定後に本人に表示）">
            <textarea value={f.ceoComment} onChange={(e) => set("ceoComment", e.target.value)} className={areaCls} />
          </Field>
          <Field label="状態">
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className={selectCls}>
              {GOAL_STATUSES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>キャンセル</Button>
      </div>
    </div>
  );
}
