import { create } from "zustand";
import type { StoredMessage } from "../../message/store/types";
import type { MessageEnvelope, PlaintextMessageEnvelope } from "../../message/core/types";
import {
  type DisplayMessage,
  type PendingSend,
  type PendingSendStatus,
} from "../../features/messages/ui/pending-send";
export {
  isResendable,
  resendStrategy,
  type DisplayMessage,
  type PendingSend,
  type PendingSendStatus,
  type ResendStrategy,
} from "../../features/messages/ui/pending-send";
import {
  insertInSentAtOrder,
  mergeInSentAtOrder,
  sortInSentAtOrder,
} from "./_message-ordering";

export const MESSAGE_LIST_START_INDEX = 1_000_000;

export function pendingSendsForDm(
  pendingSends: readonly PendingSend[],
  peerSlug: string,
  ownerSlug: string | null,
): PendingSend[] {
  return pendingSends.filter(
    (pending) =>
      pending.dmPeerSlug === peerSlug &&
      pending.message.sender_slug === ownerSlug,
  );
}

interface MessageState {
  messages: StoredMessage[];
  firstItemIndex: number;
  loading: boolean;
  sending: boolean;
  pendingSends: PendingSend[];

  setMessages(messages: StoredMessage[]): void;
  mergeMessages(
    messages: StoredMessage[],
    hiddenMessages?: ReadonlySet<string>,
  ): void;
  appendMessage(message: StoredMessage): void;
  prependMessages(
    messages: StoredMessage[],
    hiddenMessages?: ReadonlySet<string>,
  ): void;
  setLoading(loading: boolean): void;
  setSending(sending: boolean): void;
  clear(): void;

