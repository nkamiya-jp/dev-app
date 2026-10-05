// Slack #受注 などの自由文から、受注の下書き（顧客・明細・発送予定）をAIで取り出す。
// 商品マスタ・顧客マスタを一覧で渡して照合させ、結果は必ずマスタに実在するものだけ採用する。
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getSeriesLabel } from "@/lib/product-meta";

export interface ParsedOrderItem {
  label: string; // 原文での書き方（例: 西）2.6寸）
  productId: string | null; // マスタと照合できた商品（できなければ null）
  quantity: number | null;
}

export interface ParsedOrder {
  isOrder: boolean;
  customerLabel: string; // 原文での顧客名
  contactId: string | null; // 顧客マスタと照合できた顧客
  items: ParsedOrderItem[];
  shipDate: string | null; // YYYY-MM-DD（読み取れた場合）
  shipHint: string | null; // 発送時期に関する原文の表現
  note: string | null; // 支払方法・注意点など
}

export class OrderParseError extends Error {}

const SYSTEM_PROMPT = `あなたは神谷クラフト（西陣織・友禅・伊勢型紙などのがま口や袋物の製造販売）の受注担当アシスタントです。
社内Slackの「#受注」チャンネルに書かれた自由文の投稿から、受注内容を取り出して商品マスタ・顧客マスタと照合してください。

投稿の特徴:
- 1行目付近に顧客名（「〇〇さん」「〇〇さま」「〇〇さんから注文入りました」など）。敬称は顧客名に含めない。
- 「SD〇〇」の「SD」は販売チャネルの略で、顧客名の一部として原文どおり残してよい。
- 明細は「商品名 数量」の行。数量は「×40」「40個」「40ケ」「40」などの書き方がある。
- 商品名の頭の「西）」は西陣、「友）」は友禅、「伊）」は伊勢シリーズの略。
- 「（注残）」は以前からの残り分、「（新規注文）」は新しい注文だが、どちらも明細に含める。
- メンション、あいさつ、出荷可否の質問は明細ではない。
- 発送時期（「10月末発送予定」「来月10/13の週発送予定」「今週出荷」など）があれば読み取る。
- 支払方法（PayPal請求・銀行振込など）や注意点は note にまとめる。

照合のルール:
- 商品は下の商品マスタの code で答える。シリーズの略が無く複数のシリーズに候補がある場合や、確信が持てない場合は productCode を null にする（推測で決めない）。
- 顧客は下の顧客マスタの番号（#の数字）で答える。確信が持てない場合は contactIndex を null にする。
- shipDate は日付が特定できる場合だけ YYYY-MM-DD で答える。「10月末」は月末日、「〇日の週」はその日付を使う。曖昧なら null にし、原文の表現を shipHint に入れる。
- 受注の投稿でない場合（連絡・質問のみなど）は isOrder を false にする。`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    isOrder: { type: "boolean" },
    customerLabel: { type: "string" },
    contactIndex: { anyOf: [{ type: "integer" }, { type: "null" }] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          productCode: { anyOf: [{ type: "string" }, { type: "null" }] },
          quantity: { anyOf: [{ type: "integer" }, { type: "null" }] },
        },
        required: ["label", "productCode", "quantity"],
        additionalProperties: false,
      },
    },
    shipDate: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
    shipHint: { anyOf: [{ type: "string" }, { type: "null" }] },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["isOrder", "customerLabel", "contactIndex", "items", "shipDate", "shipHint", "note"],
  additionalProperties: false,
} as const;

interface RawOutput {
  isOrder: boolean;
  customerLabel: string;
  contactIndex: number | null;
  items: { label: string; productCode: string | null; quantity: number | null }[];
  shipDate: string | null;
  shipHint: string | null;
  note: string | null;
}

function todayJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD
}

export async function parseOrderText(text: string): Promise<ParsedOrder> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new OrderParseError("AIのキー（ANTHROPIC_API_KEY）が設定されていません");
  }

  const [products, contacts] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true, series: true },
      orderBy: [{ series: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, company: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const productList = products
    .map((p) => `${p.code} | ${p.name} | ${getSeriesLabel(p.series) || "-"}`)
    .join("\n");
  const contactList = contacts
    .map((c, i) => `#${i} ${c.company || ""}${c.company && c.name !== c.company ? `（担当: ${c.name}）` : c.company ? "" : c.name}`)
    .join("\n");

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: [
      {
        type: "text",
        text: `${SYSTEM_PROMPT}\n\n## 商品マスタ（code | 商品名 | シリーズ）\n${productList}\n\n## 顧客マスタ\n${contactList}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `今日の日付: ${todayJST()}\n\n投稿:\n${text}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new OrderParseError("AIが内容を処理できませんでした。手入力で登録してください");
  }
  if (response.stop_reason === "max_tokens") {
    throw new OrderParseError("投稿が長すぎて読み取りきれませんでした。分けて貼り付けてください");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new OrderParseError("AIの応答を読み取れませんでした");
  }

  let raw: RawOutput;
  try {
    raw = JSON.parse(textBlock.text) as RawOutput;
  } catch {
    throw new OrderParseError("AIの応答を読み取れませんでした");
  }

  // マスタに実在するものだけ採用（AIの誤った照合を通さない）
  const byCode = new Map(products.map((p) => [p.code, p.id]));
  const contact = raw.contactIndex != null ? contacts[raw.contactIndex] : undefined;
  const shipDate = raw.shipDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.shipDate) ? raw.shipDate : null;

  return {
    isOrder: raw.isOrder,
    customerLabel: raw.customerLabel,
    contactId: contact?.id ?? null,
    items: raw.items.map((it) => ({
      label: it.label,
      productId: it.productCode ? byCode.get(it.productCode) ?? null : null,
      quantity: it.quantity != null && it.quantity > 0 ? it.quantity : null,
    })),
    shipDate,
    shipHint: raw.shipHint,
    note: raw.note,
  };
}
