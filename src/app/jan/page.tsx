"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Barcode as BarcodeIcon, Download, Link2, Plus, Printer, Search, Settings, Upload } from "lucide-react";
import { getJanStatus, JAN_STATUSES, LABEL_STORAGE_KEY, parseCsv } from "@/lib/jan-ledger";
import { compareProductOrder } from "@/lib/product-meta";

interface JanRow {
  id: string;
  jan: string;
  companyPrefix: string;
  itemCode: number;
  status: string;
  productName: string | null;
  nameOther: string | null;
  patternCode: string | null;
  amazonListed: boolean;
  amazonComolife: boolean;
  pastAmazonListed: boolean;
  pastAmazonCode: string | null;
  gs1Registered: boolean;
  brand: string | null;
  price: number | null;
  channels: string | null;
  product: { id: string; code: string; name: string } | null;
}

interface PrefixRow {
  id: string;
  prefix: string;
  label: string | null;
  rangeStart: number;
  rangeEnd: number;
  active: boolean;
  note: string | null;
  used: number;
  reserved: number;
  free: number;
  discontinued: number;
}

interface ProductOpt { id: string; code: string; name: string; series: string | null; sortOrder: number; active: boolean }

const PAGE_SIZE = 100;

export default function JanLedgerPage() {
  const router = useRouter();
  const [rows, setRows] = useState<JanRow[]>([]);
  const [total, setTotal] = useState(0);
  const [prefixes, setPrefixes] = useState<PrefixRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [prefix, setPrefix] = useState("");
  const [status, setStatus] = useState("used");
  const [linked, setLinked] = useState("");
  const [amazon, setAmazon] = useState("");
  const [gs1, setGs1] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Map<string, JanRow>>(new Map());
  const [importOpen, setImportOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [prefixOpen, setPrefixOpen] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (prefix) p.set("prefix", prefix);
    if (status) p.set("status", status);
    if (linked) p.set("linked", linked);
    if (amazon) p.set("amazon", amazon);
    if (gs1) p.set("gs1", gs1);
    return p;
  }, [q, prefix, status, linked, amazon, gs1]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams(params);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    const res = await fetch(`/api/jan?${p}`);
    if (res.ok) {
      const d = await res.json();
      setRows(d.items);
      setTotal(d.total);
      setPrefixes(d.prefixes);
    }
    setLoading(false);
  }, [params, page]);

  useEffect(() => {
    load();
  }, [load]);

  // 検索語は入力が止まってから反映
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(r: JanRow) {
    setSelected((prev) => {
      const n = new Map(prev);
      if (n.has(r.id)) n.delete(r.id);
      else n.set(r.id, r);
      return n;
    });
  }
  function toggleAllOnPage() {
    setSelected((prev) => {
      const n = new Map(prev);
      if (allOnPage) rows.forEach((r) => n.delete(r.id));
      else rows.forEach((r) => n.set(r.id, r));
      return n;
    });
  }

  function printLabels() {
    try {
      sessionStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify([...selected.keys()]));
    } catch {}
    router.push("/jan/labels");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarcodeIcon className="size-6" /> JAN台帳
          </h2>
          <p className="text-xs text-gray-500 mt-1">社内台帳です。JANの正はGS1（GJDB）。新しい番号はGJDBにも登録してください。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4 mr-1" /> 取込
          </Button>
          <a href={`/api/jan/export?${params}`}>
            <Button size="sm" variant="outline">
              <Download className="size-4 mr-1" /> 書出（{total.toLocaleString()}件）
            </Button>
          </a>
          <Link href="/jan/new">
            <Button size="sm">
              <Plus className="size-4 mr-1" /> 新規登録
            </Button>
          </Link>
        </div>
      </div>

      {/* 事業者コードごとの使用状況 */}
      <Card className="bg-white shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">事業者コード（押すと絞り込み）</p>
            <button type="button" onClick={() => setPrefixOpen(true)} className="text-xs text-blue-600 inline-flex items-center gap-0.5">
              <Settings className="size-3.5" /> 設定
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {prefixes.map((p) => {
              const cap = p.rangeEnd - p.rangeStart + 1;
              const pct = Math.round((p.used / cap) * 100);
              const on = prefix === p.prefix;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPrefix(on ? "" : p.prefix);
                    setPage(1);
                  }}
                  className={`text-left rounded-md border px-2.5 py-1.5 text-xs min-w-[150px] ${on ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"} ${p.active ? "" : "opacity-50"}`}
                >
                  <p className="font-mono font-medium">{p.prefix}</p>
                  {p.label && <p className="text-gray-600 truncate">{p.label}</p>}
                  <p className="text-gray-500">
                    使用 {p.used}／{cap}（{pct}%）・確保 {p.reserved}・空き {p.free}{p.discontinued ? `・廃番 ${p.discontinued}` : ""}
                  </p>
                  <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                    <div className={`h-1 rounded-full ${pct >= 90 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 絞り込み */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="JAN・商品名・柄コード・ブランド・使用先・商品マスタで検索（スペースで複数語）"
            className="pl-9"
          />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="border rounded-md px-2 py-2 text-sm">
          <option value="">すべての状態</option>
          {JAN_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <select value={linked} onChange={(e) => { setLinked(e.target.value); setPage(1); }} className="border rounded-md px-2 py-2 text-sm">
          <option value="">商品マスタ：すべて</option>
          <option value="yes">ひも付け済み</option>
          <option value="no">未ひも付け（使用中）</option>
        </select>
        <select value={amazon} onChange={(e) => { setAmazon(e.target.value); setPage(1); }} className="border rounded-md px-2 py-2 text-sm">
          <option value="">Amazon：すべて</option>
          <option value="listed">Amazon出品</option>
          <option value="comolife">Amazon（コモライフ）</option>
          <option value="past">過去Amazon</option>
        </select>
        <select value={gs1} onChange={(e) => { setGs1(e.target.value); setPage(1); }} className="border rounded-md px-2 py-2 text-sm">
          <option value="">GS1：すべて</option>
          <option value="yes">GS1登録済み</option>
          <option value="no">GS1未登録（使用中）</option>
        </select>
      </div>

      {/* 選択中の操作 */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          <span className="font-medium text-blue-900">{selected.size}件を選択中</span>
          <Button size="sm" onClick={printLabels}>
            <Printer className="size-4 mr-1" /> ラベル印刷
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
            <Link2 className="size-4 mr-1" /> 商品マスタにひも付け
          </Button>
          <button type="button" onClick={() => setSelected(new Map())} className="text-xs text-gray-500 underline">
            選択を解除
          </button>
        </div>
      )}

      <Card className="bg-white shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input type="checkbox" checked={allOnPage} onChange={toggleAllOnPage} className="size-4 align-middle" title="このページを全選択" />
                </th>
                <th className="text-left px-2 py-2 font-medium">JAN</th>
                <th className="text-left px-2 py-2 font-medium">状態</th>
                <th className="text-left px-2 py-2 font-medium">GS1</th>
                <th className="text-left px-2 py-2 font-medium min-w-[180px]">商品名</th>
                <th className="text-left px-2 py-2 font-medium">名称他</th>
                <th className="text-left px-2 py-2 font-medium">柄コード</th>
                <th className="text-left px-2 py-2 font-medium min-w-[140px]">商品マスタ</th>
                <th className="text-left px-2 py-2 font-medium">使用先</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-8">読み込み中...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-8">該当するJANがありません</td></tr>
              ) : (
                rows.map((r) => {
                  const st = getJanStatus(r.status);
                  return (
                    <tr key={r.id} className={`hover:bg-gray-50 ${selected.has(r.id) ? "bg-blue-50/50" : ""}`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r)} className="size-4 align-middle" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Link href={`/jan/${r.id}`} className="font-mono text-blue-600 hover:underline">{r.jan}</Link>
                      </td>
                      <td className="px-2 py-1.5"><Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge></td>
                      <td className="px-2 py-1.5 text-[11px] whitespace-nowrap">
                        {r.gs1Registered ? <span className="text-emerald-700">登録済</span> : r.status === "used" ? <span className="text-amber-600">未登録</span> : null}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.productName || <span className="text-gray-300">-</span>}
                        {(r.brand || r.price != null) && (
                          <span className="block text-[11px] text-gray-500">{[r.brand, r.price != null && `¥${r.price.toLocaleString()}`].filter(Boolean).join("・")}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">{r.nameOther || ""}</td>
                      <td className="px-2 py-1.5 text-gray-600">{r.patternCode || ""}</td>
                      <td className="px-2 py-1.5 text-xs">
                        {r.product ? (
                          <Link href={`/products/${r.product.id}`} className="text-blue-600 hover:underline">{r.product.name}</Link>
                        ) : r.status === "used" ? (
                          <span className="text-gray-300">未ひも付け</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-gray-600 whitespace-nowrap">
                        {r.channels || [r.amazonListed && "Amazon出品", r.amazonComolife && "コモライフ"].filter(Boolean).join("・")}
                        {(r.pastAmazonListed || r.pastAmazonCode) && <span className="block text-gray-400">過去Amazon</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {total.toLocaleString()}件中 {total ? (page - 1) * PAGE_SIZE + 1 : 0}〜{Math.min(page * PAGE_SIZE, total)}件
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>前へ</Button>
          <span className="text-gray-500">{page} / {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>次へ</Button>
        </div>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={load} />
      <LinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        ids={[...selected.keys()]}
        onDone={() => {
          setSelected(new Map());
          load();
        }}
      />
      <PrefixDialog open={prefixOpen} onOpenChange={setPrefixOpen} prefixes={prefixes} onDone={load} />
    </div>
  );
}

// ── 取込（旧台帳の書き出し／この画面の書き出しのCSV。Shift_JIS/UTF-8 どちらも可） ──
function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ upserted: number; invalid: string[]; unknown: string[]; newPrefixes: string[] } | null>(null);
  const [error, setError] = useState("");

  async function run() {
    if (!file) return;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) text = new TextDecoder("shift_jis").decode(buf);
      const records = parseCsv(text);
      if (!records.length || !("JANコード" in records[0] || "JAN" in records[0])) {
        throw new Error("「JANコード」列が見つかりません。JAN台帳のCSVか確認してください");
      }
      const total = { upserted: 0, invalid: [] as string[], unknown: [] as string[], newPrefixes: [] as string[] };
      const CHUNK = 500;
      for (let i = 0; i < records.length; i += CHUNK) {
        setProgress(`${Math.min(i + CHUNK, records.length).toLocaleString()} / ${records.length.toLocaleString()} 行`);
        const res = await fetch("/api/jan/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: records.slice(i, i + CHUNK) }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "取込に失敗しました");
        total.upserted += d.upserted;
        total.invalid.push(...d.invalid);
        total.unknown.push(...d.unknownProductCodes);
        total.newPrefixes.push(...d.newPrefixes);
      }
      setResult({ ...total, unknown: [...new Set(total.unknown)] });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取込に失敗しました");
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) { onOpenChange(o); if (!o) { setFile(null); setResult(null); setError(""); } } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>JAN台帳の取込</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-gray-500">
            旧台帳の書き出しCSV、またはこの画面の「書出」CSVを取り込みます。<b>JANが同じ行は上書き</b>し、新しいJANは追加します。
            チェックデジットが合わないJANは取り込みません。商品マスタへのひも付けは「商品マスタコード」列がある場合だけ変更します。
          </p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={running} />
          {progress && <p className="text-blue-700">取込中… {progress}</p>}
          {error && <p className="text-red-600">{error}</p>}
          {result && (
            <div className="rounded border bg-gray-50 p-2 space-y-1">
              <p className="text-emerald-700 font-medium">{result.upserted.toLocaleString()}件を取り込みました</p>
              {result.invalid.length > 0 && (
                <p className="text-amber-700">チェックデジット不一致などで取り込まなかったJAN：{result.invalid.length}件（{result.invalid.slice(0, 5).join("、")}{result.invalid.length > 5 ? "…" : ""}）</p>
              )}
              {result.unknown.length > 0 && <p className="text-amber-700">商品マスタに無い商品コード：{result.unknown.join("、")}</p>}
              {result.newPrefixes.length > 0 && <p className="text-gray-600">新しい事業者コードを追加：{result.newPrefixes.join("、")}（採番範囲は設定で確認してください）</p>}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={run} disabled={!file || running}>{running ? "取込中..." : "取り込む"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 選んだJANを商品マスタにまとめてひも付け ──
function LinkDialog({ open, onOpenChange, ids, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; ids: string[]; onDone: () => void }) {
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/products").then((r) => r.json()).then((ps: ProductOpt[]) => setProducts(ps.filter((p) => p.active).sort(compareProductOrder)));
  }, [open]);

  async function save(unlink = false) {
    setSaving(true);
    const res = await fetch("/api/jan/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, productId: unlink ? null : productId }),
    });
    setSaving(false);
    if (!res.ok) {
      alert("ひも付けに失敗しました。時間をおいて再度お試しください。");
      return;
    }
    onOpenChange(false);
    setProductId("");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>商品マスタにひも付け（{ids.length}件）</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full border rounded-md px-2 py-2">
            <option value="">-- 商品を選ぶ --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}（{p.code}）</option>
            ))}
          </select>
          <div className="flex justify-between gap-2">
            <Button variant="outline" disabled={saving} onClick={() => { if (confirm(`${ids.length}件のひも付けを解除しますか？`)) save(true); }}>
              ひも付けを解除
            </Button>
            <Button disabled={!productId || saving} onClick={() => save()}>{saving ? "保存中..." : "ひも付ける"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 事業者コードの設定（採番の範囲・名前） ──
function PrefixDialog({ open, onOpenChange, prefixes, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; prefixes: PrefixRow[]; onDone: () => void }) {
  const [newPrefix, setNewPrefix] = useState("");

  async function update(id: string, patch: Record<string, unknown>) {
    const res = await fetch("/api/jan/prefixes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) alert((await res.json()).error || "更新に失敗しました");
    onDone();
  }

  async function add() {
    const res = await fetch("/api/jan/prefixes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: newPrefix }),
    });
    if (!res.ok) {
      alert((await res.json()).error || "追加に失敗しました");
      return;
    }
    setNewPrefix("");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>事業者コードの設定</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">
          採番はこの「品目コードの範囲」の中から探します。最初は台帳に実在する番号の最小〜最大にしてあるので、GS1（GJDB）の登録内容と照らして調整してください。
        </p>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b">
            <tr>
              <th className="text-left py-1.5">事業者コード</th>
              <th className="text-left py-1.5">名前（用途）</th>
              <th className="text-left py-1.5">品目コードの範囲</th>
              <th className="py-1.5">採番に使う</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {prefixes.map((p) => (
              <tr key={p.id}>
                <td className="py-1.5 font-mono">{p.prefix}</td>
                <td className="py-1.5">
                  <Input defaultValue={p.label || ""} onBlur={(e) => e.target.value !== (p.label || "") && update(p.id, { label: e.target.value })} className="h-8" placeholder="例：西陣" />
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    <Input type="number" defaultValue={p.rangeStart} onBlur={(e) => Number(e.target.value) !== p.rangeStart && update(p.id, { rangeStart: Number(e.target.value) })} className="h-8 w-20" />
                    〜
                    <Input type="number" defaultValue={p.rangeEnd} onBlur={(e) => Number(e.target.value) !== p.rangeEnd && update(p.id, { rangeEnd: Number(e.target.value) })} className="h-8 w-20" />
                  </div>
                </td>
                <td className="py-1.5 text-center">
                  <input type="checkbox" defaultChecked={p.active} onChange={(e) => update(p.id, { active: e.target.checked })} className="size-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-2 pt-2 border-t">
          <Input value={newPrefix} onChange={(e) => setNewPrefix(e.target.value)} placeholder="新しい事業者コード（GS1で取得したもの）" className="max-w-xs" />
          <Button size="sm" variant="outline" disabled={!newPrefix.trim()} onClick={add}>追加</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
