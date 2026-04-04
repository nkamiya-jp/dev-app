import { prisma } from "@/lib/db";
import { fetchAppleNotes, fetchAppleNoteFolders } from "@/lib/apple-notes";
import { NextRequest } from "next/server";

export async function GET() {
  try {
    const folders = fetchAppleNoteFolders();
    return Response.json({ folders });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "フォルダ取得に失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { folder } = await request.json();

  try {
    const notes = fetchAppleNotes(folder || undefined);
    let imported = 0;
    let updated = 0;

    for (const note of notes) {
      const existing = await prisma.note.findUnique({
        where: { appleNoteId: note.id },
      });

      const data = {
        title: note.name,
        body: note.body,
        appleNoteId: note.id,
        appleCreatedAt: note.creationDate
          ? new Date(note.creationDate)
          : null,
        appleModifiedAt: note.modificationDate
          ? new Date(note.modificationDate)
          : null,
      };

      if (existing) {
        await prisma.note.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        await prisma.note.create({ data });
        imported++;
      }
    }

    return Response.json({
      message: `インポート完了: ${imported}件追加、${updated}件更新`,
      imported,
      updated,
      total: notes.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "インポートに失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
