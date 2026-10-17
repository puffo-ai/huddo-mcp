export const QUERY_MAX_IDS = 1000;

export const uniqueIds = (ids: readonly string[]) => [...new Set(ids)].filter(Boolean);

export function idChunks(ids: readonly string[]): string[][] {
  const unique = uniqueIds(ids);
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += QUERY_MAX_IDS) chunks.push(unique.slice(i, i + QUERY_MAX_IDS));
  return chunks;
}

export async function queryMerged<T extends object>(
  ids: readonly string[],
  query: (chunk: string[]) => Promise<T>,
): Promise<T> {
  const parts = await Promise.all(idChunks(ids).map(query));
  return Object.assign({}, ...parts) as T;
}
