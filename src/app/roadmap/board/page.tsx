"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EVENT_CATEGORIES, EVENT_VISIBILITY, addDays, eventColor, overlaps } from "@/lib/roadmap/portal";
import { EventLine, Field, RichText, areaCls, errorOf, selectCls, type EventRow } from "../portal-ui";

interface Post { id: string; title: string; body: string; pinned: boolean; authorName: string; createdAt: string; updatedAt: string }

const todayJst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

export default function BoardPage() {
  return (
    <div className="max-w-5xl space-y-4">
      <h2 className="text-2xl font-bold">掲示板・会社カレンダー</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
        <BoardSection />
        <CalendarSection />
      </div>
    </div>
  );
}

// ───────────── 掲示板 ─────────────
function BoardSection() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [edit, setEdit] = useState<string | null>(null); // "new" | post.id
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/roadmap/board");
    if (!res.ok) return setError(await errorOf(res, "読み込めませんでした"));
    const j = await res.json();
    setPosts(j.posts);
    setCanPost(j.canPost);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ホームからのリンク（#post-xxx）で該当の投稿へ
  useEffect(() => {
    if (!posts || !location.hash.startsWith("#post-")) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [posts]);

  async function togglePin(p: Post) {
    const res = await fetch(`/api/roadmap/board/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !p.pinned }),
    });
    if (!res.ok) return alertError(await errorOf(res));
    load();
  }

  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="space-y-3 py-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">社内掲示板</h3>
          {canPost && edit !== "new" && (
            <Button size="sm" onClick={() => setEdit("new")}><Plus className="size-4" />投稿</Button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {edit === "new" && <PostForm onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} />}
        {!posts ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : !posts.length ? (
          <p className="text-sm text-gray-400">まだ投稿はありません{canPost ? "。「投稿」から書けます。" : ""}</p>
        ) : (
          <ul className="space-y-2">
            {posts.map((p) =>
              edit === p.id ? (
                <li key={p.id}><PostForm post={p} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} /></li>
              ) : (
                <li
                  key={p.id}
                  id={`post-${p.id}`}
                  className={`rounded border p-3 ${p.pinned ? "border-amber-200 bg-amber-50" : "bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{p.pinned && "📌 "}{p.title}</p>
                    {canPost && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" title={p.pinned ? "ピン留めを外す" : "ピン留め（ホームの上に出す）"} onClick={() => togglePin(p)}
                          className={`rounded p-1 hover:bg-gray-100 ${p.pinned ? "text-amber-600" : "text-gray-400"}`}>
                          <Pin className="size-4" />
                        </button>
                        <button type="button" className="text-xs text-blue-600" onClick={() => setEdit(p.id)}>編集</button>
                      </div>
                    )}
                  </div>
                  {p.body && <RichText text={p.body} className="mt-1 text-sm text-gray-800" />}
                  <p className="mt-1 text-[11px] text-gray-400">
                    {fmtDateTime(p.createdAt)}{p.authorName && ` ・ ${p.authorName}`}
                  </p>
                </li>
              )
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function alertError(msg: string) {
  // ブラウザのダイアログは使わず、画面の上に一時的に出す
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded bg-red-600 px-3 py-2 text-sm text-white shadow";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function PostForm({ post, onDone, onCancel }: { post?: Post; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [pinned, setPinned] = useState(post?.pinned ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!title.trim()) return setError("タイトルを入力してください");
    setSaving(true);
    const res = await fetch(post ? `/api/roadmap/board/${post.id}` : "/api/roadmap/board", {
      method: post ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, pinned }),
    });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res));
    onDone();
  }
  async function del() {
    setSaving(true);
    const res = await fetch(`/api/roadmap/board/${post!.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res, "削除できませんでした"));
    onDone();
  }

  return (
    <div className="space-y-2 rounded border-2 border-blue-300 bg-white p-3 text-sm">
      <Field label="タイトル"><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
      <Field label="本文"><textarea value={body} onChange={(e) => setBody(e.target.value)} className={areaCls} rows={5} /></Field>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        ピン留め（ホームのいちばん上に出す）
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中..." : post ? "保存" : "投稿する"}</Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>やめる</Button>
        {post && (
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

// ───────────── 会社カレンダー ─────────────
function monthGrid(ym: string): string[] {
  // 日曜はじまりの6週ぶん
  const first = `${ym}-01`;
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
const shiftMonth = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

function CalendarSection() {
  const today = todayJst();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [edit, setEdit] = useState<{ ev?: EventRow; date?: string } | null>(null);
  const [error, setError] = useState("");
  const days = useMemo(() => monthGrid(ym), [ym]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/roadmap/events?from=${days[0]}&to=${days[41]}`);
    if (!res.ok) return setError(await errorOf(res, "読み込めませんでした"));
    const j = await res.json();
    setEvents(j.events);
    setCanEdit(j.canEdit);
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const monthEvents = (events ?? []).filter((e) => overlaps(e, `${ym}-01`, `${ym}-31`));

  return (
    <Card className="bg-white shadow-sm" id="calendar">
      <CardContent className="space-y-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">会社カレンダー</h3>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" onClick={() => setYm(shiftMonth(ym, -1))} aria-label="前の月"><ChevronLeft className="size-4" /></Button>
            <span className="w-24 text-center text-sm font-medium">{ym.slice(0, 4)}年{Number(ym.slice(5))}月</span>
            <Button size="icon-sm" variant="outline" onClick={() => setYm(shiftMonth(ym, 1))} aria-label="次の月"><ChevronRight className="size-4" /></Button>
            {ym !== today.slice(0, 7) && (
              <Button size="sm" variant="ghost" onClick={() => setYm(today.slice(0, 7))}>今月</Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setEdit({ date: ym === today.slice(0, 7) ? today : `${ym}-01` })}><Plus className="size-4" />予定</Button>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {edit && <EventForm ev={edit.ev} date={edit.date} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} />}

        <div className="grid grid-cols-7 overflow-hidden rounded border text-xs">
          {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
            <div key={w} className={`border-b bg-gray-50 py-1 text-center font-medium ${i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-gray-600"}`}>{w}</div>
          ))}
          {days.map((d, i) => {
            const inMonth = d.slice(0, 7) === ym;
            const evs = (events ?? []).filter((e) => overlaps(e, d, d));
            return (
              <div
                key={d}
                onClick={canEdit && inMonth ? () => setEdit({ date: d }) : undefined}
                className={`min-h-16 border-b border-r p-0.5 ${i % 7 === 6 ? "border-r-0" : ""} ${inMonth ? "bg-white" : "bg-gray-50 text-gray-400"} ${canEdit && inMonth ? "cursor-pointer hover:bg-blue-50/40" : ""}`}
              >
                <div className={`mb-0.5 text-right text-[11px] ${d === today ? "font-bold" : ""}`}>
                  <span className={d === today ? "rounded-full bg-blue-600 px-1.5 text-white" : ""}>{Number(d.slice(8))}</span>
                </div>
                {evs.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); if (canEdit) setEdit({ ev: e }); }}
                    title={e.title}
                    className="mb-0.5 block w-full truncate rounded px-1 text-left text-[10px] leading-4 text-white"
                    style={{ background: eventColor(e.category), opacity: e.visibility === "社長のみ" ? 0.7 : 1 }}
                  >
                    {e.title}
                  </button>
                ))}
                {evs.length > 3 && <p className="px-1 text-[10px] text-gray-500">他{evs.length - 3}件</p>}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
          {EVENT_CATEGORIES.map((c) => (
            <span key={c.id} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: c.color }} />{c.id}</span>
          ))}
        </div>

        <div>
          <p className="mb-1 text-xs text-gray-500">{Number(ym.slice(5))}月の予定</p>
          {!events ? (
            <p className="text-sm text-gray-400">読み込み中...</p>
          ) : monthEvents.length ? (
            <div className="divide-y">
              {monthEvents.map((e) => <EventLine key={e.id} e={e} today={today} onClick={canEdit ? () => setEdit({ ev: e }) : undefined} />)}
            </div>
          ) : (
            <p className="text-xs text-gray-400">予定はありません</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EventForm({ ev, date, onDone, onCancel }: { ev?: EventRow; date?: string; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    startDate: ev?.startDate ?? date ?? todayJst(),
    endDate: ev?.endDate ?? "",
    category: ev?.category ?? "行事",
    title: ev?.title ?? "",
    detail: ev?.detail ?? "",
    visibility: ev?.visibility ?? "全員",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.title.trim()) return setError("タイトルを入力してください");
    setSaving(true);
    const res = await fetch(ev ? `/api/roadmap/events/${ev.id}` : "/api/roadmap/events", {
      method: ev ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res));
    onDone();
  }
  async function del() {
    setSaving(true);
    const res = await fetch(`/api/roadmap/events/${ev!.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res, "削除できませんでした"));
    onDone();
  }

  return (
    <div className="space-y-2 rounded border-2 border-blue-300 bg-white p-3 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="開始日"><Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="終了日（1日なら空）"><Input type="date" value={f.endDate} min={f.startDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
        <Field label="区分">
          <select value={f.category} onChange={(e) => set("category", e.target.value)} className={selectCls}>
            {EVENT_CATEGORIES.map((c) => <option key={c.id}>{c.id}</option>)}
            {f.category && !EVENT_CATEGORIES.some((c) => c.id === f.category) && <option>{f.category}</option>}
          </select>
        </Field>
        <Field label="公開範囲">
          <select value={f.visibility} onChange={(e) => set("visibility", e.target.value)} className={selectCls}>
            {EVENT_VISIBILITY.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <Field label="タイトル"><Input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus /></Field>
      <Field label="詳細"><textarea value={f.detail} onChange={(e) => set("detail", e.target.value)} className={areaCls} /></Field>
      {f.visibility === "社長のみ" && <p className="text-[11px] text-gray-500">「社長のみ」の予定は、スタッフ・パートには送られません。</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中..." : ev ? "保存" : "追加"}</Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>やめる</Button>
        {ev && (
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
