import { useSyncExternalStore } from "react";
import { create } from "zustand";
import {
  bindSpaceDomainProjectionOwner, clearSpaceDomainProjection,
  spaceDomainProjection, updateSpaceDomainProjection,
  type SpaceDomainProjection,
} from "../../../application/projections/space-domain-projection";
import type { ProjectionOwner, ProjectionToken } from "../../../application/projections/owned-projection-store";
import { invalidateChannelRoster, invalidateSpaceRoster } from "../../../application/projections/membership-roster-invalidation";
import * as pushNameCache from "../../notifications";
import { useLastActiveSpaceStore } from "./last-active-space-store";
import { getSpaceRole, sortSpacesByName, type Channel, type Space, type SpaceRole } from "../domain";

export { getSpaceRole, sortSpacesByName } from "../domain";
export type { Channel, Space, SpaceRole } from "../domain";

interface SpaceNavigationState {
  activeSpaceId: string | null;
  activeChannelId: string | null;
  channelViewId: string | null;
  activeDmPeer: string | null;
  loading: boolean;
  viewingAllDms: boolean;
}

interface ChannelActions {
  setSpaces(spaces: Space[]): void;
  addSpace(space: Space): void;
  setChannels(channels: Channel[]): void;
  setChannelsHydrated(hydrated: boolean): void;
  addChannel(channel: Channel): void;
  setActiveSpace(spaceId: string | null): void;
  setActiveSpaceQuiet(spaceId: string | null): void;
  setActiveChannel(channelId: string | null): void;
  setChannelViewId(id: string | null): void;
  setViewingAllDms(viewing: boolean): void;
  ensureDmPeer(peer: string): void;
  addDmPeer(peer: string): void;
  promoteDmPeers(peers: readonly string[]): void;
  setDmPeers(peers: string[]): void;
  removeDmPeer(peer: string): void;
  setActiveDmPeer(peer: string | null): void;
  setLoading(loading: boolean): void;
  patchSpace(spaceId: string, patch: Partial<Pick<Space, "name" | "description" | "avatarUrl" | "archivedAt">>): void;
  patchChannel(channelId: string, patch: Partial<Pick<Channel, "name" | "description" | "isEncrypted">>): void;
  bumpMembersVersion(): void;
  removeChannel(channelId: string): void;
  removeSpace(spaceId: string): void;
}

export type ChannelState = SpaceNavigationState & SpaceDomainProjection & ChannelActions;

let navigationOwnerSlug: string | null = null;
let domainProjectionToken: ProjectionToken | null = null;

export interface SpaceDomainWriter {
  setSpaces(spaces: Space[]): boolean;
  setChannels(channels: Channel[]): boolean;
  setChannelsHydrated(hydrated: boolean): boolean;
  addSpace(space: Space): boolean;
  addChannel(channel: Channel): boolean;
  setDmPeers(peers: string[]): boolean;
  ensureDmPeer(peer: string): boolean;
  addDmPeer(peer: string): boolean;
  promoteDmPeers(peers: readonly string[]): boolean;
  removeDmPeer(peer: string): boolean;
  patchSpace(spaceId: string, patch: Partial<Pick<Space, "name" | "description" | "avatarUrl" | "archivedAt">>): boolean;
  patchChannel(channelId: string, patch: Partial<Pick<Channel, "name" | "description" | "isEncrypted">>): boolean;
  bumpMembersVersion(): boolean;
  removeChannel(channelId: string): boolean;
  removeSpace(spaceId: string): boolean;
}

