export interface SendBindingInput {
  serverUrl: string | null;
  slug: string | null;
  sessionGeneration: number;
  identity: object | null;
  http: object | null;
  messageStore: object | null;
}

export interface SendBinding extends SendBindingInput {
  token: symbol;
}

export function refreshSendBinding(
  current: SendBinding | null,
  input: SendBindingInput,
): SendBinding {
  if (
    current
    && current.serverUrl === input.serverUrl
    && current.slug === input.slug
    && current.sessionGeneration === input.sessionGeneration
    && current.identity === input.identity
    && current.http === input.http
    && current.messageStore === input.messageStore
  ) return current;
  return { ...input, token: Symbol("send-binding") };
}

export function assertSendBinding(
  expected: SendBinding,
  current: SendBinding,
  auth: Pick<SendBindingInput, "serverUrl" | "slug" | "sessionGeneration">,
  label: "Channel" | "DM",
): void {
  if (
    current.token !== expected.token
    || auth.slug !== expected.slug
    || auth.serverUrl !== expected.serverUrl
    || auth.sessionGeneration !== expected.sessionGeneration
  ) throw new Error(`${label} send session is no longer active`);
}
