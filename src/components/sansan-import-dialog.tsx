"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function SansanImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sansan/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
      } else {
        setResult(data.message);
        onImported();
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
      >
        Sansanからインポート
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sansan連携</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            SansanのAPIキーを入力してください。環境変数(SANSAN_API_KEY)に設定済みの場合は空欄でOKです。
          </p>
          <Input
            placeholder="Sansan APIキー"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
          />
          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
          )}
          {result && (
            <p className="text-sm text-green-600 bg-green-50 p-2 rounded">
              {result}
            </p>
          )}
          <Button
            onClick={handleImport}
            disabled={loading}
            className="w-full"
          >
            {loading ? "インポート中..." : "インポート実行"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
