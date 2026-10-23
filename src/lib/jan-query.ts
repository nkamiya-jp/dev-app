// JAN台帳の検索条件（一覧と書き出しで共通）— サーバ側専用
import type { Prisma } from "@/generated/prisma/client";

export interface JanFilter {
  q?: string | null;
  prefix?: string | null;
  status?: string | null;
  linked?: string | null; // "yes" | "no"
  amazon?: string | null; // "listed" | "comolife" | "past"
  productId?: string | null;
  ids?: string[] | null;
}

export function janFilterFromParams(sp: URLSearchParams): JanFilter {
  return {
    q: sp.get("q"),
    prefix: sp.get("prefix"),
    status: sp.get("status"),
    linked: sp.get("linked"),
    amazon: sp.get("amazon"),
    productId: sp.get("productId"),
    ids: sp.get("ids") ? sp.get("ids")!.split(",").filter(Boolean) : null,
  };
}

export function buildJanWhere(f: JanFilter): Prisma.JanItemWhereInput {
  const and: Prisma.JanItemWhereInput[] = [];
  if (f.ids?.length) and.push({ id: { in: f.ids } });
  if (f.prefix) and.push({ companyPrefix: f.prefix });
  if (f.status) and.push({ status: f.status });
  if (f.productId) and.push({ productId: f.productId });
  if (f.linked === "yes") and.push({ productId: { not: null } });
  if (f.linked === "no") and.push({ productId: null, status: "used" });
  if (f.amazon === "listed") and.push({ amazonListed: true });
  if (f.amazon === "comolife") and.push({ amazonComolife: true });
  if (f.amazon === "past") and.push({ OR: [{ pastAmazonListed: true }, { pastAmazonCode: { not: null } }] });
  // スペース区切りの各語をすべて含むもの（JAN・商品名・名称他・柄コード・過去Amazonコード・商品マスタ）
  const words = (f.q || "").split(/[\s　]+/).filter(Boolean);
  for (const w of words) {
    and.push({
      OR: [
        { jan: { contains: w } },
        { productName: { contains: w } },
        { nameOther: { contains: w } },
        { patternCode: { contains: w } },
        { pastAmazonCode: { contains: w } },
        { note: { contains: w } },
        { product: { is: { OR: [{ code: { contains: w } }, { name: { contains: w } }] } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}
