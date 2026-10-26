import { create } from "zustand";
import type { NewAgentSpec } from "../components/agent/parse-new-agent-command";
import type { AgentTemplate } from "../../features/agents/ui/controllers/agent-template";
import type { NewChannelSpec } from "../components/channel/parse-new-channel-command";

export interface ChannelCardSource {
  threadRootId: string;
  channelId: string;
}

export interface ChannelCreatedReply extends ChannelCardSource {
  newChannelId: string;
  newChannelName: string;
}

export type ActivePane =
  | "settings"
  | "devices"
  | "agents"
  | "invites"
  | "blocklist"
  | "search"
  | null;

export type MobileTab = "chat" | "contacts" | "profile";

export type SidebarTab = "chat" | "members";

export type SettingsTab =
  | "account"
  | "appearance"
  | "language"
  | "notifications"
  | "manage-groups"
  | "devices"
  | "invitations"
  | "blocked-accounts"
  | "data"
  | "releases"
  | "billing";

export const SETTINGS_TABS: readonly SettingsTab[] = [
  "account",
  "appearance",
  "language",
  "notifications",
  "manage-groups",
  "devices",
  "invitations",
  "blocked-accounts",
  "data",
  "releases",
  "billing",
];

export function isSettingsTab(v: string | undefined): v is SettingsTab {
  return v !== undefined && (SETTINGS_TABS as readonly string[]).includes(v);
}

export type ChannelPanelView =
  | "members"
  | "settings"
  | "agent"
  | "human"
  | "computer"
  | null;

