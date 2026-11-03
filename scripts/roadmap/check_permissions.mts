// ロードマップの権限テスト（「画面で隠す」ではなく「API が送らない」ことを確かめる）
// ローカルの開発サーバ（認証OFF）に、dev-view-as クッキーで社長・スタッフ・パートになりきって API を呼ぶ。
// テスト用の目標を一時的に作り、最後に必ず消す（ローカルも本番DBなので）。
// 実行: npx tsx --env-file=.env scripts/roadmap/check_permissions.mts [http://localhost:3001]
import { prisma } from "../../src/lib/db";

const BASE = process.argv[2] || "http://localhost:3001";
const TAG = "TEST-PERM-";
let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};

async function call(asId: string, path: string, init?: RequestInit) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: `dev-view-as=${asId}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const president = await prisma.member.findFirst({ where: { permission: "president" } });
const staff = await prisma.member.findFirst({ where: { permission: "staff", employment: "在籍" }, orderBy: { name: "asc" } });
const part = await prisma.member.findFirst({ where: { permission: "part", employment: "在籍" }, orderBy: { name: "asc" } });
if (!president || !staff || !part) throw new Error("社長・スタッフ・パートのメンバーが必要です");
console.log(`社長=${president.name} スタッフ=${staff.name} パート=${part.name}`);

const { term } = { term: (await prisma.appSetting.findUnique({ where: { key: "roadmap:現在の期" } }))?.value || "第10期" };
const mk = (memberId: string, key: string, status: string, extra: Record<string, unknown> = {}) =>
  prisma.personalGoal.create({
    data: { legacyId: TAG + key, memberId, term, kind: "四半期", quarter: "Q3", goal: `権限テスト ${key}`, status, ceoGrade: "A", ceoComment: "社長コメント（秘密）", ...extra },
  });

try {
  const final = await mk(staff.id, "staff-final", "確定");
  const review = await mk(staff.id, "staff-review", "評価中");
  const agreed = await mk(staff.id, "staff-agreed", "合意済");
  const other = await mk(part.id, "part-draft", "設定中");

  console.log("\n[スタッフ]");
  let r = await call(staff.id, "/api/roadmap/goals");
  const sg = (r.body?.goals || []) as Record<string, unknown>[];
  ok(r.status === 200, "自分の目標を取得できる");
  ok(sg.every((g) => g.memberId === staff.id), "他人の目標が含まれない");
  ok(!sg.some((g) => g.id === other.id), "パートの目標が含まれない");
  const f = sg.find((g) => g.id === final.id);
  const rv = sg.find((g) => g.id === review.id);
  ok(!!f && f.ceoGrade === "A" && f.ceoComment === "社長コメント（秘密）", "「確定」の目標には社長評価・社長コメントが含まれる");
  ok(!!rv && !("ceoGrade" in rv) && !("ceoComment" in rv), "「評価中」の目標には社長評価・社長コメントの項目そのものが無い");
  ok(!JSON.stringify(r.body).includes("社長コメント（秘密）") || !!f, "確定前の社長コメントの文字列がレスポンスに無い");
  ok(!("members" in (r.body || {})), "メンバー一覧（社長用）が含まれない");
  r = await call(staff.id, `/api/roadmap/goals?memberId=${part.id}`);
  ok(r.status === 403, "他人のIDを指定すると 403");
  r = await call(staff.id, "/api/roadmap/goals?memberId=*");
  ok(r.status === 403, "全員（*）を指定すると 403");
  r = await call(staff.id, `/api/roadmap/goals/${other.id}`, { method: "PUT", body: JSON.stringify({ goal: "書き換え" }) });
  ok(r.status === 403, "他人の目標は編集できない");
  r = await call(staff.id, `/api/roadmap/goals/${agreed.id}`, { method: "PUT", body: JSON.stringify({ goal: "内容を変更" }) });
  ok(r.status === 400, "「合意済」の目標の内容は変えられない");
  r = await call(staff.id, `/api/roadmap/goals/${agreed.id}`, { method: "PUT", body: JSON.stringify({ result: "12" }) });
  ok(r.status === 200 && r.body?.result === "12", "「合意済」でも実績は入れられる");
  r = await call(staff.id, `/api/roadmap/goals/${review.id}`, { method: "PUT", body: JSON.stringify({ ceoGrade: "S", status: "確定", selfGrade: "A" }) });
  const after = await prisma.personalGoal.findUnique({ where: { id: review.id } });
  ok(after?.ceoGrade === "A" && after?.status === "評価中" && after?.selfGrade === "A", "社長評価・状態は変えられない（本人評価だけ入る）");
  r = await call(staff.id, `/api/roadmap/goals/${final.id}`, { method: "PUT", body: JSON.stringify({ result: "99" }) });
  ok(r.status === 400, "「確定」の目標は編集できない");
  r = await call(staff.id, `/api/roadmap/goals/${agreed.id}`, { method: "DELETE" });
  ok(r.status === 403, "「合意済」の目標は削除できない");
  r = await call(staff.id, "/api/roadmap/biz-goals");
  ok(r.status === 200 && (r.body?.goals || []).every((g: Record<string, unknown>) => !("supporters" in g)), "事業目標のひも付けは人数・達成率だけ（誰の目標かは含まれない）");
  r = await call(staff.id, "/api/sales");
  ok(r.status === 200, "スタッフは売上（DEVの月次売上）を見られる");
  r = await call(staff.id, "/api/members", { method: "PUT", body: JSON.stringify({ id: staff.id, permission: "president" }) });
  ok(r.status === 403, "自分を社長に変えられない");

  console.log("\n[パート]");
  r = await call(part.id, "/api/roadmap/goals");
  ok(r.status === 200 && (r.body?.goals || []).every((g: Record<string, unknown>) => g.memberId === part.id), "自分の目標だけ");
  ok(!JSON.stringify(r.body).includes(staff.id), "スタッフの目標・IDが含まれない");
  r = await call(part.id, "/api/sales");
  ok(r.status === 403, "売上（DEVの月次売上）は 403");
  r = await call(part.id, "/api/roadmap/me");
  ok(r.body?.can?.sales === false && r.body?.can?.president === false, "メニュー：売上・社長ページは出さない");

  console.log("\n[社長]");
  r = await call(president.id, "/api/roadmap/goals?memberId=*");
  const pg = (r.body?.goals || []) as Record<string, unknown>[];
  ok(pg.some((g) => g.id === review.id && g.ceoGrade === "A"), "全員の目標と確定前の社長評価を見られる");
  ok(Array.isArray(r.body?.members) && r.body.members.length > 0, "メンバー一覧（名前ボタン）が含まれる");
  r = await call(president.id, `/api/roadmap/goals/${review.id}`, { method: "PUT", body: JSON.stringify({ status: "確定", ceoGrade: "S" }) });
  ok(r.status === 200 && r.body?.status === "確定", "状態・社長評価を変えられる");
  r = await call(president.id, "/api/roadmap/goals", { method: "POST", body: JSON.stringify({ memberId: part.id, kind: "月", month: "2026-11", goal: "権限テスト 代理入力" }) });
  ok(r.status === 201 && r.body?.memberId === part.id, "代理入力（他の人の目標を作る）ができる");
  if (r.body?.id) await prisma.personalGoal.update({ where: { id: r.body.id }, data: { legacyId: TAG + "proxy" } });
  r = await call(president.id, "/api/roadmap/biz-goals");
  ok(r.status === 200 && (r.body?.goals || []).every((g: Record<string, unknown>) => "supporters" in g), "事業目標のひも付けの中身（誰の目標か）を見られる");
} finally {
  const del = await prisma.personalGoal.deleteMany({ where: { legacyId: { startsWith: TAG } } });
  console.log(`\nテスト用の目標を削除：${del.count}件`);
}
console.log(failed ? `\n✗ ${failed}件 失敗` : "\n✓ すべて合格");
process.exit(failed ? 1 : 0);
