import { ProspectDetail } from "./prospect-detail";

export const dynamic = "force-dynamic";

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProspectDetail contactId={id} />;
}
