const SANSAN_API_BASE = "https://api.sansan.com/v3.0";

interface SansanBizCard {
  id: string;
  personId: string;
  companyName: string;
  lastName: string;
  firstName: string;
  departmentName: string;
  title: string;
  email: string;
  mobile: string;
  address: string;
}

interface SansanResponse {
  data: SansanBizCard[];
  hasMore: boolean;
}

export async function fetchBizCards(apiKey: string): Promise<SansanBizCard[]> {
  const res = await fetch(`${SANSAN_API_BASE}/bizCards?limit=100&range=all`, {
    headers: {
      "X-Sansan-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sansan API error: ${res.status} - ${text}`);
  }

  const json: SansanResponse = await res.json();
  return json.data;
}

export function bizCardToContact(card: SansanBizCard) {
  return {
    name: `${card.lastName} ${card.firstName}`.trim(),
    company: card.companyName || null,
    department: card.departmentName || null,
    title: card.title || null,
    email: card.email || null,
    phone: card.mobile || null,
    address: card.address || null,
    sansanPersonId: card.personId,
  };
}
