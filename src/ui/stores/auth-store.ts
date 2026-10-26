import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useProfileCacheStore } from "./profile-cache-store";
import { clearAll as clearNameCache } from "../../features/notifications";
import { clearAll as clearStatusHistory } from "../services/agent-status-history";
import { clearPendingPasskey } from "../onboarding/pending-passkey";
import {
  bindMembershipRosterOwner,
} from "../../features/spaces/ui/membership-roster-store";
import {
  bindSpaceNavigationOwner,
  resetSpaceNavigationState,
} from "../../features/spaces/ui/space-store";
import { useMessageStore } from "./message-store-ui";
import { clearAttachmentBlobUrls } from "../../features/attachments/cache-lifecycle";
import {
  bindAgentIntegrationProjection,
  releaseAgentIntegrationProjection,
  type AgentIntegrationOwnerToken,
} from "./agent-integration-store";
import { useUiStore } from "./ui-store";
import { loadLastChatPath } from "../lib/last-chat-path";
import type {
  IdentitySessionProjection,
  IdentitySessionProjectionSink,
} from "../../application/runtime/identity-session-port";
import { bindAccountSessionOwner } from "../../application/runtime/account-session-owner";
import { clearConversationWindows } from "../lib/conversation-window-cache";
import { clearLocalCaches } from "../utils/local-cache";
import {
  bindInvitationOwner,
  releaseInvitationOwner,
  type InvitationOwnerToken,
} from "../../features/invitations/ui";

let explicitSignOutPending = false;
let explicitSignOutResetTimer: ReturnType<typeof setTimeout> | null = null;
let invitationSessionOwner: InvitationOwnerToken | null = null;
let agentIntegrationSessionOwner: AgentIntegrationOwnerToken | null = null;

function clearExplicitSignOutPending(): void {
  explicitSignOutPending = false;
  if (explicitSignOutResetTimer) clearTimeout(explicitSignOutResetTimer);
  explicitSignOutResetTimer = null;
}

export function isExplicitSignOutPending(): boolean {
  return explicitSignOutPending;
}

interface AuthState {
  slug: string | null;
  serverUrl: string | null;
  authenticated: boolean;
  sessionGeneration: number;
  computerName: string | null;
  setComputerName(name: string): void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      slug: null,
      serverUrl: null,
      authenticated: false,
      sessionGeneration: 0,
      computerName: null,
      setComputerName: (name) => set({ computerName: name }),
    }),
    {
      name: "puffo-auth",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

function activateAuthProjection({ slug, serverUrl }: IdentitySessionProjection): void {
  const previousSlug = useAuthStore.getState().slug;
  clearConversationWindows();
  clearExplicitSignOutPending();
  useUiStore.setState({
    lastSpacesPath: loadLastChatPath(slug) ?? "/chat",
    acceptedOpenInvite: null,
  });
  if (previousSlug !== slug) resetSpaceNavigationState();
  useMessageStore.getState().clearPendingSends();
  clearAttachmentBlobUrls();
  const nextGeneration = useAuthStore.getState().sessionGeneration + 1;
  bindMembershipRosterOwner({ slug, serverUrl, generation: nextGeneration });
  bindSpaceNavigationOwner({ slug, serverUrl, generation: nextGeneration });
  if (invitationSessionOwner) releaseInvitationOwner(invitationSessionOwner);
  invitationSessionOwner = bindInvitationOwner({ slug, serverUrl, generation: nextGeneration });
  if (agentIntegrationSessionOwner) releaseAgentIntegrationProjection(agentIntegrationSessionOwner);
  agentIntegrationSessionOwner = bindAgentIntegrationProjection({ slug, serverUrl, generation: nextGeneration });
  useAuthStore.setState({
    slug,
    serverUrl,
    authenticated: true,
    sessionGeneration: nextGeneration,
  });
  bindAccountSessionOwner({ slug, serverUrl, generation: nextGeneration });
}

function signOutAuthProjection(): void {
  clearConversationWindows();
  explicitSignOutPending = true;
  if (explicitSignOutResetTimer) clearTimeout(explicitSignOutResetTimer);
  explicitSignOutResetTimer = setTimeout(clearExplicitSignOutPending, 0);
  useUiStore.setState({ lastSpacesPath: "/chat", acceptedOpenInvite: null });
  resetSpaceNavigationState();
  bindSpaceNavigationOwner(null);
  useProfileCacheStore.getState().reset();
  clearLocalCaches();
  bindMembershipRosterOwner(null);
  if (invitationSessionOwner) releaseInvitationOwner(invitationSessionOwner);
  invitationSessionOwner = null;
  useMessageStore.getState().clearPendingSends();
  clearAttachmentBlobUrls();
  if (agentIntegrationSessionOwner) releaseAgentIntegrationProjection(agentIntegrationSessionOwner);
  agentIntegrationSessionOwner = null;
  void clearNameCache();
  void clearStatusHistory();
  clearPendingPasskey();
  const nextGeneration = useAuthStore.getState().sessionGeneration + 1;
  useAuthStore.setState({
    slug: null,
    serverUrl: null,
    authenticated: false,
    computerName: null,
    sessionGeneration: nextGeneration,
  });
  bindAccountSessionOwner(null);
}

function restoreAuthProjection(): void {
  const { authenticated, slug, serverUrl } = useAuthStore.getState();
  if (!authenticated || !slug || !serverUrl) return;
  activateAuthProjection({ slug, serverUrl });
}

export const authStoreIdentitySessionSink: IdentitySessionProjectionSink = {
  activate: activateAuthProjection,
  restore: restoreAuthProjection,
  signOut: signOutAuthProjection,
};
