// 機能のON/OFF。一時的に止めている機能はここで切り替える。

// Slack #受注 からの受注取り込み（/api/slack/events の自動取り込み、受注進捗ボードの「Slackから登録」・確認待ち）。
// 2026-11-25 NAOの判断で一旦停止。再開するときは true に戻し、Slack アプリの Event Subscriptions の
// Request URL を https://hub.kamiya-craft.com/api/slack/events に設定する。
export const SLACK_ORDER_IMPORT_ENABLED = false;
