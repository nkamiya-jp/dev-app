"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { JAN_STATUSES } from "@/lib/jan-ledger";
import { compareProductOrder } from "@/lib/product-meta";

export interface JanFormValues {
  status: string;
  productName: string;
  nameOther: string;
  patternCode: string;
  productId: string;
  amazonListed: boolean;
  amazonComolife: boolean;
  pastAmazonListed: boolean;
  pastAmazonCode: string;
  gs1Registered: boolean;
  price: string;
  brand: string;
  channels: string;
  note: string;
}

export const emptyJanForm: JanFormValues = {
  status: "used",
  productName: "",
  nameOther: "",
  patternCode: "",
  productId: "",
  amazonListed: false,
  amazonComolife: false,
  pastAmazonListed: false,
  pastAmazonCode: "",
  gs1Registered: false,
  price: "",
  brand: "",
  channels: "",
  note: "",
};

interface ProductOpt { id: string; code: string; name: string; series: string | null; sortOrder: number; active: boolean }

// JANの中身（商品名・柄・商品マスタ・Amazon）の入力欄。詳細の編集と新規登録で共通
export function JanFormFields({
  values,
  onChange,
  showStatus = true,
}: {
  values: JanFormValues;
  onChange: (v: JanFormValues) => void;
  showStatus?: boolean;
}) {
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [opts, setOpts] = useState<{ brands: string[]; channels: string[] }>({ brands: [], channels: [] });
  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((ps: ProductOpt[]) => setProducts(ps.filter((p) => p.active).sort(compareProductOrder)));
    fetch("/api/jan/options")
      .then((r) => (r.ok ? r.json() : { brands: [], channels: [] }))
      .then(setOpts);
  }, []);

  const set = <K extends keyof JanFormValues>(k: K, v: JanFormValues[K]) => onChange({ ...values, [k]: v });

  return (
    <div className="space-y-3 text-sm">
      {showStatus && (
        <div>
          <label className="text-xs text-gray-500">状態</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {JAN_STATUSES.map((s) => (
              <label key={s.id} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 cursor-pointer text-xs ${values.status === s.id ? s.color + " border-transparent" : "bg-white"}`}>
                <input type="radio" name="janStatus" className="sr-only" checked={values.status === s.id} onChange={() => set("status", s.id)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">商品名</label>
          <Input value={values.productName} onChange={(e) => set("productName", e.target.value)} placeholder="例：西陣）つづれ2.6 財布" />
        </div>
        <div>
          <label className="text-xs text-gray-500">名称他</label>
          <Input value={values.nameOther} onChange={(e) => set("nameOther", e.target.value)} placeholder="品番・正式名など" />
        </div>
        <div>
          <label className="text-xs text-gray-500">柄コード</label>
          <Input value={values.patternCode} onChange={(e) => set("patternCode", e.target.value)} placeholder="例：RE-1-1（確保の場合は用途メモ）" />
        </div>
        <div>
          <label className="text-xs text-gray-500">商品マスタ（価格計算の商品）</label>
          <select value={values.productId} onChange={(e) => set("productId", e.target.value)} className="w-full border rounded-md px-2 py-2 bg-white">
            <option value="">ひも付けない</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}（{p.code}）</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500">ブランド</label>
          <Input value={values.brand} onChange={(e) => set("brand", e.target.value)} list="janBrandList" placeholder="例：京都芸美堂" />
          <datalist id="janBrandList">{opts.brands.map((b) => <option key={b} value={b} />)}</datalist>
        </div>
        <div>
          <label className="text-xs text-gray-500">上代（税抜・円）</label>
          <Input value={values.price} onChange={(e) => set("price", e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" />
        </div>
        <div>
          <label className="text-xs text-gray-500">使用先（カンマ区切り）</label>
          <Input value={values.channels} onChange={(e) => set("channels", e.target.value)} list="janChannelList" placeholder="例：Amazon JP, よしや" />
          <datalist id="janChannelList">{opts.channels.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>
      <label className={`flex items-center gap-2 rounded-md border px-3 py-2 ${values.gs1Registered ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        <input type="checkbox" checked={values.gs1Registered} onChange={(e) => set("gs1Registered", e.target.checked)} className="size-4" />
        <span>GS1（GJDB）に登録済み</span>
        {!values.gs1Registered && <span className="text-xs text-amber-700">JANの正はGS1です。GJDBに登録したらチェックしてください</span>}
      </label>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={values.amazonListed} onChange={(e) => set("amazonListed", e.target.checked)} className="size-4" /> Amazon出品
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={values.amazonComolife} onChange={(e) => set("amazonComolife", e.target.checked)} className="size-4" /> Amazon（コモライフ）
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={values.pastAmazonListed} onChange={(e) => set("pastAmazonListed", e.target.checked)} className="size-4" /> 過去Amazon出品
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">過去Amazonコード</label>
          <Input value={values.pastAmazonCode} onChange={(e) => set("pastAmazonCode", e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <label className="text-xs text-gray-500">メモ</label>
          <Input value={values.note} onChange={(e) => set("note", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
