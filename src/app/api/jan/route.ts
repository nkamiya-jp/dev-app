import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildJan, isValidEan13 } from "@/lib/ean13";
import { buildJanWhere, janFilterFromParams } from "@/lib/jan-query";

export const dynamic = "force-dynamic";

const PAGE_SIZE_MAX = 500;

// GET /api/jan?q=&prefix=&status=&linked=&amazon=&page=&pageSize=
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const where = buildJanWhere(janFilterFromParams(sp));
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(sp.get("pageSize")) || 100));
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const [items, total, prefixes, counts] = await Promise.all([
    prisma.janItem.findMany({
      where,
      orderBy: { jan: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: { select: { id: true, code: true, name: true } } },
    }),
    prisma.janItem.count({ where }),
    prisma.janPrefix.findMany({ orderBy: { prefix: "asc" } }),
    prisma.janItem.groupBy({ by: ["companyPrefix", "status"], _count: { _all: true } }),
  ]);

  const prefixSummary = prefixes.map((p) => {
    const c = (st: string) =>
      counts.find((x) => x.companyPrefix === p.prefix && x.status === st)?._count._all ?? 0;
    return { ...p, used: c("used"), reserved: c("reserved"), free: c("free") };
  });

  return Response.json({ items, total, page, pageSize, prefixes: prefixSummary });
}

// POST /api/jan — 新規登録（空き・確保の番号に割り当てるか、台帳に無い番号を追加する）
// body: { jan? , prefix?, itemCode?, status?, productName, nameOther, patternCode, productId, amazon*, pastAmazonCode, note }
export async function POST(request: NextRequest) {
  const b = await request.json();
  let jan: string;
  try {
    jan = b.jan ? String(b.jan).replace(/\D/g, "") : buildJan(String(b.prefix || ""), Number(b.itemCode));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "JANを組み立てられません" }, { status: 400 });
  }
  if (!isValidEan13(jan)) {
    return Response.json({ error: "JANのチェックデジットが正しくありません（13桁・チェックデジットを確認してください）" }, { status: 400 });
  }

  const prefix = String(b.prefix || jan.slice(0, 9));
  if (!jan.startsWith(prefix)) return Response.json({ error: "JANと事業者コードが一致しません" }, { status: 400 });
  const itemCode = Number(jan.slice(prefix.length, 12));
  const status = ["used", "reserved", "free"].includes(b.status) ? b.status : "used";
  const productName = (b.productName || "").trim() || null;
  const nameOther = (b.nameOther || "").trim() || null;
  if (status === "used" && !productName && !nameOther) {
    return Response.json({ error: "使用中にするには商品名か名称他を入力してください" }, { status: 400 });
  }

  const existing = await prisma.janItem.findUnique({ where: { jan } });
  if (existing?.status === "used") {
    return Response.json({ error: `${jan} はすでに使用中です（${existing.productName || existing.nameOther || ""}）` }, { status: 409 });
  }
  // 過去にAmazonで使われた番号は再利用しない
  const past = await prisma.janItem.findFirst({ where: { pastAmazonCode: jan }, select: { id: true } });
  if (past) return Response.json({ error: `${jan} は過去のAmazonコードとして使われています` }, { status: 409 });

  const data = {
    status,
    productName,
    nameOther,
    patternCode: (b.patternCode || "").trim() || null,
    productId: b.productId || null,
    amazonListed: !!b.amazonListed,
    amazonComolife: !!b.amazonComolife,
    pastAmazonListed: !!b.pastAmazonListed,
    pastAmazonCode: (b.pastAmazonCode || "").replace(/\D/g, "") || null,
    note: (b.note || "").trim() || null,
  };
  const item = existing
    ? await prisma.janItem.update({ where: { id: existing.id }, data })
    : await prisma.janItem.create({ data: { jan, companyPrefix: prefix, itemCode, ...data } });
  return Response.json(item, { status: existing ? 200 : 201 });
}
