export const APP_LINK_RE = /(^|[^\w/:.-])app:([a-z0-9-]{1,40})(?:\/([A-Za-z0-9._~-]{1,64}))?/g;
const TARGET_RE = /^[A-Za-z0-9._~-]{1,64}$/;

export interface AppLink {
  appId: string;
  target: string | null;
}

export function isAppTarget(value: unknown): value is string {
  return typeof value === "string" && TARGET_RE.test(value);
}

export function formatAppLink(appId: string, target?: string | null): string {
  return target ? `app:${appId}/${target}` : `app:${appId}`;
}

export interface AppLinkMatch extends AppLink {
  start: number;
  end: number;
}

export function findAppLinks(text: string): AppLinkMatch[] {
  const out: AppLinkMatch[] = [];
  const re = new RegExp(APP_LINK_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    out.push({ appId: m[2], target: m[3] ?? null, start, end: m.index + m[0].length });
  }
  return out;
}

export const MAX_PANES = 2;

export function openInPanes(panes: string[], appId: string): string[] {
  if (panes.includes(appId)) return panes;
  return [appId, ...panes.slice(1)].slice(0, MAX_PANES);
}

export function splitPanes(panes: string[], appId: string): string[] {
  if (panes.length === 0 || panes.includes(appId)) return panes;
  return [panes[0], appId];
}

export function closePane(panes: string[], appId: string): string[] {
  return panes.filter((p) => p !== appId);
}

export function keepKnownPanes(panes: unknown, known: (appId: string) => boolean): string[] {
  if (!Array.isArray(panes)) return [];
  const out: string[] = [];
  for (const p of panes) if (typeof p === "string" && known(p) && !out.includes(p) && out.length < MAX_PANES) out.push(p);
  return out;
}