export function captureSpaceDomainWriter(owner: ProjectionOwner): SpaceDomainWriter | null {
  const token = domainProjectionToken;
  if (
    !token || !spaceDomainProjection.accepts(token)
    || token.owner.serverUrl !== owner.serverUrl
    || token.owner.slug !== owner.slug
    || token.owner.generation !== owner.generation
  ) return null;
  const update = (project: (current: SpaceDomainProjection) => SpaceDomainProjection) =>
    updateSpaceDomainProjection(token, project);
  const updateWithNames = (
    entries: { id: string; name: string }[],
    project: (current: SpaceDomainProjection) => SpaceDomainProjection,
  ) => {
    const accepted = update(project);
    if (!accepted || !spaceDomainProjection.accepts(token)) return false;
    mirrorNamesToCache(entries);
    return true;
  };
  return {
    setSpaces: (spaces) => updateWithNames(
      spaces.map((space) => ({ id: space.id, name: space.name })),
      (current) => ({ ...current, spaces: sortSpacesByName(spaces), spacesLoaded: true }),
    ),
    setChannels: (channels) => updateWithNames(
      channels.map((channel) => ({ id: channel.id, name: channel.name })),
      (current) => ({ ...current, channels, channelsHydrated: true }),
    ),
    setChannelsHydrated: (channelsHydrated) => update((current) => ({ ...current, channelsHydrated })),
    addSpace: (space) => updateWithNames([{ id: space.id, name: space.name }], (current) => ({
      ...current,
      spaces: current.spaces.some((candidate) => candidate.id === space.id)
        ? current.spaces : sortSpacesByName([...current.spaces, space]),
    })),
    addChannel: (channel) => updateWithNames([{ id: channel.id, name: channel.name }], (current) => ({
      ...current,
      channels: current.channels.some((candidate) => candidate.id === channel.id)
        ? current.channels : [...current.channels, channel],
    })),
    setDmPeers: (dmPeers) => update((current) => ({ ...current, dmPeers })),
    ensureDmPeer: (peer) => update((current) => current.dmPeers.includes(peer)
      ? current : { ...current, dmPeers: [peer, ...current.dmPeers] }),
    addDmPeer: (peer) => update((current) => ({
      ...current, dmPeers: [peer, ...current.dmPeers.filter((candidate) => candidate !== peer)],
    })),
    promoteDmPeers: (peers) => {
      if (peers.length === 0) return true;
      return update((current) => {
        const latestFirst = [...peers].reverse();
        const promoted = new Set(latestFirst);
        return { ...current, dmPeers: [...latestFirst, ...current.dmPeers.filter((peer) => !promoted.has(peer))] };
      });
    },
    removeDmPeer: (peer) => update((current) => ({
      ...current, dmPeers: current.dmPeers.filter((candidate) => candidate !== peer),
    })),
    patchSpace: (spaceId, patch) => updateWithNames(
      typeof patch.name === "string" ? [{ id: spaceId, name: patch.name }] : [],
      (current) => ({
        ...current,
        spaces: sortSpacesByName(current.spaces.map((space) =>
          space.id === spaceId ? { ...space, ...patch } : space)),
      }),
    ),
    patchChannel: (channelId, patch) => updateWithNames(
      typeof patch.name === "string" ? [{ id: channelId, name: patch.name }] : [],
      (current) => ({
        ...current,
        channels: current.channels.map((channel) =>
          channel.id === channelId ? { ...channel, ...patch } : channel),
      }),
    ),
    bumpMembersVersion: () => update((current) => ({
      ...current, membersVersion: current.membersVersion + 1,
    })),
    removeChannel: (channelId) => {
      const accepted = update((current) => ({
        ...current, channels: current.channels.filter((channel) => channel.id !== channelId),
      }));
      if (!accepted || !spaceDomainProjection.accepts(token)) return false;
      invalidateChannelRoster(channelId);
      useSpaceNavigationStore.setState((state) => ({
        activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId,
      }));
      return true;
    },
    removeSpace: (spaceId) => {
      const accepted = update((current) => ({
        ...current,
        spaces: current.spaces.filter((space) => space.id !== spaceId),
        channels: current.channels.filter((channel) => channel.spaceId !== spaceId),
      }));
      if (!accepted || !spaceDomainProjection.accepts(token)) return false;
      invalidateSpaceRoster(spaceId);
      useSpaceNavigationStore.setState((state) => {
        const wasActive = state.activeSpaceId === spaceId;
        return {
          activeSpaceId: wasActive ? null : state.activeSpaceId,
          activeChannelId: wasActive ? null : state.activeChannelId,
        };
      });
      return true;
    },
  };
}

const useSpaceNavigationStore = create<SpaceNavigationState>(() => ({
  activeSpaceId: null, activeChannelId: null, channelViewId: null,
  activeDmPeer: null, loading: false, viewingAllDms: false,
}));

function projectDomain(project: (current: SpaceDomainProjection) => SpaceDomainProjection): boolean {
  return domainProjectionToken !== null
    && updateSpaceDomainProjection(domainProjectionToken, project);
}

function mirrorNamesToCache(entries: { id: string; name: string }[]): void {
  if (entries.length > 0) void pushNameCache.setNames(entries);
}