  addPendingSend(send: PendingSend): void;
  markPendingFailed(tempId: string, reason?: string): void;
  markPendingUnconfirmed(tempId: string, reason?: string): void;
  attachResendEnvelope(tempId: string, envelope: MessageEnvelope | PlaintextMessageEnvelope): void;
  markPendingSending(tempId: string): void;
  removePendingSend(tempId: string): void;
  clearPendingSends(): void;
  promotePendingSend(tempId: string, real: StoredMessage): void;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const pendingSendTimers = new Map<string, ReturnType<typeof setTimeout>>();
const originalsInFlight = new Set<string>();

export function isPendingSendInFlight(tempId: string): boolean {
  return originalsInFlight.has(tempId)
    && useMessageStore.getState().pendingSends.some((p) => p.tempId === tempId);
}

function armPendingSendTimer(tempId: string, onTimeout: () => void): void {
  const previous = pendingSendTimers.get(tempId);
  if (previous) clearTimeout(previous);
  pendingSendTimers.set(tempId, setTimeout(() => {
    pendingSendTimers.delete(tempId);
    onTimeout();
  }, FIVE_MINUTES_MS));
}

function clearPendingSendTimer(tempId: string): void {
  const timer = pendingSendTimers.get(tempId);
  if (timer) clearTimeout(timer);
  pendingSendTimers.delete(tempId);
}

function timedOutPatch(row: PendingSend): Partial<PendingSend> {
  return row.resendEnvelope
    ? { status: "unconfirmed", failureReason: "not confirmed — send again to be sure" }
    : { status: "failed", failureReason: "confirmation timed out" };
}

function pruneFirstPendingMatch(
  pendingSends: PendingSend[],
  real: StoredMessage,
): { pendingSends: PendingSend[]; removedTempId?: string } {
  const idx = pendingSends.findIndex(
    (pending) => pending.resendEnvelope?.envelope_id === real.envelope_id,
  );
  if (idx < 0) return { pendingSends };
  return {
    pendingSends: pendingSends.filter((_, i) => i !== idx),
    removedTempId: pendingSends[idx].tempId,
  };
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  firstItemIndex: MESSAGE_LIST_START_INDEX,
  loading: false,
  sending: false,
  pendingSends: [],

  setMessages: (messages) =>
    set({
      messages: sortInSentAtOrder(messages),
      firstItemIndex: MESSAGE_LIST_START_INDEX,
    }),
  mergeMessages: (messages, hiddenMessages) =>
    set((s) => {
      const replacement = sortInSentAtOrder(messages);
      const merged = mergeInSentAtOrder(replacement, s.messages);
      const known = new Set(
        s.messages.map((message) => message.envelope_id),
      );
      let pendingSends = s.pendingSends;
      for (const message of replacement) {
        if (!known.has(message.envelope_id)) {
          const match = pruneFirstPendingMatch(pendingSends, message);
          pendingSends = match.pendingSends;
          if (match.removedTempId) clearPendingSendTimer(match.removedTempId);
        }
      }
      const firstVisible = s.messages.find(
        (message) =>
          !message.thread_root_id &&
          !hiddenMessages?.has(message.envelope_id),
      );
      if (!firstVisible) return { messages: merged, pendingSends };

      let visibleAddedBeforeAnchor = 0;
      for (const message of merged) {
        if (message.envelope_id === firstVisible.envelope_id) break;
        if (
          !known.has(message.envelope_id) &&
          !message.thread_root_id &&
          !hiddenMessages?.has(message.envelope_id)
        ) {
          visibleAddedBeforeAnchor += 1;
        }
      }
      return {
        messages: merged,
        pendingSends,
        firstItemIndex: s.firstItemIndex - visibleAddedBeforeAnchor,
      };
    }),
  appendMessage: (message) =>
    set((s) => {
      if (s.messages.some((m) => m.envelope_id === message.envelope_id)) {
        return s;
      }
      const match = pruneFirstPendingMatch(s.pendingSends, message);
      if (match.removedTempId) clearPendingSendTimer(match.removedTempId);
      return {
        messages: insertInSentAtOrder(s.messages, message),
        pendingSends: match.pendingSends,
      };
    }),
  prependMessages: (messages, hiddenMessages) =>
    set((s) => {
      const known = new Set(s.messages.map((message) => message.envelope_id));
      let visibleAdded = 0;
      for (const message of messages) {
        if (known.has(message.envelope_id)) continue;
        known.add(message.envelope_id);
        if (
          !message.thread_root_id &&
          !hiddenMessages?.has(message.envelope_id)
        ) {
          visibleAdded += 1;
        }
      }
      return {
        messages: mergeInSentAtOrder(s.messages, messages),
        firstItemIndex: s.firstItemIndex - visibleAdded,
      };
    }),
  setLoading: (loading) => set({ loading }),
  setSending: (sending) => set({ sending }),
  clear: () =>
    set({
      messages: [],
      firstItemIndex: MESSAGE_LIST_START_INDEX,
      loading: false,
      sending: false,
    }),

  addPendingSend: (send) => {
    if (send.status === "sending") originalsInFlight.add(send.tempId);
    else originalsInFlight.delete(send.tempId);
    set((s) => ({ pendingSends: [...s.pendingSends, send] }));
    armPendingSendTimer(send.tempId, () => {
      const entry = get().pendingSends.find((p) => p.tempId === send.tempId);
      if (entry && entry.status === "sending") {
        const patch = timedOutPatch(entry);
        set((s) => ({
          pendingSends: s.pendingSends.map((p) =>
            p.tempId === send.tempId ? { ...p, ...patch } : p,
          ),
        }));
      }
    });
  },
  markPendingFailed: (tempId, reason = "send failed") => {
    originalsInFlight.delete(tempId);
    set((s) => ({
      pendingSends: s.pendingSends.map((p) =>
        p.tempId === tempId ? { ...p, status: "failed", failureReason: reason } : p,
      ),
    }));
  },
  markPendingUnconfirmed: (tempId, reason = "send failed") => {
    originalsInFlight.delete(tempId);
    set((s) => ({
      pendingSends: s.pendingSends.map((p) =>
        p.tempId === tempId
          ? p.resendEnvelope
            ? { ...p, status: "unconfirmed", failureReason: reason }
            : { ...p, status: "failed", failureReason: reason }
          : p,
      ),
    }));
  },
  attachResendEnvelope: (tempId, envelope) =>
    set((s) => ({
      pendingSends: s.pendingSends.map((p) =>
        p.tempId === tempId ? { ...p, resendEnvelope: envelope } : p,
      ),
    })),
  markPendingSending: (tempId) => {
    set((s) => ({
      pendingSends: s.pendingSends.map((p) =>
        p.tempId === tempId
          ? { ...p, status: "sending", startedAt: Date.now(), failureReason: undefined }
          : p,
      ),
    }));
    if (!get().pendingSends.some((p) => p.tempId === tempId)) return;
    armPendingSendTimer(tempId, () => {
      const entry = get().pendingSends.find((p) => p.tempId === tempId);
      if (entry?.status === "sending") {
        const patch = timedOutPatch(entry);
        set((s) => ({
          pendingSends: s.pendingSends.map((p) =>
            p.tempId === tempId ? { ...p, ...patch } : p,
          ),
        }));
      }
    });
  },
  removePendingSend: (tempId) => {
    originalsInFlight.delete(tempId);
    clearPendingSendTimer(tempId);
    set((s) => ({
      pendingSends: s.pendingSends.filter((p) => p.tempId !== tempId),
    }));
  },
  clearPendingSends: () => {
    originalsInFlight.clear();
    for (const tempId of pendingSendTimers.keys()) clearPendingSendTimer(tempId);
    set({ pendingSends: [] });
  },
  promotePendingSend: (tempId, real) => {
    originalsInFlight.delete(tempId);
    clearPendingSendTimer(tempId);
    set((s) => {
      const pendingSends = s.pendingSends.filter((p) => p.tempId !== tempId);
      const alreadyHave = s.messages.some(
        (m) => m.envelope_id === real.envelope_id,
      );
      const messages = alreadyHave
        ? s.messages
        : insertInSentAtOrder(s.messages, real);
      return { messages, pendingSends };
    });
  },
}));
