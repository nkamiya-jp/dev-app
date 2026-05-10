// 週関連のユーティリティ
// 週は月曜始まり、月の中の Mon-Fri を1週とする（土日含めない）
// 月の境界では切り詰める

export interface Week {
  monday: string; // "2026-05-04"
  startDate: string; // 月内の最初の平日
  endDate: string; // 月内の最後の平日（金 or 月末）
  label: string; // "5/4-5/8"
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdToString(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function mdLabel(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 指定月の週リストを生成
// month: "2026-05"
export function getWeeksOfMonth(month: string): Week[] {
  const [y, m] = month.split("-").map(Number);
  const firstOfMonth = new Date(y, m - 1, 1);
  const lastOfMonth = new Date(y, m, 0); // 月末

  // この月の最初の月曜を見つける（前月の最終週かも）
  // ただし、月初が金/土/日の場合は次の月曜から始める想定だと月初の数日が漏れる
  // スプシは「4/1-4/3」のように月初の半端な週を表示するので、
  // 月初の日が含まれる週から始める

  // 月初の月曜を探す（その週の月曜）
  let cursor = new Date(firstOfMonth);
  const dow = cursor.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  cursor = new Date(y, m - 1, 1 + offsetToMon);

  const weeks: Week[] = [];
  while (cursor <= lastOfMonth) {
    const monday = new Date(cursor);
    const friday = new Date(cursor);
    friday.setDate(friday.getDate() + 4);

    // 表示開始日 = 月内最初の日 (max(monday, firstOfMonth))
    const startDate = monday < firstOfMonth ? new Date(firstOfMonth) : new Date(monday);
    // 表示終了日 = 金曜と月末の早い方
    const endDate = friday > lastOfMonth ? new Date(lastOfMonth) : new Date(friday);

    if (startDate <= endDate) {
      weeks.push({
        monday: ymdToString(monday),
        startDate: ymdToString(startDate),
        endDate: ymdToString(endDate),
        label:
          startDate.getDate() === endDate.getDate()
            ? mdLabel(startDate)
            : `${mdLabel(startDate)}-${mdLabel(endDate)}`,
      });
    }

    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks;
}

export function ymString(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