const actions: ChannelActions = {
  setSpaces: (spaces) => {
    const accepted = projectDomain((current) => ({ ...current, spaces: sortSpacesByName(spaces), spacesLoaded: true }));
    if (accepted) mirrorNamesToCache(spaces.map((space) => ({ id: space.id, name: space.name })));
  },
  addSpace: (space) => {
    const accepted = projectDomain((current) => ({
      ...current,
      spaces: current.spaces.some((candidate) => candidate.id === space.id)
        ? current.spaces : sortSpacesByName([...current.spaces, space]),
    }));
    if (accepted) mirrorNamesToCache([{ id: space.id, name: space.name }]);
  },
  setChannels: (channels) => {
    const accepted = projectDomain((current) => ({ ...current, channels, channelsHydrated: true }));
    if (accepted) mirrorNamesToCache(channels.map((channel) => ({ id: channel.id, name: channel.name })));
  },
  setChannelsHydrated: (channelsHydrated) => {
    projectDomain((current) => ({ ...current, channelsHydrated }));
  },
  addChannel: (channel) => {
    const accepted = projectDomain((current) => ({
      ...current,
      channels: current.channels.some((candidate) => candidate.id === channel.id)
        ? current.channels : [...current.channels, channel],
    }));
    if (accepted) mirrorNamesToCache([{ id: channel.id, name: channel.name }]);
  },
  setActiveSpace: (spaceId) => {
    useSpaceNavigationStore.setState({ activeSpaceId: spaceId, viewingAllDms: false });
    const isMember = spaceDomainProjection.getSnapshot().value.spaces.some((space) => space.id === spaceId);
    if (navigationOwnerSlug && isMember) useLastActiveSpaceStore.getState().record(navigationOwnerSlug, spaceId);
  },
  setActiveSpaceQuiet: (activeSpaceId) => {
    useSpaceNavigationStore.setState({ activeSpaceId, viewingAllDms: false });
  },
  setActiveChannel: (activeChannelId) => useSpaceNavigationStore.setState({ activeChannelId }),
  setChannelViewId: (channelViewId) => useSpaceNavigationStore.setState({ channelViewId }),
  setViewingAllDms: (viewingAllDms) => useSpaceNavigationStore.setState((state) => ({
    viewingAllDms, activeChannelId: viewingAllDms ? null : state.activeChannelId,
  })),
  ensureDmPeer: (peer) => {
    projectDomain((current) => current.dmPeers.includes(peer)
      ? current : { ...current, dmPeers: [peer, ...current.dmPeers] });
  },
  addDmPeer: (peer) => {
    projectDomain((current) => ({
      ...current, dmPeers: [peer, ...current.dmPeers.filter((candidate) => candidate !== peer)],
    }));
  },
  promoteDmPeers: (peers) => {
    if (peers.length === 0) return;
    projectDomain((current) => {
      const latestFirst = [...peers].reverse();
      const promoted = new Set(latestFirst);
      return { ...current, dmPeers: [...latestFirst, ...current.dmPeers.filter((peer) => !promoted.has(peer))] };
    });
  },
  setDmPeers: (dmPeers) => { projectDomain((current) => ({ ...current, dmPeers })); },
  removeDmPeer: (peer) => {
    projectDomain((current) => ({
      ...current, dmPeers: current.dmPeers.filter((candidate) => candidate !== peer),
    }));
  },
  setActiveDmPeer: (activeDmPeer) => useSpaceNavigationStore.setState({ activeDmPeer }),
  setLoading: (loading) => useSpaceNavigationStore.setState({ loading }),
  patchSpace: (spaceId, patch) => {
    const accepted = projectDomain((current) => ({
      ...current,
      spaces: sortSpacesByName(current.spaces.map((space) =>
        space.id === spaceId ? { ...space, ...patch } : space)),
    }));
    if (accepted && typeof patch.name === "string") mirrorNamesToCache([{ id: spaceId, name: patch.name }]);
  },
  patchChannel: (channelId, patch) => {
    const accepted = projectDomain((current) => ({
      ...current,
      channels: current.channels.map((channel) =>
        channel.id === channelId ? { ...channel, ...patch } : channel),
    }));
    if (accepted && typeof patch.name === "string") mirrorNamesToCache([{ id: channelId, name: patch.name }]);
  },
  bumpMembersVersion: () => {
    projectDomain((current) => ({ ...current, membersVersion: current.membersVersion + 1 }));
  },
  removeChannel: (channelId) => {
    const accepted = projectDomain((current) => ({
      ...current, channels: current.channels.filter((channel) => channel.id !== channelId),
    }));
    if (!accepted) return;
    invalidateChannelRoster(channelId);
    useSpaceNavigationStore.setState((state) => ({
      activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId,
    }));
  },
  removeSpace: (spaceId) => {
    const accepted = projectDomain((current) => ({
      ...current,
      spaces: current.spaces.filter((space) => space.id !== spaceId),
      channels: current.channels.filter((channel) => channel.spaceId !== spaceId),
    }));
    if (!accepted) return;
    invalidateSpaceRoster(spaceId);
    useSpaceNavigationStore.setState((state) => {
      const wasActive = state.activeSpaceId === spaceId;
      return {
        activeSpaceId: wasActive ? null : state.activeSpaceId,
        activeChannelId: wasActive ? null : state.activeChannelId,
      };
    });
  },
};

