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

// 売上月（締め月）＋支払サイトから、入金予定月を計算する
//
// 例: 締め翌月末払い（offset=1）→ 7月締め分は 8月に入金予定
//     締め翌々月10日払い（offset=2, day=10）→ 7月締め分は 9月に入金予定
//
// paymentMonthOffset: 何ヶ月後に入金か（未設定/0以下 → 1=翌月扱い）
// 返り値: "YYYY-MM"（入金予定月）
export function paymentMonth(salesYm: string, paymentMonthOffset?: number | null): string {
  const [ys, ms] = salesYm.split("-").map(Number);
  const offset = paymentMonthOffset && paymentMonthOffset >= 1 ? paymentMonthOffset : 1;
  let y = ys;
  let m = ms + offset; // 1-based
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// 支払サイトの表示ラベル（顧客編集や凡例用）
export function paymentTermLabel(offset?: number | null, day?: number | null): string {
  const o = offset && offset >= 1 ? offset : 1;
  const monthLabel = o === 1 ? "翌月" : o === 2 ? "翌々月" : `${o}ヶ月後`;
  const dayLabel = day && day >= 1 && day <= 30 ? `${day}日` : "末日";
  return `締め${monthLabel}${dayLabel}払い`;
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}
