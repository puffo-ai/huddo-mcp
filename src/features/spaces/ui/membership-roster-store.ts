import { useSyncExternalStore } from "react";
import type { PuffoHttpClient } from "../../../http/client";
import { HttpError } from "../../../http/types";
import {
  bindMembershipRosterProjectionOwner,
  clearMembershipRosterProjection,
  membershipRosterOwnerScope,
  membershipRosterProjection,
  updateMembershipRosterProjection,
  type ChannelRosterMember,
  type ChannelRosterProjectionEntry,
  type MembershipRosterProjection,
  type RosterProjectionEntry,
  type SpaceRosterMember,
} from "../../../application/projections/membership-roster-projection";
import type { ProjectionOwner, ProjectionToken } from "../../../application/projections/owned-projection-store";
import { registerMembershipRosterInvalidator } from "../../../application/projections/membership-roster-invalidation";
import { fetchChannelMembers, fetchSpaceMembers } from "./member-controller";

export type { ChannelRosterMember, SpaceRosterMember } from "../../../application/projections/membership-roster-projection";
type RosterEntry<T> = RosterProjectionEntry<T>;
type ChannelRosterEntry = ChannelRosterProjectionEntry;

interface EnsureOptions {
  revalidate?: boolean;
}

interface PreloadOptions {
  activeChannelId?: string;
}

export interface MembershipRosterState extends MembershipRosterProjection {
  scopeKey: string | null;
  channelRosters: Record<string, ChannelRosterEntry>;
  spaceRosters: Record<string, RosterEntry<SpaceRosterMember>>;
  ensureChannel(
    http: PuffoHttpClient,
    owner: ProjectionOwner,
    spaceId: string,
    channelId: string,
    version: number,
    options?: EnsureOptions,
  ): Promise<ChannelRosterMember[]>;
  ensureSpace(
    http: PuffoHttpClient,
    owner: ProjectionOwner,
    spaceId: string,
    version: number,
    options?: EnsureOptions,
  ): Promise<SpaceRosterMember[]>;
  preloadChannels(
    http: PuffoHttpClient,
    owner: ProjectionOwner,
    spaceId: string,
    channelIds: string[],
    version: number,
    options?: PreloadOptions,
  ): Promise<void>;
  cancelPreloadScheduling(): void;
  reset(scopeKey?: string | null): void;
  removeChannel(channelId: string): void;
  removeSpace(spaceId: string): void;
}

type MembershipRosterActions = Omit<
  MembershipRosterState,
  keyof MembershipRosterProjection
>;

const PRELOAD_CONCURRENCY = 4;
const MAX_CHANNEL_ROSTERS = 128;
const MAX_SPACE_ROSTERS = 64;

export function membershipRosterScope(serverUrl: string, slug: string): string {
  return `${serverUrl.replace(/\/$/, "")}|${slug}`;
}

function fingerprint(
  rows: Array<{ slug: string; role?: string; identity_type?: string }>,
): string {
  return rows
    .map((row) => `${row.slug}:${row.role ?? ""}:${row.identity_type ?? ""}`)
    .sort()
    .join("|");
}

function pruneLeastRecentlyUsed<T>(
  entries: Record<string, T>,
  accessOrder: Map<string, number>,
  limit: number,
): Record<string, T> {
  const excess = Object.keys(entries).length - limit;
  if (excess <= 0) return entries;
  const evicted = Object.keys(entries)
    .sort((left, right) =>
      (accessOrder.get(left) ?? 0) - (accessOrder.get(right) ?? 0),
    )
    .slice(0, excess);
  const retained = { ...entries };
  for (const key of evicted) {
    delete retained[key];
    accessOrder.delete(key);
  }
  return retained;
}

let projectionToken: ProjectionToken | null = null;
let clearRosterRuntime = (): void => {};

export function bindMembershipRosterOwner(owner: ProjectionOwner | null): ProjectionToken | null {
  clearRosterRuntime();
  if (owner) projectionToken = bindMembershipRosterProjectionOwner(owner);
  else {
    projectionToken = null;
    clearMembershipRosterProjection();
  }
  return projectionToken;
}

