"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircleQuestion, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { compareProductOrder } from "@/lib/product-meta";

interface ProductOpt { id: string; code: string; name: string; active: boolean; series: string | null; sortOrder: number }
interface ContactOpt { id: string; name: string; company: string | null; dailyOrder?: boolean }

interface DraftItem { key: string; label: string; productId: string; quantity: string }

interface ParseResult {
  isOrder: boolean;
  customerLabel: string;
  contactId: string | null;
  items: { label: string; productId: string | null; quantity: number | null }[];
  shipDate: string | null;
  shipHint: string | null;
  note: string | null;
  questions: string[];
}

const NEW_CONTACT = "__new__";

function todayJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

// Slackの投稿を貼り付け → AIで明細化 → AIの確認に返事して読み直し → 確認・修正して受注登録
export function SlackImportDialog({
  open,
  onOpenChange,
  onCreated,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  // Slackから自動で取り込んだ下書き（指定時は開いた時点でAIが読み取る）
  draft?: { id: string; rawText: string } | null;
}) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasDraft, setHasDraft] = useState(false);

  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);

  const [contactId, setContactId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [shipHint, setShipHint] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  // AIとのやりとり
  const [questions, setQuestions] = useState<string[]>([]);
  const [clarifications, setClarifications] = useState<string[]>([]);
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/products").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/contacts").then((r) => (r.ok ? r.json() : [])),
    ]).then(([ps, cs]) => {
      // 商品の並びは価格表（マスタ順）と同じ
      setProducts((ps as ProductOpt[]).filter((p) => p.active).sort(compareProductOrder));
      setContacts(cs as ContactOpt[]);
    });
  }, [open]);

  const autoParsedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      autoParsedFor.current = null;
      return;
    }
    if (draft && autoParsedFor.current !== draft.id) {
      autoParsedFor.current = draft.id;
      setText(draft.rawText);
      parse([], draft.rawText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  function reset() {
    setText("");
    setError("");
    setHasDraft(false);
    setContactId("");
    setCustomerLabel("");
    setDueDate("");
    setShipHint(null);
    setNote("");
    setItems([]);
    setQuestions([]);
    setClarifications([]);
    setReply("");
  }

  function startManual(withError = "") {
    setError(withError);
    setHasDraft(true);
    if (items.length === 0) setItems([{ key: nextKey(), label: "", productId: "", quantity: "" }]);
    if (!note && text.trim()) setNote(text.trim());
  }

  // AIの結果を画面に反映。読み直し時は、担当者が選び済みの商品・顧客を（AIが特定できなかった分だけ）引き継ぐ
  function applyResult(data: ParseResult) {
    const prevByLabel = new Map(items.filter((it) => it.label && it.productId).map((it) => [it.label, it.productId]));
    setCustomerLabel(data.customerLabel || "");
    setContactId(
      data.contactId ||
        (contactId && contactId !== NEW_CONTACT ? contactId : "") ||
        (data.customerLabel ? NEW_CONTACT : "")
    );
    setDueDate(data.shipDate || dueDate);
    setShipHint(data.shipHint);
    setNote(data.note || "");
    setQuestions(data.questions || []);
    setItems(
      data.items.map((it) => ({
        key: nextKey(),
        label: it.label,
        productId: it.productId || prevByLabel.get(it.label) || "",
        quantity: it.quantity != null ? String(it.quantity) : "",
      }))
    );
    setHasDraft(true);
  }

  async function parse(clar: string[], overrideText?: string) {
    setParsing(true);
    setError("");
    try {
      const res = await fetch("/api/orders/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: overrideText ?? text, clarifications: clar }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (hasDraft) setError(`${data.error || "読み取りに失敗しました"}（今の内容は残っています）`);
        else startManual(`${data.error || "読み取りに失敗しました"}（下で手入力できます）`);
        return;
      }
      if (!data.isOrder) setError("受注の投稿ではない可能性があります。内容を確認してください。");
      applyResult(data as ParseResult);
    } catch {
      if (hasDraft) setError("通信に失敗しました（今の内容は残っています）");
      else startManual("通信に失敗しました（下で手入力できます）");
    } finally {
      setParsing(false);
    }
  }

  async function sendReply() {
    const r = reply.trim();
    if (!r) return;
    const next = [...clarifications, r];
    setClarifications(next);
    setReply("");
    await parse(next);
  }

  const unmatched = items.filter((it) => !it.productId || !(Number(it.quantity) > 0)).length;
  const canSave =
    hasDraft && !!contactId && (contactId !== NEW_CONTACT || !!customerLabel.trim()) && items.length > 0 && unmatched === 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      let cid = contactId;
      if (cid === NEW_CONTACT) {
        const label = customerLabel.trim();
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: label, company: label }),
        });
        if (!res.ok) throw new Error("顧客の登録に失敗しました");
        cid = (await res.json()).id;
      }

      // 単価は既存の受注画面と同じ実効単価（個別価格 → 上代×掛率 → 標準卸）
      const priceRes = await fetch(`/api/customer-prices/effective?contactId=${cid}`);
      const priceMap = new Map<string, number | null>();
      if (priceRes.ok) {
        const pd = await priceRes.json();
        for (const r of pd.items || []) priceMap.set(r.productId, r.price);
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: cid,
          orderDate: todayJST(),
          dueDate: dueDate || null,
          note: note.trim() || null,
          items: items.map((it) => ({
            productId: it.productId,
            quantity: Number(it.quantity),
            unitPrice: priceMap.get(it.productId) ?? null,
          })),
        }),
      });
      if (!res.ok) throw new Error("受注の登録に失敗しました");
      const created = await res.json();

      // Slackから取り込んだ下書きなら「登録済み」にする（Slackの投稿に ✅ が付く）
      if (draft) {
        await fetch("/api/order-drafts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: draft.id, status: "registered", orderId: created.id }),
        }).catch(() => {});
      }

      // 投稿上の書き方 → 確定した商品 を記録（次回からAIがこの対応で読み取る）。失敗しても登録は完了扱い
      const aliases = items.filter((it) => it.label.trim() && it.productId).map((it) => ({ label: it.label, productId: it.productId }));
      if (aliases.length) {
        fetch("/api/product-aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aliases }),
        }).catch(() => {});
      }

      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft ? "Slackから届いた受注を確認" : "Slackの投稿から受注を登録"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">#受注 の投稿をそのまま貼り付け</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={"例）\n京和堂\n木玉ポーチ10\n3.3寸 30個\n10月末発送予定です"}
              className="w-full border rounded-md px-3 py-2 text-sm resize-y"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <Button size="sm" onClick={() => parse(clarifications)} disabled={parsing || !text.trim()}>
                <Sparkles className="size-4 mr-1" />
                {parsing ? "読み取り中..." : hasDraft ? "もう一度読み取る" : "AIで読み取る"}
              </Button>
              {!hasDraft && (
                <button type="button" onClick={() => startManual()} className="text-xs text-gray-500 underline">
                  手入力する
                </button>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{error}</p>}

          {hasDraft && (
            <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 space-y-2">
              {questions.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-blue-900 flex items-center gap-1">
                    <MessageCircleQuestion className="size-4" /> AIからの確認
                  </p>
                  <ul className="mt-1 space-y-0.5 text-sm text-blue-900 list-disc pl-5">
                    {questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-blue-900">AIからの確認はありません。違うところがあれば下からAIに伝えられます。</p>
              )}

              {clarifications.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {clarifications.map((c, i) => (
                    <span key={i} className="text-[11px] bg-white border border-blue-200 rounded-full px-2 py-0.5 text-blue-800">
                      あなた：{c}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  placeholder="例：朱印袋は朱印帳のこと／3.3寸は箱入"
                  className="bg-white"
                />
                <Button size="sm" onClick={sendReply} disabled={parsing || !reply.trim()}>
                  <Send className="size-4 mr-1" />
                  {parsing ? "読み直し中..." : "伝える"}
                </Button>
              </div>
            </div>
          )}

          {hasDraft && (
            <div className="space-y-3 border-t pt-3">
              <div>
                <label className="text-xs text-gray-500">顧客</label>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">-- 顧客を選ぶ --</option>
                  <option value={NEW_CONTACT}>＋ 新規顧客として登録{customerLabel ? `：${customerLabel}` : ""}</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company || c.name}
                      {c.company && c.name !== c.company ? `（${c.name}）` : ""}
                    </option>
                  ))}
                </select>
                {contactId === NEW_CONTACT && (
                  <Input
                    value={customerLabel}
                    onChange={(e) => setCustomerLabel(e.target.value)}
                    placeholder="新規顧客の名前"
                    className="mt-1.5"
                  />
                )}
                {contacts.find((c) => c.id === contactId)?.dailyOrder && (
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    この顧客は「毎日注文の取引先」です。登録しても受注進捗ボードには普段表示されません。
                  </p>
                )}
                {customerLabel && contactId !== NEW_CONTACT && contactId && (
                  <p className="text-[11px] text-gray-400 mt-0.5">投稿上の表記：{customerLabel}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500">発送予定日</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-44" />
                {shipHint && <p className="text-[11px] text-gray-500 mt-0.5">投稿上の表現：{shipHint}</p>}
              </div>

              <div>
                <label className="text-xs text-gray-500">明細</label>
                <div className="space-y-2">
                  {items.map((it) => {
                    const bad = !it.productId || !(Number(it.quantity) > 0);
                    return (
                      <div key={it.key} className={`rounded border p-2 ${bad ? "border-amber-300 bg-amber-50/50" : ""}`}>
                        {it.label && <p className="text-[11px] text-gray-500 mb-1">投稿：{it.label}</p>}
                        <div className="flex items-center gap-2">
                          <select
                            value={it.productId}
                            onChange={(e) => updateItem(it.key, { productId: e.target.value })}
                            className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm bg-white"
                          >
                            <option value="">-- 商品を選ぶ --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}（{p.code}）
                              </option>
                            ))}
                          </select>
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={it.quantity}
                            onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
                            placeholder="数量"
                            className="w-20"
                          />
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}
                            className="text-gray-400 hover:text-red-600 p-1"
                            title="明細を削除"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, { key: nextKey(), label: "", productId: "", quantity: "" }])}
                  className="mt-1.5 text-xs text-blue-600 inline-flex items-center gap-0.5"
                >
                  <Plus className="size-3.5" /> 明細を追加
                </button>
              </div>

              <div>
                <label className="text-xs text-gray-500">メモ（支払方法・注意点など。受注に残ります）</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full border rounded-md px-3 py-2 text-sm resize-y"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  {unmatched > 0 ? `黄色の明細 ${unmatched}件の商品・数量を確認してください` : !contactId ? "顧客を選んでください" : "内容を確認して登録"}
                </p>
                <Button onClick={save} disabled={!canSave || saving}>
                  {saving ? "登録中..." : "受注を登録"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
