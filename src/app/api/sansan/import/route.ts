import { prisma } from "@/lib/db";
import { fetchBizCards, bizCardToContact } from "@/lib/sansan";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { apiKey } = await request.json();
  const key = apiKey || process.env.SANSAN_API_KEY;

  if (!key) {
    return Response.json(
      { error: "Sansan APIキーが設定されていません" },
      { status: 400 }
    );
  }

  try {
    const bizCards = await fetchBizCards(key);
    let imported = 0;
    let updated = 0;

    for (const card of bizCards) {
      const data = bizCardToContact(card);
      const existing = data.sansanPersonId
        ? await prisma.contact.findUnique({
            where: { sansanPersonId: data.sansanPersonId },
          })
        : null;

      if (existing) {
        // 既存の見込客の leadStatus / temperature は上書きしない
        const { leadStatus: _ls, leadSource: _src, temperature: _temp, ...rest } = data;
        void _ls; void _src; void _temp;
        await prisma.contact.update({
          where: { id: existing.id },
          data: rest,
        });
        updated++;
      } else {
        await prisma.contact.create({ data });
        imported++;
      }
    }

    return Response.json({
      message: `インポート完了: ${imported}件追加、${updated}件更新`,
      imported,
      updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "インポートに失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
