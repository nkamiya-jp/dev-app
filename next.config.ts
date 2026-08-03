import type { NextConfig } from "next";

// デプロイ毎に変わるビルドID（Vercelはコミットsha、無ければビルド時刻）。
// クライアントに埋め込み、/api/version の現在値と比較して更新を検知する。
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || `${Date.now()}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  async generateBuildId() {
    return buildId;
  },
};

export default nextConfig;
