import { NextRequest } from "next/server";
import { loadStandingCards } from "@/lib/standing-server";
import { todayJst } from "@/lib/roadmap/settings";

export const dynamic = "force-dynamic";

// GET /api/orders/standing?month=YYYY-MM — 定期のお客さん（発注カード）。想定と今月・今週の注文
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("month") || "";
  const month = /^\d{4}-\d{2}$/.test(q) ? q : todayJst().slice(0, 7);
  return Response.json({ month, cards: await loadStandingCards(month) });
}