const runtime: MembershipRosterActions = (() => {
    let lifecycleGeneration = 0;
    let preloadGeneration = 0;
    const channelInFlight = new Map<string, Promise<ChannelRosterMember[]>>();
    const spaceInFlight = new Map<string, Promise<SpaceRosterMember[]>>();
    const channelInvalidations = new Map<string, number>();
    const spaceInvalidations = new Map<string, number>();
    const channelRequestCounts = new Map<string, number>();
    const spaceRequestCounts = new Map<string, number>();
    const channelRequestOrdinals = new Map<string, number>();
    const spaceRequestOrdinals = new Map<string, number>();
    const channelAccessOrder = new Map<string, number>();
    const spaceAccessOrder = new Map<string, number>();
    let accessSequence = 0;

    const beginRequest = (counts: Map<string, number>, key: string) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    const finishRequest = (
      counts: Map<string, number>,
      invalidations: Map<string, number>,
      key: string,
    ) => {
      const remaining = (counts.get(key) ?? 1) - 1;
      if (remaining > 0) {
        counts.set(key, remaining);
        return;
      }
      counts.delete(key);
      invalidations.delete(key);
    };
    const writeChannelRoster = (
      channelId: string,
      entry: ChannelRosterEntry,
    ) => {
      channelAccessOrder.set(channelId, ++accessSequence);
      if (!projectionToken) return;
      updateMembershipRosterProjection(projectionToken, (state) => ({
        ...state,
        channelRosters: pruneLeastRecentlyUsed(
          { ...state.channelRosters, [channelId]: entry },
          channelAccessOrder,
          MAX_CHANNEL_ROSTERS,
        ),
      }));
    };
    const writeSpaceRoster = (
      spaceId: string,
      entry: RosterEntry<SpaceRosterMember>,
    ) => {
      spaceAccessOrder.set(spaceId, ++accessSequence);
      if (!projectionToken) return;
      updateMembershipRosterProjection(projectionToken, (state) => ({
        ...state,
        spaceRosters: pruneLeastRecentlyUsed(
          { ...state.spaceRosters, [spaceId]: entry },
          spaceAccessOrder,
          MAX_SPACE_ROSTERS,
        ),
      }));
    };

    const clearTransientState = () => {
      preloadGeneration += 1;
      channelInFlight.clear();
      spaceInFlight.clear();
      channelInvalidations.clear();
      spaceInvalidations.clear();
      channelRequestCounts.clear();
      spaceRequestCounts.clear();
      channelRequestOrdinals.clear();
      spaceRequestOrdinals.clear();
      channelAccessOrder.clear();
      spaceAccessOrder.clear();
    };
    clearRosterRuntime = () => {
      lifecycleGeneration += 1;
      clearTransientState();
    };

    const current = () => membershipRosterProjection.getSnapshot().value;
    const acceptsStart = (owner: ProjectionOwner) =>
      projectionToken !== null
      && membershipRosterProjection.accepts(projectionToken)
      && projectionToken.owner.serverUrl === owner.serverUrl
      && projectionToken.owner.slug === owner.slug
      && projectionToken.owner.generation === owner.generation;

    return {
      async ensureChannel(http, owner, spaceId, channelId, version, options) {
        if (!acceptsStart(owner)) return [];
        const requestToken = projectionToken;
        const scopeKey = membershipRosterOwnerScope(owner);
        const currentEntry = current().channelRosters[channelId];
        if (currentEntry?.spaceId === spaceId) {
          channelAccessOrder.set(channelId, ++accessSequence);
        }
        if (
          currentEntry &&
          currentEntry.spaceId === spaceId &&
          currentEntry.version >= version &&
          !options?.revalidate
        ) {
          return currentEntry.members;
        }

        const generation = lifecycleGeneration;
        const channelEpochKey = `${generation}:${scopeKey}:${channelId}`;
        const spaceEpochKey = `${generation}:${scopeKey}:${spaceId}`;
        const channelEpoch = channelInvalidations.get(channelEpochKey) ?? 0;
        const spaceEpoch = spaceInvalidations.get(spaceEpochKey) ?? 0;
        const key = `${generation}:${channelEpoch}:${spaceEpoch}:${scopeKey}:${spaceId}:${channelId}:${version}:${options?.revalidate ? 1 : 0}`;
        const pending = channelInFlight.get(key);
        if (pending) return pending;

        const requestOrdinal = (channelRequestOrdinals.get(channelEpochKey) ?? 0) + 1;
        channelRequestOrdinals.set(channelEpochKey, requestOrdinal);
        beginRequest(channelRequestCounts, channelEpochKey);
        beginRequest(spaceRequestCounts, spaceEpochKey);
        const request = fetchChannelMembers(http, spaceId, channelId)
          .then((members) => {
            if (
              lifecycleGeneration !== generation ||
              projectionToken !== requestToken || current().scopeKey !== scopeKey ||
              channelRequestOrdinals.get(channelEpochKey) !== requestOrdinal ||
              (channelInvalidations.get(channelEpochKey) ?? 0) !== channelEpoch ||
              (spaceInvalidations.get(spaceEpochKey) ?? 0) !== spaceEpoch
            ) {
              return [];
            }
            const previous = current().channelRosters[channelId];
            if (
              previous &&
              previous.spaceId === spaceId &&
              previous.version > version
            ) {
              return previous.members;
            }
            if (
              previous &&
              previous.spaceId === spaceId &&
              previous.version === version &&
              fingerprint(previous.members) === fingerprint(members)
            ) {
              return previous.members;
            }
            writeChannelRoster(channelId, { members, version, spaceId });
            return members;
          })
          .catch((error: unknown) => {
            if (!(error instanceof HttpError) || error.status !== 403) throw error;
            if (
              lifecycleGeneration !== generation ||
              projectionToken !== requestToken || current().scopeKey !== scopeKey ||
              channelRequestOrdinals.get(channelEpochKey) !== requestOrdinal ||
              (channelInvalidations.get(channelEpochKey) ?? 0) !== channelEpoch ||
              (spaceInvalidations.get(spaceEpochKey) ?? 0) !== spaceEpoch
            ) {
              return [];
            }
            const previous = current().channelRosters[channelId];
            if (
              previous &&
              previous.spaceId === spaceId &&
              previous.version > version
            ) {
              return previous.members;
            }
            writeChannelRoster(channelId, { members: [], version, spaceId });
            return [];
          })
          .finally(() => {
            channelInFlight.delete(key);
            finishRequest(
              channelRequestCounts,
              channelInvalidations,
              channelEpochKey,
            );
            finishRequest(spaceRequestCounts, spaceInvalidations, spaceEpochKey);
          });
        channelInFlight.set(key, request);
        return request;
      },
      async ensureSpace(http, owner, spaceId, version, options) {
        if (!acceptsStart(owner)) return [];
        const requestToken = projectionToken;
        const scopeKey = membershipRosterOwnerScope(owner);
        const currentEntry = current().spaceRosters[spaceId];
        if (currentEntry) spaceAccessOrder.set(spaceId, ++accessSequence);
        if (currentEntry && currentEntry.version >= version && !options?.revalidate) {
          return currentEntry.members;
        }

        const generation = lifecycleGeneration;
        const spaceEpochKey = `${generation}:${scopeKey}:${spaceId}`;
        const spaceEpoch = spaceInvalidations.get(spaceEpochKey) ?? 0;
        const key = `${generation}:${spaceEpoch}:${scopeKey}:${spaceId}:${version}:${options?.revalidate ? 1 : 0}`;
        const pending = spaceInFlight.get(key);
        if (pending) return pending;

        const requestOrdinal = (spaceRequestOrdinals.get(spaceEpochKey) ?? 0) + 1;
        spaceRequestOrdinals.set(spaceEpochKey, requestOrdinal);
        beginRequest(spaceRequestCounts, spaceEpochKey);
        const request = fetchSpaceMembers(http, spaceId)
          .then((members) => {
            if (
              lifecycleGeneration !== generation ||
              projectionToken !== requestToken || current().scopeKey !== scopeKey ||
              spaceRequestOrdinals.get(spaceEpochKey) !== requestOrdinal ||
              (spaceInvalidations.get(spaceEpochKey) ?? 0) !== spaceEpoch
            ) {
              return [];
            }
            const previous = current().spaceRosters[spaceId];
            if (previous && previous.version > version) return previous.members;
            if (
              previous &&
              previous.version === version &&
              fingerprint(previous.members) === fingerprint(members)
            ) {
              return previous.members;
            }
            writeSpaceRoster(spaceId, { members, version });
            return members;
          })
          .catch((error: unknown) => {
            if (!(error instanceof HttpError) || error.status !== 403) throw error;
            if (
              lifecycleGeneration !== generation ||
              projectionToken !== requestToken || current().scopeKey !== scopeKey ||
              spaceRequestOrdinals.get(spaceEpochKey) !== requestOrdinal ||
              (spaceInvalidations.get(spaceEpochKey) ?? 0) !== spaceEpoch
            ) return [];
            const previous = current().spaceRosters[spaceId];
            if (previous && previous.version > version) return previous.members;
            writeSpaceRoster(spaceId, { members: [], version });
            return [];
          })
          .finally(() => {
            spaceInFlight.delete(key);
            finishRequest(spaceRequestCounts, spaceInvalidations, spaceEpochKey);
          });
        spaceInFlight.set(key, request);
        return request;
      },
      async preloadChannels(
        http,
        owner,
        spaceId,
        channelIds,
        version,
        options,
      ) {
        if (!acceptsStart(owner)) return;
        const requestToken = projectionToken;
        const scopeKey = membershipRosterOwnerScope(owner);
        const generation = ++preloadGeneration;
        const uniqueChannelIds = [...new Set(channelIds)];
        const activeChannelId = options?.activeChannelId &&
          uniqueChannelIds.includes(options.activeChannelId)
          ? options.activeChannelId
          : null;
        const siblingLimit = MAX_CHANNEL_ROSTERS - (activeChannelId ? 1 : 0);
        const preloadIds = uniqueChannelIds
          .filter((channelId) => channelId !== activeChannelId)
          .slice(0, siblingLimit);
        for (const channelId of [activeChannelId, ...preloadIds]) {
          if (!channelId) continue;
          const cached = current().channelRosters[channelId];
          if (cached?.spaceId === spaceId) {
            channelAccessOrder.set(channelId, ++accessSequence);
          }
        }
        const missing = preloadIds.filter((channelId) => {
          const cached = current().channelRosters[channelId];
          return !cached || cached.spaceId !== spaceId;
        });
        for (let index = 0; index < missing.length; index += PRELOAD_CONCURRENCY) {
          if (
            generation !== preloadGeneration ||
            projectionToken !== requestToken ||
            current().scopeKey !== scopeKey
          ) return;
          await Promise.allSettled(
            missing.slice(index, index + PRELOAD_CONCURRENCY).map((channelId) =>
              runtime.ensureChannel(http, owner, spaceId, channelId, version),
            ),
          );
        }
      },
      cancelPreloadScheduling() {
        preloadGeneration += 1;
      },
      reset() {
        lifecycleGeneration += 1;
        clearTransientState();
        projectionToken = null;
        clearMembershipRosterProjection();
      },
      removeChannel(channelId) {
        const scopeKey = current().scopeKey;
        if (scopeKey) {
          const key = `${lifecycleGeneration}:${scopeKey}:${channelId}`;
          if ((channelRequestCounts.get(key) ?? 0) > 0) {
            channelInvalidations.set(key, (channelInvalidations.get(key) ?? 0) + 1);
          }
        }
        channelAccessOrder.delete(channelId);
        if (!projectionToken) return;
        updateMembershipRosterProjection(projectionToken, (state) => {
          const { [channelId]: _removed, ...channelRosters } = state.channelRosters;
          void _removed;
          return { ...state, channelRosters };
        });
      },
      removeSpace(spaceId) {
        const scopeKey = current().scopeKey;
        if (scopeKey) {
          const key = `${lifecycleGeneration}:${scopeKey}:${spaceId}`;
          if ((spaceRequestCounts.get(key) ?? 0) > 0) {
            spaceInvalidations.set(key, (spaceInvalidations.get(key) ?? 0) + 1);
          }
        }
        spaceAccessOrder.delete(spaceId);
        if (!projectionToken) return;
        updateMembershipRosterProjection(projectionToken, (state) => {
          const { [spaceId]: _removed, ...spaceRosters } = state.spaceRosters;
          void _removed;
          const channelRosters = Object.fromEntries(
            Object.entries(state.channelRosters).filter(
              ([, roster]) => roster.spaceId !== spaceId,
            ),
          );
          for (const [channelId, roster] of Object.entries(state.channelRosters)) {
            if (roster.spaceId === spaceId) channelAccessOrder.delete(channelId);
          }
          return { ...state, channelRosters, spaceRosters };
        });
      },
    };
})();

