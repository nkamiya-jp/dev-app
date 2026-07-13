// 曜日を合わせて別月へシフトする（例: 先月の第2月曜 → 今月の第2月曜）
// date は UTC 基準（DBは UTC 深夜0時で保持）。toMonth は "YYYY-MM"。
export function shiftWeekdayAligned(date: Date, toMonth: string): Date {
  const dow = date.getUTCDay();          // 0(日)-6(土)
  const dayOfMonth = date.getUTCDate();  // 1-31
  const occurrence = Math.floor((dayOfMonth - 1) / 7); // 0始まりの第N週

  const [ty, tm] = toMonth.split("-").map(Number);
  const first = new Date(Date.UTC(ty, tm - 1, 1));
  const firstDow = first.getUTCDay();
  let day = 1 + ((dow - firstDow + 7) % 7) + occurrence * 7;

  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  if (day > lastDay) day -= 7; // 第5週などで溢れたら1週戻す

  return new Date(Date.UTC(ty, tm - 1, day));
}

// "YYYY-MM" を n ヶ月ずらす
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  let yy = y;
  let mm = m + n;
  while (mm > 12) { mm -= 12; yy += 1; }
  while (mm < 1) { mm += 12; yy -= 1; }
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

// "YYYY-MM" の差（月数）。例: 2026-04 → 2026-08 = 4
export function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm);
}

// 日付を「monthsDelta ヶ月」ずらし、ずらした先の月内で曜日を合わせる。
// （依頼日と納期が別月にまたがっても、相対的な週・曜日の関係を保つ）
export function shiftDateByMonths(date: Date, monthsDelta: number): Date {
  const ym = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return shiftWeekdayAligned(date, addMonths(ym, monthsDelta));
}
