// 署名付きセッションCookieのユーティリティ。
// ミドルウェア(Edge)とルートハンドラ(Node)の両方で動くよう、
// Web Crypto(crypto.subtle)＋btoa/atobのみで実装する（外部ライブラリ不要）。

export const SESSION_COOKIE = "dev-auth";
const enc = new TextEncoder();
const dec = new TextDecoder();

// TextEncoder/Uint8Array の総称型と Web Crypto の BufferSource 型の齟齬を吸収
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    buf(enc.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export interface SessionPayload {
  email: string;
  exp: number; // 失効UNIX秒
}

// email を含む署名付きトークンを作る
export async function createSessionToken(
  email: string,
  maxAgeSec: number,
  secret: string
): Promise<string> {
  const payload: SessionPayload = {
    email,
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  };
  const payloadB64 = b64urlFromBytes(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf(enc.encode(payloadB64))));
  return `${payloadB64}.${b64urlFromBytes(sig)}`;
}

// トークンを検証し、正しく未失効なら payload を返す。ダメなら null。
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      buf(bytesFromB64url(sigB64)),
      buf(enc.encode(payloadB64))
    );
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(bytesFromB64url(payloadB64))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// JWT(id_token)のペイロードを署名検証なしでデコードする（Googleのトークン
// エンドポイントからHTTPSで直接受け取った値なので、aud/iss/expを別途確認して使う）。
export function decodeJwtPayload(idToken: string): Record<string, unknown> | null {
  try {
    const part = idToken.split(".")[1];
    if (!part) return null;
    return JSON.parse(dec.decode(bytesFromB64url(part)));
  } catch {
    return null;
  }
}

// 認証が有効かどうか（必要な環境変数が揃っているか）。
// 未設定なら認証OFF（＝ロックアウトしない）。
export function isAuthConfigured(): boolean {
  return !!process.env.AUTH_SECRET && !!process.env.GOOGLE_CLIENT_ID;
}
