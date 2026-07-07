// 締日をもとに、受注日がどの月の売上になるかを判定する
//
// 例: 20日締め → 21日〜翌月20日の受注を「翌月」の売上として集計
//     末日締め（closingDay=null/0/31以上）→ 受注月がそのまま売上月
//
// 返り値: "YYYY-MM"

export function salesMonth(orderDate: string | Date, closingDay?: number | null): string {
  const d = typeof orderDate === "string" ? new Date(orderDate) : orderDate;
  let y = d.getFullYear();
  let m = d.getMonth(); // 0-11
  const day = d.getDate();

  const c = closingDay && closingDay >= 1 && closingDay <= 30 ? closingDay : null;
  if (c !== null && day > c) {
    // 締日を過ぎた分は翌月の売上
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

// 直近 n ヶ月分の "YYYY-MM" ラベルを新しい順→古い順で返す（基準月を含む）
export function recentMonths(n: number, baseYear: number, baseMonth1: number): string[] {
  // baseMonth1 は 1-12
  const out: string[] = [];
  let y = baseYear;
  let m = baseMonth1; // 1-12
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return out;
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}