interface UiState {
  sidebarOpen: boolean;
  channelPanelView: ChannelPanelView;
  channelPanelSubjectId: string | null;
  channelPanelProfileContext: "default" | "contacts" | "accepted-dm";
  activePane: ActivePane;
  mobileTab: MobileTab;
  sidebarTab: SidebarTab;
  showImportAgentModal: boolean;
  importAgentInitialMachineId: string | null;
  showCreateAgentModal: boolean;
  createAgentInitialMachineId: string | null;
  createAgentInitialFields: NewAgentSpec | null;
  createAgentTemplate: AgentTemplate | null;
  showCreateChannelModal: boolean;
  createChannelInitialFields: NewChannelSpec | null;
  createChannelSource: ChannelCardSource | null;
  pendingChannelCreatedReply: ChannelCreatedReply | null;
  showAddComputerNudge: boolean;
  lastSpacesPath: string;
  lastDmsPath: string;
  lastSpacesSidebarOpen: boolean;
  lastDmsAtList: boolean;
  noComputerBannerDismissed: boolean;
  editingSpaceId: string | null;
  editingChannelId: string | null;
  addMemberModalPending: boolean;
  mobileProfileSectionRequest: string | null;
  mobileManageSpacesTargetId: string | null;
  mobileAgentsOverlayOpen: boolean;
  mobileAgentsOverlayReturnToSidebar: boolean;
  weaveNavigationCompact: boolean;
  topicOverviewOpen: boolean;
  inviteToSpaceId: string | null;
  inviteToSpaceInitialTab: "humans" | "agents";
  createInviteLinkSpaceId: string | null;
  showJoinInviteModal: boolean;
  acceptedOpenInvite: {
    spaceId: string;
    channelId: string | null;
    spaceName: string;
    addedTopics?: string[];
    slug: string;
    serverUrl: string;
    sessionGeneration: number;
  } | null;
  dismissNoComputerBanner(): void;
  openEditSpaceModal(spaceId: string | null): void;
  openEditChannelModal(channelId: string | null): void;
  toggleSidebar(): void;
  toggleMembers(): void;
  setSidebarOpen(open: boolean): void;
  setMembersOpen(open: boolean): void;
  setChannelSettingsPanelOpen(open: boolean): void;
  setChannelPanelView(view: ChannelPanelView): void;
  openProfilePanel(kind: "agent" | "human" | "computer", subjectId: string, context?: "default" | "contacts" | "accepted-dm"): void;
  showPane(pane: Exclude<ActivePane, null>): void;
  hidePane(): void;
  openImportAgentModal(machineId?: string): void;
  closeImportAgentModal(): void;
  openCreateAgentModal(): void;
  openCreateAgentModalForMachine(machineId: string): void;
  openCreateAgentModalWith(fields: NewAgentSpec): void;
  openCreateAgentModalWithTemplate(template: AgentTemplate): void;
  closeCreateAgentModal(): void;
  openCreateChannelModal(): void;
  openCreateChannelModalWith(fields: NewChannelSpec, source?: ChannelCardSource): void;
  closeCreateChannelModal(): void;
  requestChannelCreatedReply(reply: ChannelCreatedReply): void;
  clearChannelCreatedReply(): void;
  openAddComputerNudge(): void;
  closeAddComputerNudge(): void;
  setMobileTab(tab: MobileTab): void;
  setSidebarTab(tab: SidebarTab): void;
  setLastSpacesPath(path: string): void;
  setLastDmsPath(path: string): void;
  setLastSpacesSidebarOpen(open: boolean): void;
  setLastDmsAtList(atList: boolean): void;
  requestAddMemberModal(): void;
  clearAddMemberModalRequest(): void;
  requestMobileProfileSection(section: string | null): void;
  requestMobileManageSpacesTarget(spaceId: string | null): void;
  openMobileAgentsOverlay(): void;
  closeMobileAgentsOverlay(): void;
  suspendMobileAgentsOverlay(): void;
  backFromMobileAgentsOverlay(): void;
  toggleWeaveNavigationCompact(): void;
  setTopicOverviewOpen(open: boolean): void;
  openInviteToSpace(spaceId: string, initialTab?: "humans" | "agents"): void;
  closeInviteToSpace(): void;
  openCreateInviteLink(spaceId: string): void;
  closeCreateInviteLink(): void;
  openJoinInviteModal(): void;
  closeJoinInviteModal(): void;
  showAcceptedOpenInvite(invite: {
    spaceId: string;
    channelId: string | null;
    spaceName: string;
    addedTopics?: string[];
    slug: string;
    serverUrl: string;
    sessionGeneration: number;
  }): void;
  closeAcceptedOpenInvite(): void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen:
    typeof window === "undefined" ||
    window.location.pathname === "/chat" ||
    window.location.pathname === "/chat/",
  channelPanelView: null,
  channelPanelSubjectId: null,
  channelPanelProfileContext: "default",
  activePane: null,
  showImportAgentModal: false,
  importAgentInitialMachineId: null,
  showCreateAgentModal: false,
  createAgentInitialMachineId: null,
  createAgentInitialFields: null,
  createAgentTemplate: null,
  showCreateChannelModal: false,
  createChannelInitialFields: null,
  createChannelSource: null,
  pendingChannelCreatedReply: null,
  showAddComputerNudge: false,
  mobileTab: "chat",
  sidebarTab: ((): SidebarTab => {
    try {
      const v = localStorage.getItem("puffo-sidebar-tab");
      return v === "members" ? "members" : "chat";
    } catch {
      return "chat";
    }
  })(),
  lastSpacesPath: "/chat",
  lastDmsPath: "/chat",
  lastSpacesSidebarOpen: true,
  lastDmsAtList: false,
  noComputerBannerDismissed: false,
  editingSpaceId: null,
  editingChannelId: null,
  addMemberModalPending: false,
  mobileProfileSectionRequest: null,
  mobileManageSpacesTargetId: null,
  mobileAgentsOverlayOpen: false,
  mobileAgentsOverlayReturnToSidebar: false,
  weaveNavigationCompact: (() => {
    try {
      return localStorage.getItem("weave-navigation-compact") === "true";
    } catch {
      return false;
    }
  })(),
  topicOverviewOpen: false,
  inviteToSpaceId: null,
  inviteToSpaceInitialTab: "humans",
  createInviteLinkSpaceId: null,
  showJoinInviteModal: false,
  acceptedOpenInvite: null,
  dismissNoComputerBanner: () => set({ noComputerBannerDismissed: true }),
  openEditSpaceModal: (spaceId) => set({ editingSpaceId: spaceId }),
  openEditChannelModal: (channelId) => set({ editingChannelId: channelId }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTopicOverviewOpen: (open) => set({ topicOverviewOpen: open }),
  openInviteToSpace: (spaceId, inviteToSpaceInitialTab = "humans") =>
    set({ inviteToSpaceId: spaceId, inviteToSpaceInitialTab }),
  closeInviteToSpace: () =>
    set({ inviteToSpaceId: null, inviteToSpaceInitialTab: "humans" }),
  openCreateInviteLink: (spaceId) => set({ createInviteLinkSpaceId: spaceId }),
  closeCreateInviteLink: () => set({ createInviteLinkSpaceId: null }),
  openJoinInviteModal: () => set({ showJoinInviteModal: true }),
  closeJoinInviteModal: () => set({ showJoinInviteModal: false }),
  showAcceptedOpenInvite: (acceptedOpenInvite) => set({ acceptedOpenInvite }),
  closeAcceptedOpenInvite: () => set({ acceptedOpenInvite: null }),
  toggleWeaveNavigationCompact: () => set((s) => {
    const weaveNavigationCompact = !s.weaveNavigationCompact;
    try {
      localStorage.setItem("weave-navigation-compact", String(weaveNavigationCompact));
    } catch {
    }
    return { weaveNavigationCompact };
  }),
  toggleMembers: () => set((s) => ({
    channelPanelView: s.channelPanelView === "members" ? null : "members",
    channelPanelSubjectId: null,
    channelPanelProfileContext: "default",
  })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setMembersOpen: (open) => set({ channelPanelView: open ? "members" : null, channelPanelSubjectId: null, channelPanelProfileContext: "default" }),
  setChannelSettingsPanelOpen: (open) => set({ channelPanelView: open ? "settings" : null, channelPanelSubjectId: null, channelPanelProfileContext: "default" }),
  setChannelPanelView: (view) => set({ channelPanelView: view, channelPanelSubjectId: null, channelPanelProfileContext: "default" }),
  openProfilePanel: (kind, subjectId, context = "default") => set({ channelPanelView: kind, channelPanelSubjectId: subjectId, channelPanelProfileContext: context }),
  showPane: (pane) => set({ activePane: pane }),
  hidePane: () => set({ activePane: null }),
  openImportAgentModal: (machineId) => set({ showImportAgentModal: true, importAgentInitialMachineId: machineId ?? null, showCreateAgentModal: false, createAgentInitialFields: null, createAgentInitialMachineId: null, createAgentTemplate: null }),
  closeImportAgentModal: () => set({ showImportAgentModal: false, importAgentInitialMachineId: null }),
  openCreateAgentModal: () => set({ showImportAgentModal: false, importAgentInitialMachineId: null, showCreateAgentModal: true, createAgentInitialFields: null, createAgentInitialMachineId: null, createAgentTemplate: null }),
  openCreateAgentModalForMachine: (machineId) => set({ showImportAgentModal: false, importAgentInitialMachineId: null, showCreateAgentModal: true, createAgentInitialFields: null, createAgentInitialMachineId: machineId, createAgentTemplate: null }),
  openCreateAgentModalWith: (fields) => set({ showImportAgentModal: false, importAgentInitialMachineId: null, showCreateAgentModal: true, createAgentInitialFields: fields, createAgentInitialMachineId: null, createAgentTemplate: null }),
  openCreateAgentModalWithTemplate: (template) => set({ showImportAgentModal: false, importAgentInitialMachineId: null, showCreateAgentModal: true, createAgentInitialFields: null, createAgentInitialMachineId: null, createAgentTemplate: template }),
  closeCreateAgentModal: () => set({ showCreateAgentModal: false, createAgentInitialFields: null, createAgentInitialMachineId: null, createAgentTemplate: null }),
  openCreateChannelModal: () =>
    set({
      showCreateChannelModal: true,
      createChannelInitialFields: null,
      createChannelSource: null,
    }),
  openCreateChannelModalWith: (fields, source) =>
    set({
      showCreateChannelModal: true,
      createChannelInitialFields: fields,
      createChannelSource: source ?? null,
    }),
  closeCreateChannelModal: () =>
    set({
      showCreateChannelModal: false,
      createChannelInitialFields: null,
      createChannelSource: null,
    }),
  requestChannelCreatedReply: (reply) => set({ pendingChannelCreatedReply: reply }),
  clearChannelCreatedReply: () => set({ pendingChannelCreatedReply: null }),
  openAddComputerNudge: () => set({ showAddComputerNudge: true }),
  closeAddComputerNudge: () => set({ showAddComputerNudge: false }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  setSidebarTab: (tab) => {
    try { localStorage.setItem("puffo-sidebar-tab", tab); } catch {}
    set({ sidebarTab: tab });
  },
  setLastSpacesPath: (path) => set({ lastSpacesPath: path }),
  setLastDmsPath: (path) => set({ lastDmsPath: path }),
  setLastSpacesSidebarOpen: (open) => set({ lastSpacesSidebarOpen: open }),
  setLastDmsAtList: (atList) => set({ lastDmsAtList: atList }),
  requestAddMemberModal: () => set({ addMemberModalPending: true }),
  clearAddMemberModalRequest: () => set({ addMemberModalPending: false }),
  requestMobileProfileSection: (section) => set({ mobileProfileSectionRequest: section }),
  requestMobileManageSpacesTarget: (spaceId) => set({ mobileManageSpacesTargetId: spaceId }),
  openMobileAgentsOverlay: () => set((s) => ({
    mobileAgentsOverlayOpen: true,
    mobileAgentsOverlayReturnToSidebar: s.mobileAgentsOverlayReturnToSidebar || s.sidebarOpen,
  })),
  closeMobileAgentsOverlay: () => set({
    mobileAgentsOverlayOpen: false,
    mobileAgentsOverlayReturnToSidebar: false,
  }),
  suspendMobileAgentsOverlay: () => set({ mobileAgentsOverlayOpen: false }),
  backFromMobileAgentsOverlay: () => set((s) => ({
    mobileAgentsOverlayOpen: false,
    mobileAgentsOverlayReturnToSidebar: false,
    sidebarOpen: s.mobileAgentsOverlayReturnToSidebar || s.sidebarOpen,
    mobileTab: s.mobileAgentsOverlayReturnToSidebar ? "chat" : s.mobileTab,
  })),
}));
