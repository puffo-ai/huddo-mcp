export interface PushPayload {
  envelope_id?: string;
  sender_slug?: string;
  channel_id?: string | null;
  space_id?: string | null;
  kind?: string;
  sender_name?: string;
  space_name?: string | null;
  body?: string;
  whisper?: boolean;
}

export interface NotificationDescriptor {
  title: string;
  options: NotificationOptions & { data?: PushPayload };
}

export function humanizeSlug(slug: string): string {
  const head = slug.split("-")[0] || slug;
  return head.charAt(0).toLocaleUpperCase() + head.slice(1);
}

export interface ResolvedNames {
  spaceName?: string | null;
  channelName?: string | null;
  senderName?: string | null;
}

export function buildNotification(
  payload: PushPayload | undefined,
  foreground = false,
  names: ResolvedNames = {},
  preview = true,
): NotificationDescriptor {
  const safe: PushPayload = payload ?? {};
  const senderSlug = safe.sender_slug ?? "";
  let body = "有新消息 · New message";
  let title: string;
  if (typeof safe.body === "string") {
    const sender = safe.sender_name || names.senderName || humanizeSlug(senderSlug);
    title = safe.space_name ? `${sender} · ${safe.space_name}` : sender;
    body = preview || safe.whisper ? safe.body : "New message";
  } else if (safe.channel_id && safe.space_id) {
    const sp = names.spaceName ?? safe.space_id;
    const ch = names.channelName ?? safe.channel_id;
    title = `${sp} #${ch}`;
  } else if (senderSlug) {
    title = names.senderName ?? humanizeSlug(senderSlug);
  } else {
    title = "Huddo";
  }
  return {
    title,
    options: {
      body,
      tag: foreground ? "puffo-foreground" : (safe.envelope_id ?? "puffo-message"),
      icon: "/huddo-icon-512.png",
      badge: "/huddo-badge.png",
      silent: foreground,
      data: safe,
    },
  };
}

export function urlFromPayload(payload: PushPayload | undefined): string {
  if (!payload) return "/chat";
  const msgId = payload.envelope_id ? `?msg_id=${encodeURIComponent(payload.envelope_id)}` : "";
  if (payload.space_id) {
    return `/chat/${payload.space_id}${msgId}`;
  }
  if (payload.sender_slug) {
    return `/chat/dm/${payload.sender_slug}${msgId}`;
  }
  return "/chat";
}

export interface NotificationWindowClient {
  url: string;
  focus(): Promise<unknown>;
  postMessage(message: unknown): void;
}

export interface NotificationClickTransport {
  matchWindows(): Promise<readonly NotificationWindowClient[]>;
  openWindow?(url: string): Promise<unknown>;
}

export interface NotificationClickEventLike {
  notification: { data?: PushPayload; close(): void };
  waitUntil(promise: Promise<void>): void;
}

export interface NotificationClickScope {
  clients: {
    matchAll(options: { type: "window"; includeUncontrolled: true }): Promise<readonly NotificationWindowClient[]>;
    openWindow?: (url: string) => Promise<unknown>;
  };
  addEventListener(type: "notificationclick", listener: (event: NotificationClickEventLike) => void): void;
}

export async function deliverNotificationClick(
  transport: NotificationClickTransport,
  payload: PushPayload | undefined,
): Promise<void> {
  const url = urlFromPayload(payload);
  const windows = await transport.matchWindows();
  const chat = windows.find((client) => client.url.includes("/chat"));
  if (chat) {
    await chat.focus();
    chat.postMessage({ type: "puffo:notification-click", url });
    return;
  }
  await transport.openWindow?.(url);
}

export function registerNotificationClickHandler(scope: NotificationClickScope): void {
  scope.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(deliverNotificationClick({
      matchWindows: () => scope.clients.matchAll({ type: "window", includeUncontrolled: true }),
      openWindow: scope.clients.openWindow
        ? (url) => scope.clients.openWindow!(url)
        : undefined,
    }, event.notification.data));
  });
}

export function parsePushData(data: PushMessageData | null | undefined): PushPayload {
  if (!data) return {};
  try {
    const parsed = data.json();
    if (parsed && typeof parsed === "object") return parsed as PushPayload;
  } catch {
  }
  return {};
}

export function isAnyClientForeground(
  clients: ReadonlyArray<Pick<WindowClient, "visibilityState">>,
): boolean {
  return clients.some((c) => c.visibilityState === "visible");
}
