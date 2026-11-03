import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { forbidden, getViewer, PERMISSIONS, splitDepartments, unauthorized, type Viewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// ログイン・権限に関わる項目（社長だけが変えられる）
const ACCESS_FIELDS = ["email", "permission", "departments", "employment"] as const;
// それ以外で画面から変えてよい項目
const BASIC_FIELDS = ["name", "role", "color", "type", "phone", "specialties", "active"] as const;

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type"); // staff | worker | (省略=全件)
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (!includeInactive) where.active = true;

  const members = await prisma.member.findMany({
    where,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return Response.json(members);
}

// メンバーの追加・変更は社長と部門リーダー。ログイン・権限の項目は社長だけ
function pickData(body: Record<string, unknown>, v: Viewer): { data: Record<string, unknown> } | { error: Response } {
  const data: Record<string, unknown> = {};
  for (const k of BASIC_FIELDS) if (body[k] !== undefined) data[k] = body[k];
  const touchesAccess = ACCESS_FIELDS.some((k) => body[k] !== undefined);
  if (touchesAccess) {
    if (!v.isPresident) return { error: forbidden("ログイン・権限の項目は社長だけが変更できます") };
    if (body.email !== undefined) data.email = String(body.email || "").trim().toLowerCase() || null;
    if (body.permission !== undefined) {
      const p = String(body.permission || "");
      data.permission = PERMISSIONS.some((x) => x.id === p) ? p : null;
    }
    if (body.departments !== undefined) {
      const list = Array.isArray(body.departments) ? body.departments.map(String) : splitDepartments(String(body.departments || ""));
      data.departments = list.length ? list.join("、") : null;
    }
    if (body.employment !== undefined) data.employment = body.employment === "退職" ? "退職" : "在籍";
  }
  return { data };
}

async function guard() {
  const v = await getViewer();
  if (!v) return { error: unauthorized() };
  if (!v.isPresident && !v.isLeader) return { error: forbidden("メンバーの変更は社長・リーダーだけができます") };
  return { v };
}

function emailTaken(e: unknown) {
  return (e as { code?: string })?.code === "P2002"
    ? Response.json({ error: "そのメールアドレスは別のメンバーに登録されています" }, { status: 409 })
    : null;
}

export async function POST(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const body = await request.json();
  const r = pickData(body, g.v);
  if ("error" in r) return r.error;
  if (!String(r.data.name || "").trim()) return Response.json({ error: "名前を入力してください" }, { status: 400 });
  try {
    const member = await prisma.member.create({
      data: {
        color: "#3b82f6",
        type: "staff",
        active: true,
        ...r.data,
        name: String(r.data.name),
      },
    });
    return Response.json(member, { status: 201 });
  } catch (e) {
    const t = emailTaken(e);
    if (t) return t;
    throw e;
  }
}

export async function PUT(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
  const r = pickData(body, g.v);
  if ("error" in r) return r.error;
  try {
    const member = await prisma.member.update({ where: { id: String(body.id) }, data: r.data });
    return Response.json(member);
  } catch (e) {
    const t = emailTaken(e);
    if (t) return t;
    throw e;
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  // 物理削除ではなく非アクティブ化
  await prisma.member.update({ where: { id }, data: { active: false } });
  return Response.json({ ok: true });
}
