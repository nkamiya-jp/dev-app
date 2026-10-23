// アーティファクト台帳の設定にあって DEV に無い事業者コードを「無効（採番に使わない）」で登録する
import { prisma } from "../src/lib/db";
const add = [
  { prefix: "0850069508", label: "US UPC（GS1 US）", rangeStart: 1, rangeEnd: 2, note: "アーティファクト台帳より。米国GS1の番号。採番はGS1 USで行う" },
  { prefix: "457008971", label: null, rangeStart: 0, rangeEnd: 999, note: "アーティファクト台帳の設定にあり。GJDBで貸与・使用状況を確認してから有効にする" },
  { prefix: "457008972", label: null, rangeStart: 0, rangeEnd: 999, note: "アーティファクト台帳の設定にあり。GJDBで貸与・使用状況を確認してから有効にする" },
];
for (const p of add) {
  const r = await prisma.janPrefix.upsert({ where: { prefix: p.prefix }, update: {}, create: { ...p, active: false } });
  console.log(r.prefix, r.active);
}
