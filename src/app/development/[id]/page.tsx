import { DevelopmentDetail } from "./development-detail";

export const dynamic = "force-dynamic";

export default async function DevelopmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DevelopmentDetail id={id} />;
}
