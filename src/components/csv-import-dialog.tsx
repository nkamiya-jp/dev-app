"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileText } from "lucide-react";

export interface CsvColumn {
  key: string;
  label: string;      // CSVヘッダ名（日本語）
  required?: boolean;
  example?: string;
}

// 簡易CSVパーサ（ダブルクォート対応）
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function CsvImportDialog({
  title,
  columns,
  endpoint,
  onDone,
  triggerLabel = "CSVインポート",
}: {
  title: string;
  columns: CsvColumn[];
  endpoint: string;
  onDone?: () => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(null);

  // ヘッダ行 → key 対応。日本語ラベルまたはkeyのどちらでも一致
  function mapRows(): Record<string, string>[] {
    const parsed = parseCsv(text);
    if (parsed.length < 2) return [];
    const header = parsed[0].map((h) => h.trim());
    const idxByKey: Record<string, number> = {};
    for (const col of columns) {
      let idx = header.findIndex((h) => h === col.label || h === col.key);
      idxByKey[col.key] = idx;
    }
    return parsed.slice(1).map((cells) => {
      const obj: Record<string, string> = {};
      for (const col of columns) {
        const idx = idxByKey[col.key];
        obj[col.key] = idx >= 0 ? (cells[idx] ?? "").trim() : "";
      }
      return obj;
    });
  }

  const previewRows = text.trim() ? mapRows() : [];

  function downloadTemplate() {
    const header = columns.map((c) => c.label).join(",");
    const example = columns.map((c) => c.example ?? "").join(",");
    const csv = "﻿" + header + "\n" + example;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}_テンプレート.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setText(t);
    setResult(null);
  }

  async function doImport() {
    const rows = mapRows();
    if (rows.length === 0) {
      alert("データがありません。ヘッダ行＋データ行を貼り付けてください。");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ created: data.created ?? 0, updated: data.updated ?? 0, errors: data.errors ?? [] });
        onDone?.();
      } else {
        alert(`インポート失敗: ${data.error ?? res.status}`);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setText(""); setResult(null); } }}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
        <Upload className="size-4 mr-1" /> {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title} CSVインポート</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="size-4 mr-1" /> テンプレートをダウンロード
            </Button>
            <label className="inline-flex items-center gap-1 text-sm border rounded-md px-3 py-1.5 cursor-pointer hover:bg-accent">
              <FileText className="size-4" /> ファイルを選択
              <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">
              1行目にヘッダ（{columns.map((c) => c.label).join(" / ")}）、2行目以降にデータ。Excelからコピペも可
            </p>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); }}
              rows={8}
              placeholder={columns.map((c) => c.label).join(",") + "\n" + columns.map((c) => c.example ?? "").join(",")}
              className="w-full border rounded-md px-3 py-2 text-sm font-mono resize-y"
            />
          </div>

          {previewRows.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">プレビュー（{previewRows.length}件）</p>
              <div className="max-h-48 overflow-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      {columns.map((c) => (
                        <th key={c.key} className="text-left px-2 py-1 font-medium text-gray-500">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewRows.slice(0, 50).map((row, i) => {
                      const missingRequired = columns.some((c) => c.required && !row[c.key]);
                      return (
                        <tr key={i} className={missingRequired ? "bg-red-50" : ""}>
                          {columns.map((c) => (
                            <td key={c.key} className="px-2 py-1">{row[c.key] || <span className="text-gray-300">-</span>}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm">
              <p className="font-medium text-green-700">
                ✅ 完了: 新規 {result.created}件 / 更新 {result.updated}件
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 text-red-600">
                  <p className="text-xs font-medium">エラー {result.errors.length}件:</p>
                  <ul className="text-xs list-disc pl-4">
                    {result.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>{e.row}行目: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <Button onClick={doImport} disabled={importing || previewRows.length === 0} className="w-full">
            {importing ? "インポート中..." : `${previewRows.length}件をインポート`}
          </Button>
          <p className="text-[11px] text-gray-400">
            ※ コード（または名前）が一致する既存データは上書き更新されます
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
