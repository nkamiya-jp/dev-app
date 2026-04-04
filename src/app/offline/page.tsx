export default function OfflinePage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        <p className="text-4xl">📡</p>
        <h2 className="text-xl font-bold">オフラインです</h2>
        <p className="text-gray-500">
          インターネット接続が復旧すると自動的に再接続されます。
        </p>
        <p className="text-sm text-gray-400">
          キャッシュ済みのデータは閲覧できます。
        </p>
      </div>
    </div>
  );
}
