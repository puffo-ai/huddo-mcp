export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => v.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parse(candidate), parse(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

function isEntry(value: unknown): value is ChangelogEntry {
  const entry = value as Partial<ChangelogEntry> | null;
  return (
    typeof entry?.version === "string" &&
    typeof entry.date === "string" &&
    Array.isArray(entry.changes) &&
    entry.changes.every((change) => typeof change === "string")
  );
}

export function parseChangelog(body: unknown): ChangelogEntry[] {
  const entries = (body as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries) ? entries.filter(isEntry) : [];
}

export function unreadEntries(entries: ChangelogEntry[], cursor: string): ChangelogEntry[] {
  return entries
    .filter((entry) => isNewer(entry.version, cursor))
    .sort((a, b) => (isNewer(a.version, b.version) ? 1 : -1));
}

export function latestVersion(entries: ChangelogEntry[], fallback: string): string {
  return entries.reduce((latest, entry) => (isNewer(entry.version, latest) ? entry.version : latest), fallback);
}

export function formatChangelog(entries: ChangelogEntry[]): string {
  return entries
    .map((entry) => [`${entry.version} (${entry.date})`, ...entry.changes.map((change) => `- ${change}`)].join("\n"))
    .join("\n\n");
}
