import type { PuffoHttpClient } from "../../../http/client";

export async function fetchMyAgentSlugs(
  http: PuffoHttpClient,
  mySlug: string,
): Promise<string[]> {
  const resp = await http.get<{
    agents?: { slug: string; status?: { state?: string } }[];
  }>(`/v2/agents?operator=${encodeURIComponent(mySlug)}`);
  return (resp.agents ?? [])
    .filter((agent) => agent.slug && agent.status?.state !== "archived")
    .map((agent) => agent.slug);
}
