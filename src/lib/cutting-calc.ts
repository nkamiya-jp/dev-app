// 裁断計算: 製品の寸法と生地の巾から、1m あたりの取れ数を算出する
//
// 想定: 生地は反物状（巾 × 長さ）。製品は長方形（縦 × 横）で裁断する。
//
//   生地 1m から取れる個数 = floor(100cm / 縦) × floor(生地巾cm / 横)
//
// 例: 生地巾 72cm、製品 縦15cm × 横10cm
//   横方向に floor(72 / 10) = 7 個並ぶ
//   1m(100cm) 中に floor(100 / 15) = 6 段
//   → 1m から 7 × 6 = 42 個取れる

export interface CutDimensions {
  cutHeight: number | null;  // 縦 cm
  cutWidth: number | null;   // 横 cm
}

export interface FabricDimensions {
  fabricWidth: number | null; // 巾 cm
}

/**
 * 1m の生地から取れる個数を計算
 * 寸法が欠けている場合は null（不明）を返す
 */
export function calcYieldPerMeter(
  product: CutDimensions,
  fabric: FabricDimensions
): number | null {
  const { cutHeight, cutWidth } = product;
  const { fabricWidth } = fabric;

  if (!cutHeight || !cutWidth || !fabricWidth) return null;
  if (cutHeight <= 0 || cutWidth <= 0 || fabricWidth <= 0) return null;
  if (cutWidth > fabricWidth) return 0; // 巾より大きい裁断は不可

  const piecesPerRow = Math.floor(fabricWidth / cutWidth);
  const rowsPerMeter = Math.floor(100 / cutHeight);
  return piecesPerRow * rowsPerMeter;
}

/**
 * 取れ数から 1個あたりの生地コストを計算
 *   コスト/個 = 生地単価(¥/m) / 取れ数
 */
export function calcFabricCostPerPiece(
  fabricUnitPrice: number,
  yieldCount: number
): number {
  if (!yieldCount || yieldCount <= 0) return 0;
  return fabricUnitPrice / yieldCount;
}

/**
 * 計算結果の説明文を生成（UI 表示用）
 */
export function describeYield(
  product: CutDimensions,
  fabric: FabricDimensions
): string {
  if (!product.cutHeight || !product.cutWidth || !fabric.fabricWidth) {
    return "寸法が未設定";
  }
  if (product.cutWidth > fabric.fabricWidth) {
    return `裁断横(${product.cutWidth}) > 生地巾(${fabric.fabricWidth}) のため不可`;
  }
  const piecesPerRow = Math.floor(fabric.fabricWidth / product.cutWidth);
  const rowsPerMeter = Math.floor(100 / product.cutHeight);
  return `巾${fabric.fabricWidth}cm ÷ 横${product.cutWidth}cm = ${piecesPerRow}個並び × (100cm ÷ 縦${product.cutHeight}cm = ${rowsPerMeter}段) = ${piecesPerRow * rowsPerMeter}個/m`;
}
