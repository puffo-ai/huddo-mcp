export interface SearchQuery {
  text?: string;
  from?: ReadonlySet<string>;
  since?: number;
  until?: number;
  hasFile?: boolean;
}

export interface SearchItem {
  text: string;
  filenames: readonly string[];
  sender: string;
  sentAt: number;
}

export function matchesSearch(item: SearchItem, q: SearchQuery): boolean {
  if (q.from && !q.from.has(item.sender)) return false;
  if (q.since !== undefined && item.sentAt < q.since) return false;
  if (q.until !== undefined && item.sentAt > q.until) return false;
  if (q.hasFile && !item.filenames.length) return false;
  if (q.text) {
    const needle = q.text.toLowerCase();
    const hay = [item.text, ...item.filenames].join("\n").toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function searchTime(raw: string, now = Date.now()): number | null {
  const rel = /^(\d+)([mhdw])$/.exec(raw.trim());
  if (rel) {
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[rel[2] as "m" | "h" | "d" | "w"];
    return now - Number(rel[1]) * unit;
  }
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : at;
}

export const SEARCH_TIME_HINT = "use a date like 2026-10-19 or a span like 3d, 12h, 2w";
