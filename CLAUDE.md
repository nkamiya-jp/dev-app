@AGENTS.md

# 別注開発管理（dev-app）作業ガイド

本番: https://dev.kamiya-craft.com ／ リポジトリ: nkamiya-jp/dev-app（main）
スタック: Next.js（改造版。AGENTS.md参照）＋ Prisma 7 + libsql ＋ Turso ＋ Vercel

## 最重要：DBは常に本番
- ローカル開発（localhost）も**本番のTurso DBに直結**している。localhost での書き込み検証は本番データを書き換える。
- データを変更するテストの前に対象をバックアップし、終わったら必ず元に戻す。ユーザーは同時に本番を使っている。
- DB接続には環境変数 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` が必要（ローカルは `.env`、クラウドセッションは環境のシークレットに設定）。

## デプロイ
- `git push origin main` → Vercel が自動デプロイ。
- 反映確認: `curl -s https://dev.kamiya-craft.com/api/version` のビルドIDが最新コミットSHAと一致するか。
- DB（スキーマ・データ）の変更はデプロイ不要で即時反映される。

## スキーマ変更
- `prisma migrate` は使わない。`scripts/*.mjs`（@libsql/client で生SQL）で ALTER/CREATE し、その後 `npx prisma generate`。
- 実行は `node --env-file=.env scripts/xxx.mjs`。スクリプトは必ず `scripts/` 配下に置く（/tmp からは @libsql/client を解決できない）。
- SQLite は二重引用符が識別子扱い。文字列はシングルクォートかバインド引数で渡す。

## Turso の落とし穴
- 本番（Vercel）では大きな `prisma.$transaction` が **P2028 で落ちる**（ローカルでは通るので気づきにくい）。一括更新は「値が変わる行だけ」「対象を絞る」。
- 書き込み系APIはクライアント側で必ず `res.ok` を確認し、失敗を無言にしない。

## 認証（Googleログイン）
- @kamiya-craft.com のGoogleアカウントのみ（Google側は「内部」アプリ）。実装: `src/lib/auth.ts` / `src/middleware.ts` / `src/app/api/auth/*`。
- Vercel環境変数: `AUTH_SECRET` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `ALLOWED_EMAIL_DOMAIN`（個別許可は任意で `ALLOWED_EMAILS`）。未設定なら認証OFF（ロックアウトしない設計）。
- 本番ページはログインが必要なので自動ブラウザ確認はできない。UIはローカル（認証OFF）で検証し、本番はビルドID確認＋ユーザー確認。

## 受注の取り込み（Slack・AI）
- 受注進捗ボード `/orders/board`。受注の進捗は `Order.stage`（received/production/preparing/shipped/cancelled）。従来の `status` とは API で相互同期。
- Slack #受注 の投稿は `/api/slack/events`（署名検証あり・ログイン不要）で `OrderDraft`（確認待ち）に保存。登録すると投稿に ✅。
- 投稿の明細化は `src/lib/order-parse.ts`（Claude `claude-opus-5-5`・構造化出力）。担当者が確定した「書き方→商品」は `ProductAlias` に記録して次回の読み取りに使う。
- 環境変数: `ANTHROPIC_API_KEY`、`SLACK_SIGNING_SECRET`、`SLACK_BOT_TOKEN`（任意で `SLACK_ORDER_CHANNEL_ID`）。いずれもVercelのみに設定（ローカルには無い）。

## 原価計算
- 正は `src/lib/product-cost.ts` の `calcCostBreakdown`。合計原価 = 制作費＋裁断費＋生地費＋資材費＋梱包資材費＋仕入＋販管費。**内職(workerCost)は含めない**。
- 制作費は固定4工程（口金/貼り/縫製/その他）。書き込みは `/api/products/production-step`（名前でupsert＋重複を畳む）を使う。重複すると制作費が倍になる。
- 仕入品（series=purchase）は 仕入単価＋販管費 のみ。
- 商品の並びは `compareProductOrder`（シリーズ順→シリーズ内sortOrder）を全画面の基準にする。

## PWA
- `public/sw.js` の `CACHE_NAME`（crm-vN）を上げると、有効化時に開いているタブを自動リロードして最新版を配る。UIを大きく変えたら上げる。
- localhost でもSWが古いバンドルを掴むことがある。検証時はSW解除＋キャッシュ削除してから確認する。
