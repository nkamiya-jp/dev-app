"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ean13Barcode } from "@/components/ean13-barcode";
import { Copy, Printer, Undo2 } from "lucide-react";
import { getJanStatus, LABEL_STORAGE_KEY } from "@/lib/jan-ledger";
import { JanFormFields, JanFormValues, emptyJanForm } from "../jan-form";

interface JanDetail {
  id: string;
  jan: string;
  companyPrefix: string;
  itemCode: number;
  status: string;
  productName: string | null;
  nameOther: string | null;
  patternCode: string | null;
  productId: string | null;
  product: { id: string; code: string; name: string } | null;
  amazonListed: boolean;
  amazonComolife: boolean;
  pastAmazonListed: boolean;
  pastAmazonCode: string | null;
  legacyRecordNo: number | null;
  note: string | null;
  updatedAt: string;
  siblings: { id: string; jan: string; patternCode: string | null; nameOther: string | null }[];
}

function toForm(d: JanDetail): JanFormValues {
  return {
    status: d.status,
    productName: d.productName || "",
    nameOther: d.nameOther || "",
    patternCode: d.patternCode || "",
    productId: d.productId || "",
    amazonListed: d.amazonListed,
    amazonComolife: d.amazonComolife,
    pastAmazonListed: d.pastAmazonListed,
    pastAmazonCode: d.pastAmazonCode || "",
    note: d.note || "",
  };
}

export default function JanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<JanDetail | null>(null);
  const [form, setForm] = useState<JanFormValues>(emptyJanForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/jan/${id}`);
    if (!res.ok) {
      setError("JANが見つかりません");
      return;
    }
    const d: JanDetail = await res.json();
    setItem(d);
    setForm(toForm(d));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(values = form) {
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch(`/api/jan/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(d.error || "保存に失敗しました");
      return;
    }
    setMessage("保存しました");
    load();
  }

  async function release() {
    if (!item) return;
    if (!confirm(`${item.jan} を空き番号に戻しますか？（商品名・名称他・柄コード・商品マスタのひも付けを消します。GS1側の登録も確認してください）`)) return;
    await save({ ...form, status: "free", productName: "", nameOther: "", patternCode: "", productId: "", amazonListed: false, amazonComolife: false });
  }

  function printOne() {
    try {
      sessionStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify([id]));
    } catch {}
    router.push("/jan/labels");
  }

  if (error && !item) return <div className="p-6 text-gray-500">{error}</div>;
  if (!item) return <div className="p-6 text-gray-400">読み込み中...</div>;
  const st = getJanStatus(item.status);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(item));

  return (
    <div className="space-y-4 max-w-4xl">
      <Link href="/jan" className="text-gray-500 hover:text-gray-700 text-sm">← JAN台帳</Link>

      <Card className="bg-white shadow-sm">
        <CardContent className="py-4 flex flex-col sm:flex-row gap-5 items-start">
          <div className="shrink-0 border rounded p-2 bg-white">
            <Ean13Barcode jan={item.jan} moduleMm={0.33} heightMm={18} />
          </div>
          <div className="space-y-1.5 text-sm flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-lg">{item.jan}</span>
              <Badge className={st.color}>{st.label}</Badge>
            </div>
            <p className="text-gray-500 text-xs">
              事業者コード <span className="font-mono">{item.companyPrefix}</span>・品目コード{" "}
              <span className="font-mono">{String(item.itemCode).padStart(12 - item.companyPrefix.length, "0")}</span>
              {item.legacyRecordNo != null && <>・旧レコード番号 {item.legacyRecordNo}</>}
            </p>
            <p className="font-medium">{item.productName || item.nameOther || <span className="text-gray-400">（商品名なし）</span>}</p>
            {item.product && (
              <p className="text-xs">
                商品マスタ：<Link href={`/products/${item.product.id}`} className="text-blue-600 hover:underline">{item.product.name}（{item.product.code}）</Link>
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Link href={`/jan/new?copy=${item.id}`}>
                <Button size="sm" variant="outline"><Copy className="size-4 mr-1" /> コピーして新規</Button>
              </Link>
              <Button size="sm" variant="outline" onClick={printOne}><Printer className="size-4 mr-1" /> ラベル印刷</Button>
              {item.status !== "free" && (
                <Button size="sm" variant="outline" onClick={release}><Undo2 className="size-4 mr-1" /> 空きに戻す</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm">
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-medium">内容の編集（JAN番号そのものは変更できません）</p>
          <JanFormFields values={form} onChange={setForm} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            {message && !dirty && <span className="text-sm text-emerald-700">{message}</span>}
            <Button onClick={() => save()} disabled={!dirty || saving}>{saving ? "保存中..." : "保存"}</Button>
          </div>
        </CardContent>
      </Card>

      {item.siblings.length > 0 && (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-2">同じ商品の他のJAN（{item.siblings.length}件）</p>
            <div className="flex flex-wrap gap-1.5">
              {item.siblings.map((s) => (
                <Link key={s.id} href={`/jan/${s.id}`} className="text-xs border rounded px-2 py-1 hover:bg-gray-50">
                  <span className="font-mono">{s.jan}</span>
                  {(s.patternCode || s.nameOther) && <span className="ml-1 text-gray-500">{s.patternCode || s.nameOther}</span>}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