registerMembershipRosterInvalidator({
  removeChannel: (channelId) => runtime.removeChannel(channelId),
  removeSpace: (spaceId) => runtime.removeSpace(spaceId),
});

let testGeneration = 0;
let commandOverrides: Partial<MembershipRosterState> = {};
let cachedProjection = membershipRosterProjection.getSnapshot();
let cachedState: MembershipRosterState = { ...cachedProjection.value, ...runtime };

function rosterSnapshot(): MembershipRosterState {
  const projection = membershipRosterProjection.getSnapshot();
  if (projection !== cachedProjection) {
    cachedProjection = projection;
    cachedState = { ...projection.value, ...runtime, ...commandOverrides };
  }
  return cachedState;
}

type MembershipRosterHook = {
  <T>(selector: (state: MembershipRosterState) => T): T;
  getState(): MembershipRosterState;
  subscribe(listener: () => void): () => void;
  setState(patch: Partial<MembershipRosterState> | ((state: MembershipRosterState) => Partial<MembershipRosterState>)): void;
};

export const useMembershipRosterStore: MembershipRosterHook = Object.assign(
  function useMembershipRosterSelector<T>(selector: (state: MembershipRosterState) => T): T {
    return selector(useSyncExternalStore(
      membershipRosterProjection.subscribe,
      rosterSnapshot,
      rosterSnapshot,
    ));
  },
  {
    getState: rosterSnapshot,
    subscribe: membershipRosterProjection.subscribe,
    setState: (patch: Partial<MembershipRosterState> | ((state: MembershipRosterState) => Partial<MembershipRosterState>)) => {
      const resolved = typeof patch === "function" ? patch(rosterSnapshot()) : patch;
      const domainKeys = ["scopeKey", "channelRosters", "spaceRosters"] as const;
      if (projectionToken && domainKeys.some((key) => key in resolved)) {
        updateMembershipRosterProjection(projectionToken, (state) => {
          const next = { ...state };
          for (const key of domainKeys) if (key in resolved) Object.assign(next, { [key]: resolved[key] });
          return next;
        });
      }
      for (const key of ["ensureChannel", "ensureSpace", "preloadChannels", "cancelPreloadScheduling", "reset", "removeChannel", "removeSpace"] as const) {
        if (key in resolved) Object.assign(commandOverrides, { [key]: resolved[key] });
      }
      cachedProjection = membershipRosterProjection.getSnapshot();
      cachedState = { ...cachedProjection.value, ...runtime, ...commandOverrides };
    },
  },
);

export function resetMembershipRosterForTests(owner: ProjectionOwner = {
  serverUrl: "https://roster.test",
  slug: "test-owner",
  generation: ++testGeneration,
}): void {
  commandOverrides = {};
  runtime.reset();
  bindMembershipRosterOwner(owner);
}
