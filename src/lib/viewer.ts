// ログイン中の人（メンバー）と権限の判定。サーバー側専用。
// ロードマップの秘匿は「画面で隠す」ではなく「サーバーが送らない」で行うので、API は必ずここを通す。
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { isAuthConfigured, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import type { Member } from "@/generated/prisma/client";

export type Permission = "president" | "staff" | "part";

export const PERMISSIONS: { id: Permission; label: string }[] = [
  { id: "president", label: "社長" },
  { id: "staff", label: "スタッフ" },
  { id: "part", label: "パート" },
];

export interface Viewer {
  memberId: string | null;
  name: string;
  email: string;
  permission: Permission;
  departments: string[];
  role: string | null;
  isPresident: boolean;
  isPart: boolean;
  isLeader: boolean; // 役割に「リーダー」「代行」→ 部門の全員分を扱える
  isAccounting: boolean; // 役割に「経理」→ 営業成績を入力できる
}

// ローカル（認証OFF）で権限ごとの見え方を確かめるための切り替え。本番（認証ON）では無視する
export const DEV_VIEW_AS_COOKIE = "dev-view-as";

export function splitDepartments(v: string | null | undefined): string[] {
  return String(v || "")
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canLogin(m: Pick<Member, "active" | "employment" | "permission">): boolean {
  return m.active && m.employment !== "退職" && ["president", "staff", "part"].includes(m.permission || "");
}

function toViewer(m: Member): Viewer {
  const permission = (m.permission as Permission) || "staff";
  const role = m.role || null;
  return {
    memberId: m.id,
    name: m.name,
    email: m.email || "",
    permission,
    departments: splitDepartments(m.departments),
    role,
    isPresident: permission === "president",
    isPart: permission === "part",
    isLeader: permission === "president" || /リーダー|代行/.test(role || ""),
    isAccounting: permission === "president" || /経理/.test(role || ""),
  };
}

function ownerViewer(email: string): Viewer {
  return {
    memberId: null,
    name: "社長",
    email,
    permission: "president",
    departments: [],
    role: null,
    isPresident: true,
    isPart: false,
    isLeader: true,
    isAccounting: true,
  };
}

const ownerEmails = () =>
  (process.env.OWNER_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// メンバー台帳にまだ社長のメールが無い（＝移行前）なら、従来どおりドメインだけで入れる（締め出し防止）
async function isBootstrap(): Promise<boolean> {
  const n = await prisma.member.count({ where: { permission: "president", email: { not: null } } });
  return n === 0;
}

// ログインしてよいメールか（Googleログインの戻りで使う）
export async function resolveLogin(email: string): Promise<"ok" | "not_member" | "retired"> {
  const e = email.toLowerCase();
  if (ownerEmails().includes(e)) return "ok";
  const m = await prisma.member.findUnique({ where: { email: e } });
  if (m) return canLogin(m) ? "ok" : "retired";
  return (await isBootstrap()) ? "ok" : "not_member";
}

export async function getViewer(): Promise<Viewer | null> {
  const store = await cookies();

  if (!isAuthConfigured()) {
    // ローカル開発：既定は社長。dev-view-as（メンバーID）でその人として見る
    const as = store.get(DEV_VIEW_AS_COOKIE)?.value;
    const m = as
      ? await prisma.member.findUnique({ where: { id: as } })
      : await prisma.member.findFirst({ where: { permission: "president" } });
    return m && canLogin(m) ? toViewer(m) : ownerViewer("local@localhost");
  }

  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET);
  if (!session) return null;
  const email = session.email.toLowerCase();
  const m = await prisma.member.findUnique({ where: { email } });
  if (m) return canLogin(m) ? toViewer(m) : null;
  if (ownerEmails().includes(email) || (await isBootstrap())) return ownerViewer(email);
  return null;
}

export const unauthorized = () => Response.json({ error: "ログインしてください" }, { status: 401 });
export const forbidden = (msg = "この操作の権限がありません") => Response.json({ error: msg }, { status: 403 });
