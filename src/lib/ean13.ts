// JAN（EAN-13）のチェックデジット計算・検証と、バーコードのモジュール列への変換。

// 先頭12桁からチェックデジットを求める（左から奇数桁×1、偶数桁×3）
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error("12桁の数字が必要です");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

// 13桁で、チェックデジットが正しいか
export function isValidEan13(jan: string): boolean {
  if (!/^\d{13}$/.test(jan)) return false;
  return ean13CheckDigit(jan.slice(0, 12)) === Number(jan[12]);
}

// 事業者コード＋品目コードから JAN（13桁）を組み立てる
export function buildJan(prefix: string, itemCode: number): string {
  const itemDigits = 12 - prefix.length;
  if (!/^\d+$/.test(prefix) || itemDigits < 1) throw new Error("事業者コードが不正です");
  if (!Number.isInteger(itemCode) || itemCode < 0 || itemCode >= 10 ** itemDigits) {
    throw new Error(`品目コードは 0〜${10 ** itemDigits - 1} の範囲で指定してください`);
  }
  const first12 = prefix + String(itemCode).padStart(itemDigits, "0");
  return first12 + ean13CheckDigit(first12);
}

// JAN を事業者コードと品目コードに分ける（事業者コードの桁数を指定）
export function splitJan(jan: string, prefixLength = 9): { prefix: string; itemCode: number } {
  return { prefix: jan.slice(0, prefixLength), itemCode: Number(jan.slice(prefixLength, 12)) };
}

// ── EAN-13 のバー（1=黒, 0=白 のモジュール列、全95モジュール） ──
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
// 先頭桁で決まる、左側6桁の L/G の並び
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export interface Ean13Encoding {
  modules: string; // 95文字の "0"/"1"
  guards: Set<number>; // ガードバーのモジュール位置（少し長く描く）
}

export function encodeEan13(jan: string): Ean13Encoding | null {
  if (!isValidEan13(jan)) return null;
  const d = jan.split("").map(Number);
  const parity = PARITY[d[0]];
  let left = "";
  for (let i = 0; i < 6; i++) left += (parity[i] === "L" ? L : G)[d[i + 1]];
  let right = "";
  for (let i = 7; i < 13; i++) right += R[d[i]];
  const modules = "101" + left + "01010" + right + "101";
  const guards = new Set<number>();
  for (const i of [0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]) guards.add(i);
  return { modules, guards };
}
