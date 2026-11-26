import type { StoredMessage } from "../../features/messages/domain/message";
import type { ConversationTarget } from "../../features/messages/domain/outgoing-message";

export type CoreSendRequest = Readonly<{
  target: ConversationTarget;
  contentType: string;
  content: unknown;
  idempotencyKey: string;
  replyToId?: string;
}>;

export type CoreMessageSender = Readonly<{ send(request: CoreSendRequest): Promise<StoredMessage> }>;

let installed: CoreMessageSender | null = null;
const waiters = new Set<(sender: CoreMessageSender) => void>();

export function installCoreMessageSender(sender: CoreMessageSender | null): void {
  installed = sender;
  if (sender) for (const waiter of [...waiters]) waiter(sender);
}

export function coreMessageSender(): CoreMessageSender | null {
  return installed;
}

export const SENDER_WAIT_MS = 60_000;

export function awaitCoreMessageSender(timeoutMs = SENDER_WAIT_MS): Promise<CoreMessageSender> {
  if (installed) return Promise.resolve(installed);
  return new Promise((resolve, reject) => {
    const ready = (sender: CoreMessageSender) => {
      waiters.delete(ready);
      clearTimeout(timer);
      resolve(sender);
    };
    const timer = setTimeout(() => {
      waiters.delete(ready);
      reject(new Error("The core runtime is not ready yet"));
    }, timeoutMs);
    waiters.add(ready);
  });
}
