"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NOTE_STATUSES, getNoteStatusColor } from "@/lib/note-status";

interface Note {
  id: string;
  title: string;
  body: string;
  contactId: string | null;
  dealId: string | null;
  contact: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
  appleNoteId: string | null;
  appleCreatedAt: string | null;
  appleModifiedAt: string | null;
  crmNote: string | null;
  status: string;
  createdAt: string;
}

interface Contact {
  id: string;
  name: string;
  company: string | null;
}

interface Deal {
  id: string;
  title: string;
  contact: { name: string };
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkingNote, setLinkingNote] = useState<Note | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [sortKey, setSortKey] = useState<"updated" | "appleModified" | "title">("updated");

  const loadNotes = useCallback(async () => {
    const res = await fetch("/api/notes");
    setNotes(await res.json());
  }, []);

  const sortedNotes = [...notes].sort((a, b) => {
    if (sortKey === "title") return a.title.localeCompare(b.title, "ja");
    if (sortKey === "appleModified") {
      const da = a.appleModifiedAt ? new Date(a.appleModifiedAt).getTime() : 0;
      const db = b.appleModifiedAt ? new Date(b.appleModifiedAt).getTime() : 0;
      return db - da;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  useEffect(() => {
    loadNotes();
    fetch("/api/contacts").then((r) => r.json()).then(setContacts);
    fetch("/api/deals").then((r) => r.json()).then(setDeals);
  }, [loadNotes]);

  async function loadFolders() {
    try {
      const res = await fetch("/api/apple-notes");
      const data = await res.json();
      if (data.folders) setFolders(data.folders);
    } catch {
      setFolders([]);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const res = await fetch("/api/apple-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: selectedFolder || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error);
      } else {
        setImportResult(data.message);
        loadNotes();
      }
    } catch {
      setImportError("通信エラーが発生しました");
    } finally {
      setImporting(false);
    }
  }

  async function handleCreateNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        body: form.get("body") || "",
        contactId: form.get("contactId") || null,
        dealId: form.get("dealId") || null,
      }),
    });
    setNewNoteOpen(false);
    loadNotes();
  }

  async function updateNoteStatus(noteId: string, status: string) {
    await fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: noteId, status }),
    });
    loadNotes();
  }

  async function saveCrmNote(noteId: string) {
    await fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: noteId, crmNote: editingText }),
    });
    setEditingNoteId(null);
    loadNotes();
  }

  async function linkNote(noteId: string, contactId: string | null, dealId: string | null) {
    await fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: noteId, contactId, dealId }),
    });
    setLinkOpen(false);
    setLinkingNote(null);
    loadNotes();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">メモ</h2>
        <div className="flex gap-2">
          <Dialog
            open={importOpen}
            onOpenChange={(open) => {
              setImportOpen(open);
              if (open) loadFolders();
            }}
          >
            <DialogTrigger
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Appleメモからインポート
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Appleメモ連携</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  macOSのメモアプリからメモを取り込みます。フォルダを指定すると、そのフォルダのみインポートします。
                </p>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                >
                  <option value="">すべてのフォルダ</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                {importError && (
                  <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{importError}</p>
                )}
                {importResult && (
                  <p className="text-sm text-green-600 bg-green-50 p-2 rounded">{importResult}</p>
                )}
                <Button onClick={handleImport} disabled={importing} className="w-full">
                  {importing ? "インポート中..." : "インポート実行"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={newNoteOpen} onOpenChange={setNewNoteOpen}>
            <DialogTrigger
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + メモを作成
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しいメモ</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateNote} className="space-y-3">
                <Input name="title" placeholder="タイトル *" required />
                <textarea
                  name="body"
                  placeholder="メモ内容..."
                  rows={6}
                  className="w-full border rounded-md px-3 py-2 text-sm resize-y"
                />
                <select name="contactId" className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">顧客（任意）</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ""}
                    </option>
                  ))}
                </select>
                <select name="dealId" className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">案件（任意）</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
                <Button type="submit" className="w-full">作成</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-500">{notes.length}件のメモ</p>
        <span className="text-xs text-gray-400">並び替え:</span>
        {(["updated", "appleModified", "title"] as const).map((key) => (
          <Button
            key={key}
            variant={sortKey === key ? "default" : "outline"}
            size="sm"
            onClick={() => setSortKey(key)}
          >
            {key === "updated" ? "更新順" : key === "appleModified" ? "メモ更新順" : "名前順"}
          </Button>
        ))}
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>メモを紐づけ: {linkingNote?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">顧客</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm mt-1"
                value={linkingNote?.contactId || ""}
                onChange={(e) => {
                  if (linkingNote) {
                    linkNote(linkingNote.id, e.target.value || null, linkingNote.dealId);
                  }
                }}
              >
                <option value="">なし</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company ? `(${c.company})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">案件</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm mt-1"
                value={linkingNote?.dealId || ""}
                onChange={(e) => {
                  if (linkingNote) {
                    linkNote(linkingNote.id, linkingNote.contactId, e.target.value || null);
                  }
                }}
              >
                <option value="">なし</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        {sortedNotes.length === 0 ? (
          <Card className="bg-white shadow-sm">
            <CardContent className="py-8 text-center text-gray-500">
              メモがありません。「+ メモを作成」またはAppleメモからインポートしてください。
            </CardContent>
          </Card>
        ) : (
          sortedNotes.map((note) => (
            <Card key={note.id} className="bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() =>
                        setExpandedNote(expandedNote === note.id ? null : note.id)
                      }
                      className="text-left"
                    >
                      <h3 className="font-medium">{note.title}</h3>
                    </button>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <select
                        value={note.status}
                        onChange={(e) => updateNoteStatus(note.id, e.target.value)}
                        className={`text-xs px-2 py-0.5 rounded border-0 cursor-pointer ${getNoteStatusColor(note.status)}`}
                      >
                        {NOTE_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      {note.appleNoteId && (
                        <Badge variant="outline" className="text-xs border-purple-200 text-purple-600">
                          Apple
                        </Badge>
                      )}
                      {note.contact && (
                        <Badge variant="secondary" className="text-xs">
                          {note.contact.name}
                        </Badge>
                      )}
                      {note.deal && (
                        <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                          {note.deal.title}
                        </Badge>
                      )}
                      <span className="text-xs text-gray-400">
                        {note.appleModifiedAt
                          ? new Date(note.appleModifiedAt).toLocaleDateString("ja-JP")
                          : new Date(note.createdAt).toLocaleDateString("ja-JP")}
                      </span>
                    </div>

                    {expandedNote === note.id && (
                      <div className="mt-3 border-t pt-3 space-y-3">
                        {/* CRM編集メモ */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-500">メモ</span>
                            {editingNoteId !== note.id && (
                              <button
                                onClick={() => {
                                  setEditingNoteId(note.id);
                                  setEditingText(note.crmNote || "");
                                }}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                編集
                              </button>
                            )}
                          </div>
                          {editingNoteId === note.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                rows={4}
                                className="w-full border rounded-md px-3 py-2 text-sm resize-y"
                                placeholder="メモを入力..."
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveCrmNote(note.id)}>
                                  保存
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingNoteId(null)}
                                >
                                  キャンセル
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-700 whitespace-pre-wrap">
                              {note.crmNote || (
                                <span className="text-gray-400 italic">メモなし（編集をクリック）</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Apple原文（インポート済みの場合） */}
                        {note.appleNoteId && note.body && (
                          <div>
                            <span className="text-xs font-medium text-purple-500">Apple原文</span>
                            <div className="mt-1 text-sm text-gray-500 whitespace-pre-wrap bg-gray-50 rounded p-2 max-h-40 overflow-y-auto">
                              {note.body}
                            </div>
                          </div>
                        )}

                        {/* CRMで直接作成したメモの本文 */}
                        {!note.appleNoteId && note.body && (
                          <div className="text-sm text-gray-700 whitespace-pre-wrap">
                            {note.body}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setLinkingNote(note);
                      setLinkOpen(true);
                    }}
                    className="text-xs text-blue-600 hover:underline ml-2 shrink-0"
                  >
                    紐づけ
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
