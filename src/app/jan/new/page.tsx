"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ean13Barcode } from "@/components/ean13-barcode";
import { Search } from "lucide-react";
import { isValidEan13 } from "@/lib/ean13";
import { JanFormFields, JanFormValues, emptyJanForm } from "../jan-form";

interface PrefixOpt { id: string; prefix: string; label: string | null; rangeStart: number; rangeEnd: number; active: boolean }
interface Candidate { jan: string; itemCode: number; state: "free" | "reserved" | "new"; memo: string | null }

const STATE_LABEL = { free: "空き", reserved: "確保", new: "台帳未登録" } as const;

export default function JanNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">読み込み中...</div>}>
      <JanNew />
    </Suspense>
  );
}

function JanNew() {
  const router = useRouter();
  const copyId = useSearchParams().get("copy");

  const [prefixes, setPrefixes] = useState<PrefixOpt[]>([]);
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [jan, setJan] = useState("");
  const [manual, setManual] = useState(false);
  const [copyLabel, setCopyLabel] = useState("");
  const [form, setForm] = useState<JanFormValues>(emptyJanForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(async (p: string, f: string) => {
    if (!p) return;
    setSearching(true);
    setError("");
    const res = await fetch(`/api/jan/next?prefix=${p}&from=${encodeURIComponent(f)}&count=12`);
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
            note: "",
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

  const janOk = isValidEan13(jan);
  const janPrefix = prefixes.find((p) => jan.startsWith(p.prefix));

  async function save() {
    if (!janOk) {
      setError("JANのチェックデジットが正しくありません");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/jan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, jan, prefix: janPrefix?.prefix }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(d.error || "登録に失敗しました");
      return;
    }
    router.push(`/jan/${d.id}`);
  }

  const cur = prefixes.find((p) => p.prefix === prefix);

  return (
    <div className="space-y-4 max-w-4xl">
      <Link href="/jan" className="text-gray-500 hover:text-gray-700 text-sm">← JAN台帳</Link>
      <h2 className="text-2xl font-bold">JANの新規登録</h2>
      {copyLabel && <p className="text-sm text-gray-600">コピー元：{copyLabel}</p>}

      <Card className="bg-white shadow-sm">
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-medium">1. 番号を決める</p>
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
                  {candidates.map((c) => (
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
              <button type="button" onClick={() => { setManual(true); setJan(""); }} className="text-xs text-gray-500 underline">
                JANを直接入力する
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-500">JAN（13桁）</label>
                <Input value={jan} onChange={(e) => setJan(e.target.value.replace(/\D/g, "").slice(0, 13))} inputMode="numeric" className="w-48 font-mono" />
                {jan.length === 13 && !janOk && <p className="text-xs text-red-600 mt-1">チェックデジットが正しくありません。この番号は登録できません。</p>}
                {janOk && !janPrefix && <p className="text-xs text-amber-700 mt-1">登録されていない事業者コードです。先に一覧の「設定」で事業者コードを追加してください。</p>}
              </div>
              <button type="button" onClick={() => { setManual(false); setJan(""); }} className="text-xs text-gray-500 underline">
                空き番号から選ぶ
              </button>
            </>
          )}
          {janOk && (
            <div className="border rounded p-2 inline-block bg-white">
              <Ean13Barcode jan={jan} moduleMm={0.3} heightMm={14} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm">
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-medium">2. 内容を入力</p>
          <JanFormFields values={form} onChange={setForm} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={save} disabled={!janOk || !janPrefix || saving}>{saving ? "登録中..." : "この番号で登録"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
