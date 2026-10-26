const PREFIX = "puffo:last-chat-path:";

export function saveLastChatPath(slug: string | null, path: string): void {
  if (!slug) return;
  try {
    localStorage.setItem(`${PREFIX}${slug}`, path);
  } catch {
  }
}

export function loadLastChatPath(slug: string | null): string | null {
  if (!slug) return null;
  try {
    return localStorage.getItem(`${PREFIX}${slug}`);
  } catch {
    return null;
  }
}

export function resolveChatReturnPath(
  memo: string,
  slug: string | null,
  canRestore: (path: string) => boolean = () => true,
): string {
  const persisted = loadLastChatPath(slug);
  for (const candidate of [memo, persisted]) {
    if (candidate && candidate !== "/chat" && canRestore(candidate)) {
      return candidate;
    }
  }
  return "/chat";
}

export function resolveBootChatReturnPath(input: {
  memo: string;
  slug: string | null;
  initialSpaceId: string;
  initialSpacePinned: boolean;
  spaces: readonly { id: string }[];
  channels: readonly { id: string; spaceId: string }[];
}): string {
  return resolveChatReturnPath(input.memo, input.slug, (path) => {
    if (!isRestorableChatPath(path, input.spaces, input.channels)) return false;
    if (!input.initialSpacePinned) return true;
    const match = path.match(/^\/chat\/(sp_[^/]+)(?:\/ch_[^/]+)?\/?$/);
    return match?.[1] === input.initialSpaceId;
  });
}

export function isRestorableChatPath(
  path: string,
  spaces: readonly { id: string }[],
  channels: readonly { id: string; spaceId: string }[],
): boolean {
  if (/^\/chat\/(?:dm\/[^/]+|dms|all-dms)\/?$/.test(path)) return true;
  const match = path.match(/^\/chat\/(sp_[^/]+)(?:\/(ch_[^/]+))?\/?$/);
  if (!match || !spaces.some((space) => space.id === match[1])) return false;
  return !match[2] || channels.some(
    (channel) => channel.id === match[2] && channel.spaceId === match[1],
  );
}

const TOPIC_PREFIX = "puffo:last-topic:";

export function saveLastTopic(spaceId: string, channelId: string): void {
  try {
    localStorage.setItem(`${TOPIC_PREFIX}${spaceId}`, channelId);
  } catch {
  }
}

export function loadLastTopic(spaceId: string): string | null {
  try {
    return localStorage.getItem(`${TOPIC_PREFIX}${spaceId}`);
  } catch {
    return null;
  }
}

export function resolveMyGroupId(
  spaces: { id: string }[],
  mySpaceId: string | null,
  mySlug: string | null,
  accountLoaded: boolean,
): string | null {
  if (!mySlug) return null;
  const cacheKey = `weave-my-space:${mySlug}`;
  if (mySpaceId) {
    try { localStorage.setItem(cacheKey, mySpaceId); } catch {}
    return spaces.some((sp) => sp.id === mySpaceId) ? mySpaceId : null;
  }
  if (accountLoaded) {
    try { localStorage.removeItem(cacheKey); } catch {}
    return null;
  }
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached && spaces.some((sp) => sp.id === cached)) return cached;
  } catch {}
  return null;
}

export function resolveDefaultAgentSpaceId(
  spaces: { id: string }[],
  myGroupId: string | null,
  activeSpaceId: string | null,
): string {
  const preferred = [myGroupId, activeSpaceId]
    .find((id) => !!id && spaces.some((sp) => sp.id === id));
  return preferred ?? spaces[0]?.id ?? "";
}

export function isMyGroupOrIndeterminate(
  spaces: { id: string }[],
  mySpaceId: string | null,
  mySlug: string | null,
  accountLoaded: boolean,
  spaceId: string,
): boolean {
  if (!accountLoaded) return true;
  return resolveMyGroupId(spaces, mySpaceId, mySlug, accountLoaded) === spaceId;
}
