"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ean13Barcode } from "@/components/ean13-barcode";
import { Search } from "lucide-react";
import { isValidEan13 } from "@/lib/ean13";
import { JanFormFields, JanFormValues, emptyJanForm } from "../jan-form";

interface PrefixOpt { id: string; prefix: string; label: string | null; rangeStart: number; rangeEnd: number; active: boolean }
interface Candidate { jan: string; itemCode: number; state: "free" | "reserved" | "new"; memo: string | null }
interface PlanRow { jan: string; pattern: string; error?: string }

const STATE_LABEL = { free: "空き", reserved: "確保", new: "台帳未登録" } as const;
const SHOW_CANDIDATES = 12;
const FETCH_CANDIDATES = 50; // 色違いをまとめて登録するときは選んだ番号から順に使う

export default function JanNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">読み込み中...</div>}>
      <JanNew />
    </Suspense>
  );
}

function JanNew() {
  const copyId = useSearchParams().get("copy");

  const [prefixes, setPrefixes] = useState<PrefixOpt[]>([]);
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [jan, setJan] = useState("");
  const [manual, setManual] = useState(false);
  const [bulk, setBulk] = useState("");
  const [copyLabel, setCopyLabel] = useState("");
  const [form, setForm] = useState<JanFormValues>(emptyJanForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: string; jan: string; pattern: string }[]>([]);

  const search = useCallback(async (p: string, f: string) => {
    if (!p) return;
    setSearching(true);
    setError("");
    const res = await fetch(`/api/jan/next?prefix=${p}&from=${encodeURIComponent(f)}&count=${FETCH_CANDIDATES}`);
    const d = await res.json();
    setSearching(false);
    if (!res.ok) {
      setError(d.error || "空き番号を探せませんでした");
      setCandidates([]);
      return;
    }
    setCandidates(d.candidates);
    setJan(d.candidates[0]?.jan || "");
    if (!d.candidates.length) setError(`品目コード ${f} 以降（〜${d.rangeEnd}）に空き番号がありません。事業者コードか開始番号を変えてください。`);
  }, []);

  // 初期表示：事業者コード一覧。コピー元があれば中身と「同じ事業者コードの次の番号」を初期値に
  useEffect(() => {
    (async () => {
      const ps: PrefixOpt[] = await (await fetch("/api/jan/prefixes")).json();
      const active = ps.filter((p) => p.active);
      setPrefixes(active);
      if (copyId) {
        const res = await fetch(`/api/jan/${copyId}`);
        if (res.ok) {
          const s = await res.json();
          setCopyLabel(`${s.jan}（${s.productName || s.nameOther || ""}${s.patternCode ? " " + s.patternCode : ""}）`);
          setForm({
            ...emptyJanForm,
            productName: s.productName || "",
            nameOther: s.nameOther || "",
            patternCode: s.patternCode || "",
            productId: s.productId || "",
            brand: s.brand || "",
            price: s.price == null ? "" : String(s.price),
            channels: s.channels || "",
          });
          const f = String(s.itemCode + 1);
          setPrefix(s.companyPrefix);
          setFrom(f);
          search(s.companyPrefix, f);
          return;
        }
      }
      if (active[0]) {
        setPrefix(active[0].prefix);
        setFrom(String(active[0].rangeStart));
      }
    })();
  }, [copyId, search]);

  const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);

  // 登録する番号の一覧（まとめて登録の欄が空なら1件）
  const plan: PlanRow[] = useMemo(() => {
    if (!lines.length) return jan ? [{ jan, pattern: form.patternCode }] : [];
    if (manual) {
      return lines.map((l) => {
        const m = l.match(/^([\d\s-]{12,})\s*(.*)$/);
        const j = m ? m[1].replace(/\D/g, "") : "";
        return { jan: j, pattern: m ? m[2].trim() : l, error: !m ? "JANがありません" : !isValidEan13(j) ? "チェックデジット不一致" : undefined };
      });
    }
    const start = Math.max(0, candidates.findIndex((c) => c.jan === jan));
    return lines.map((l, i) => {
      const c = candidates[start + i];
      return { jan: c?.jan ?? "", pattern: l, error: c ? undefined : "空き番号が足りません" };
    });
  }, [lines.join("\n"), manual, jan, candidates, form.patternCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const prefixOf = (j: string) => prefixes.find((p) => j.startsWith(p.prefix));
  const planErrors = plan.filter((r) => r.error || !isValidEan13(r.jan) || !prefixOf(r.jan));
  const janOk = isValidEan13(jan);

  async function save() {
    if (!plan.length || planErrors.length) {
      setError("登録できない番号があります。チェックデジットと事業者コードを確認してください");
      return;
    }
    setSaving(true);
    setError("");
    const ok: { id: string; jan: string; pattern: string }[] = [];
    for (const r of plan) {
      const res = await fetch("/api/jan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, patternCode: r.pattern, jan: r.jan, prefix: prefixOf(r.jan)?.prefix }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(`${r.jan}：${d.error || "登録に失敗しました"}${ok.length ? `（それより前の${ok.length}件は登録済み）` : ""}`);
        break;
      }
      ok.push({ id: d.id, jan: r.jan, pattern: r.pattern });
    }
    setSaving(false);
    setDone(ok);
    if (ok.length && !manual) search(prefix, from);
  }

  const cur = prefixes.find((p) => p.prefix === prefix);

  function setMode(m: boolean) {
    setManual(m);
    setJan("");
    setBulk("");
    // GJDBで発行済みの番号を入れる場合は登録済み、空き番号から出す場合はこれからGJDBに登録する
    setForm((f) => ({ ...f, gs1Registered: m }));
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Link href="/jan" className="text-gray-500 hover:text-gray-700 text-sm">← JAN台帳</Link>
      <h2 className="text-2xl font-bold">JANの新規登録</h2>
      <p className="text-xs text-gray-500">JANの発行はGS1（GJDB）が正です。GJDBで発行済みの番号を直接入力するか、空き番号を出してGJDBにも「手動付番」で登録してください。</p>
      {copyLabel && <p className="text-sm text-gray-600">コピー元：{copyLabel}</p>}

      {done.length > 0 && (
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="py-3 text-sm space-y-1">
            <p className="font-medium text-emerald-800">{done.length}件を登録しました{form.gs1Registered ? "" : "。GJDBにも登録してください"}</p>
            <div className="flex flex-wrap gap-1.5">
              {done.map((d) => (
                <Link key={d.id} href={`/jan/${d.id}`} className="text-xs border border-emerald-300 bg-white rounded px-2 py-1 hover:bg-emerald-100">
                  <span className="font-mono">{d.jan}</span> {d.pattern}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white shadow-sm">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium">1. 番号を決める</p>
            <div className="inline-flex rounded-md border overflow-hidden text-xs">
              <button type="button" onClick={() => setMode(false)} className={`px-3 py-1.5 ${!manual ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}>空き番号から採番</button>
              <button type="button" onClick={() => setMode(true)} className={`px-3 py-1.5 border-l ${manual ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}>GJDBで発行済みのJANを入力</button>
            </div>
          </div>
          {!manual ? (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-xs text-gray-500">事業者コード</label>
                  <select
                    value={prefix}
                    onChange={(e) => {
                      setPrefix(e.target.value);
                      const p = prefixes.find((x) => x.prefix === e.target.value);
                      setFrom(String(p?.rangeStart ?? 0));
                      setCandidates([]);
                      setJan("");
                    }}
                    className="block border rounded-md px-2 py-2 text-sm font-mono"
                  >
                    {prefixes.map((p) => (
                      <option key={p.id} value={p.prefix}>{p.prefix}{p.label ? `（${p.label}）` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">この品目コード以降で探す</label>
                  <Input value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="w-28 font-mono" />
                </div>
                <Button variant="outline" onClick={() => search(prefix, from)} disabled={!prefix || searching}>
                  <Search className="size-4 mr-1" /> {searching ? "探しています..." : "空き番号を探す"}
                </Button>
              </div>
              {cur && <p className="text-[11px] text-gray-400">この事業者コードの採番範囲：品目コード {cur.rangeStart}〜{cur.rangeEnd}（設定で変更できます）</p>}
              {candidates.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {candidates.slice(0, SHOW_CANDIDATES).map((c) => (
                    <label key={c.jan} className={`rounded border px-2 py-1.5 text-xs cursor-pointer ${jan === c.jan ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
                      <input type="radio" name="cand" className="sr-only" checked={jan === c.jan} onChange={() => setJan(c.jan)} />
                      <span className="font-mono text-sm">{c.jan}</span>
                      <span className="block text-gray-500">
                        品目 {c.itemCode}・{STATE_LABEL[c.state]}
                        {c.memo ? `（${c.memo}）` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          ) : (
            !lines.length && (
              <div>
                <label className="text-xs text-gray-500">JAN（13桁）</label>
                <Input value={jan} onChange={(e) => setJan(e.target.value.replace(/\D/g, "").slice(0, 13))} inputMode="numeric" className="w-48 font-mono" />
                {jan.length === 13 && !janOk && <p className="text-xs text-red-600 mt-1">チェックデジットが正しくありません。この番号は登録できません。</p>}
                {janOk && !prefixOf(jan) && <p className="text-xs text-amber-700 mt-1">登録されていない（または採番に使わない）事業者コードです。一覧の「設定」で確認してください。</p>}
              </div>
            )
          )}

          <div>
            <label className="text-xs text-gray-500">
              色違い・柄違いをまとめて登録（任意）— {manual ? "1行に「JAN 柄/カラー」" : "1行に1つの柄/カラー。選んだ番号から順に割り当てます"}
            </label>
            <textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={3}
              className="w-full border rounded-md px-2 py-1.5 text-sm font-mono"
              placeholder={manual ? "4570081715002 紺\n4570081715019 朱" : "紺\n朱\n生成り"}
            />
          </div>

          {plan.length > 0 && (
            <div className="rounded bg-gray-50 border px-3 py-2 text-xs space-y-0.5 max-h-48 overflow-y-auto">
              <p className="text-gray-500">登録される番号（{plan.length}件）</p>
              {plan.map((r, i) => {
                const bad = r.error || (!isValidEan13(r.jan) ? "チェックデジット不一致" : !prefixOf(r.jan) ? "事業者コードが未登録・無効" : "");
                return (
                  <p key={i} className={bad ? "text-red-600" : ""}>
                    <span className="font-mono">{r.jan || "-"}</span> {r.pattern || <span className="text-gray-400">（柄なし）</span>}
                    {bad && `　${bad}`}
                  </p>
                );
              })}
            </div>
          )}
          {plan.length === 1 && janOk && (
            <div className="border rounded p-2 inline-block bg-white">
              <Ean13Barcode jan={jan} moduleMm={0.3} heightMm={14} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm">
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-medium">2. 内容を入力{lines.length > 0 && <span className="text-xs text-gray-500 font-normal">（柄コードは上の一覧の値が入ります）</span>}</p>
          <JanFormFields values={form} onChange={setForm} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={save} disabled={!plan.length || planErrors.length > 0 || saving}>
              {saving ? "登録中..." : plan.length > 1 ? `${plan.length}件を登録` : "この番号で登録"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
