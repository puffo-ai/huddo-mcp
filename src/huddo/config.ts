export const HUDDO_SERVER_URL: string =
  import.meta.env.VITE_HUDDO_SERVER_URL || "https://api.huddo.ai";

export const HUDDO_SIGNUP_ENDPOINT = "/huddo-api";

export function sessionOnOtherServer(sessionServer: string | null, current: string): boolean {
  if (!sessionServer) return false;
  return sessionServer.replace(/\/+$/, "") !== current.replace(/\/+$/, "");
}

const LANDMARKS = [
  "Eiffel", "Colosseum", "Taj Mahal", "Big Ben", "Petra", "Machu Picchu", "Acropolis", "Alhambra",
  "Angkor Wat", "Uluru", "Giza", "Kremlin", "Louvre", "Fuji", "Great Wall", "Stonehenge",
  "Sagrada", "Chichen Itza", "Golden Gate", "Liberty", "Neuschwanstein", "Matterhorn", "Niagara",
  "Sydney Opera", "Burj Khalifa", "Forbidden City", "Kinkaku", "Santorini", "Iguazu", "Table Mountain",
];

export function defaultGroupName(now: Date = new Date(), random: () => number = Math.random): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const landmark = LANDMARKS[Math.floor(random() * LANDMARKS.length)];
  return `Huddo ${landmark} ${mm}${dd}${now.getFullYear()}`;
}

export const SUPPORT_URL = "https://huddo.ai/invite/0di5xWuU";

export function chatPath(spaceId: string): string {
  return `/chat/${encodeURIComponent(spaceId)}`;
}

export function invitePath(code: string): string {
  return `/invite/${encodeURIComponent(code)}`;
}

export function cmdChatPath(spaceId: string): string {
  return `/cmd/${encodeURIComponent(spaceId)}`;
}

export function cmdInvitePath(code: string): string {
  return `/cmd/invite/${encodeURIComponent(code)}`;
}

export function mainChannelId(
  channels: ReadonlyArray<{ id: string; spaceId: string; kind: string; name: string }>,
  spaceId: string,
): string | null {
  const inSpace = channels.filter((c) => c.spaceId === spaceId && c.kind === "channel");
  return (inSpace.find((c) => c.name === "General") ?? inSpace[0])?.id ?? null;
}

const LAST_GROUP_KEY = "huddo.last-group.v1";

export interface HuddoGroupRef {
  slug: string;
  spaceId: string;
  channelId: string;
}

export function rememberLastGroup(ref: HuddoGroupRef): void {
  try {
    localStorage.setItem(LAST_GROUP_KEY, JSON.stringify(ref));
  } catch {}
}

export function readLastGroup(slug: string | null): HuddoGroupRef | null {
  if (!slug) return null;
  try {
    const raw = localStorage.getItem(LAST_GROUP_KEY);
    const parsed = raw ? (JSON.parse(raw) as HuddoGroupRef) : null;
    return parsed && parsed.slug === slug && parsed.spaceId && parsed.channelId ? parsed : null;
  } catch {
    return null;
  }
}

const shareLinkKey = (spaceId: string) => `huddo.share-link.v1:${spaceId}`;

export function rememberShareLink(spaceId: string, url: string): void {
  try {
    localStorage.setItem(shareLinkKey(spaceId), url);
  } catch {}
}

export function readShareLink(spaceId: string): string | null {
  try {
    return localStorage.getItem(shareLinkKey(spaceId));
  } catch {
    return null;
  }
}