let cachedNavigation = useSpaceNavigationStore.getState();
let cachedDomain = spaceDomainProjection.getSnapshot();
let cachedCombined: ChannelState = { ...cachedDomain.value, ...cachedNavigation, ...actions };

function combinedSnapshot(): ChannelState {
  const navigation = useSpaceNavigationStore.getState();
  const domain = spaceDomainProjection.getSnapshot();
  if (navigation !== cachedNavigation || domain !== cachedDomain) {
    cachedNavigation = navigation;
    cachedDomain = domain;
    cachedCombined = { ...domain.value, ...navigation, ...actions };
  }
  return cachedCombined;
}

function subscribeCombined(listener: () => void): () => void {
  const unsubscribeNavigation = useSpaceNavigationStore.subscribe(listener);
  const unsubscribeDomain = spaceDomainProjection.subscribe(listener);
  return () => { unsubscribeNavigation(); unsubscribeDomain(); };
}

type ChannelStoreHook = {
  <T>(selector: (state: ChannelState) => T): T;
  getState(): ChannelState;
  subscribe(listener: () => void): () => void;
  setState(patch: Partial<ChannelState> | ((state: ChannelState) => Partial<ChannelState>)): void;
};

export const useChannelStore: ChannelStoreHook = Object.assign(
  function useChannelStoreSelector<T>(selector: (state: ChannelState) => T): T {
    const snapshot = useSyncExternalStore(
      subscribeCombined,
      combinedSnapshot,
      combinedSnapshot,
    );
    return selector(snapshot);
  },
  {
    getState: combinedSnapshot,
    subscribe: subscribeCombined,
    setState: (patch: Partial<ChannelState> | ((state: ChannelState) => Partial<ChannelState>)) => {
      const resolved = typeof patch === "function" ? patch(combinedSnapshot()) : patch;
      const navigationPatch: Partial<SpaceNavigationState> = {};
      for (const key of ["activeSpaceId", "activeChannelId", "channelViewId", "activeDmPeer", "loading", "viewingAllDms"] as const) {
        if (key in resolved) navigationPatch[key] = resolved[key] as never;
      }
      if (Object.keys(navigationPatch).length > 0) useSpaceNavigationStore.setState(navigationPatch);

      const domainKeys = ["spaces", "spacesLoaded", "channels", "channelsHydrated", "dmPeers", "membersVersion"] as const;
      if (domainKeys.some((key) => key in resolved)) {
        projectDomain((current) => {
          const next = { ...current };
          for (const key of domainKeys) {
            if (key in resolved) Object.assign(next, { [key]: resolved[key] });
          }
          return next;
        });
      }
    },
  },
);

export function bindSpaceNavigationOwner(owner: ProjectionOwner | null): void {
  navigationOwnerSlug = owner?.slug ?? null;
  if (owner) {
    domainProjectionToken = bindSpaceDomainProjectionOwner(owner);
  } else {
    domainProjectionToken = null;
    clearSpaceDomainProjection();
  }
}

export function resetSpaceNavigationState(): void {
  useSpaceNavigationStore.setState({
    activeSpaceId: null, activeChannelId: null, channelViewId: null,
    activeDmPeer: null, loading: false, viewingAllDms: false,
  });
}

export function getSpaceNavigationSnapshotForTests(): SpaceNavigationState {
  return useSpaceNavigationStore.getState();
}

export function resetSpaceStoreForTests(
  owner: ProjectionOwner = {
    serverUrl: "https://space-projection.test",
    slug: "test-owner",
    generation: 0,
  },
): void {
  domainProjectionToken = null;
  clearSpaceDomainProjection();
  resetSpaceNavigationState();
  bindSpaceNavigationOwner(owner);
}
