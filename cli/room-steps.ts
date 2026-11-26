import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CLI_STEP_WORDS,
  cliWords,
  factsAfterFirstSend,
  followStep,
  stepAfterFirstRead,
  stepAfterFirstSend,
  stepAfterJoin,
  stepAfterNew,
} from "../src/huddo/agent-guide";
import { listenOnYourPage } from "./agent-site";
import { ORIGIN, identityDir, removeFile, writeJson } from "./home";

export const CLI_WORDS = cliWords(listenOnYourPage(ORIGIN));

/** A state that no step uses for this long is dropped: as long as the hint state of the hosted MCP server. */
export const ROOM_STEPS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The steps that are due in a room that this identity created or joined with `new` or `join` in this HUDDO_HOME.
 * One file for each room: `identities/<slug>/steps/<room id>.json`. The commands write it, not the daemon, so it
 * is the same with `HUDDO_DAEMON=0`. The file has no message text. It has the recovery code of a new identity only
 * until the first send: the folder already has the keys of the identity, and the files have the same mode.
 */
export interface RoomSteps {
  /** The identity created the room. If not, it joined. */
  created: boolean;
  /** The next read gets the introduction step: the identity joined, and sent nothing. */
  introDue: boolean;
  /** The first send gets the step for the final reply. */
  followDue: boolean;
  /** That step gives the recovery code: the `new` or `join` also created the identity. */
  key: boolean;
  /** The recovery code that the `new` or `join` printed, for the sentence that the agent says. */
  code?: string;
  /** The invite link that `new` printed. */
  inviteUrl?: string;
  expiresAt: number;
}

/** What a result ends with: the facts that the step needs, each on a line, then the one step that is due. */
export interface StepHint {
  facts: string[];
  next: string;
}

export function stepText(hint: StepHint): string {
  return [...hint.facts, hint.next].join("\n");
}

const stepsDir = (slug: string) => join(identityDir(slug), "steps");
const stepsPath = (slug: string, spaceId: string) => join(stepsDir(slug), `${encodeURIComponent(spaceId)}.json`);

/** The state in `path`, or null when the file is missing, broken or expired. */
function readSteps(path: string, now: number): RoomSteps | null {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Record<keyof RoomSteps, unknown>> | null;
    if (!raw || typeof raw.expiresAt !== "number" || !(raw.expiresAt > now)) return null;
    return {
      created: raw.created === true,
      introDue: raw.introDue === true,
      followDue: raw.followDue === true,
      key: raw.key === true,
      ...(typeof raw.code === "string" ? { code: raw.code } : {}),
      ...(typeof raw.inviteUrl === "string" ? { inviteUrl: raw.inviteUrl } : {}),
      expiresAt: raw.expiresAt,
    };
  } catch {
    return null;
  }
}

/** A state that is not written only makes a step come again: the command does not fail. */
function writeSteps(slug: string, spaceId: string, steps: Omit<RoomSteps, "expiresAt">, now: number): void {
  try {
    writeJson(stepsPath(slug, spaceId), { ...steps, expiresAt: now + ROOM_STEPS_TTL_MS });
  } catch {}
}

function pruneSteps(slug: string, now: number): void {
  try {
    for (const name of readdirSync(stepsDir(slug))) {
      const path = join(stepsDir(slug), name);
      if (name.endsWith(".json") && !readSteps(path, now)) removeFile(path);
    }
  } catch {}
}

export interface RoomEntry {
  /** `new` created the room. If not, `join` entered it. */
  created: boolean;
  /** `join` found the identity in the room: it made its introduction before. */
  alreadyMember?: boolean;
  /** The recovery code that the command printed, when it created the identity. */
  recoveryCode?: string | null;
  inviteUrl?: string | null;
}

/**
 * After `new` or `join`: starts the steps of the room and gives the first one. The CLI has no session, so each `new`
 * and `join` starts them again. A `join` of a room that this identity created here keeps the steps of that room.
 */
export function enterRoom(slug: string, spaceId: string, entry: RoomEntry, now = Date.now()): StepHint {
  const before = readSteps(stepsPath(slug, spaceId), now);
  if (!before?.created || entry.created) {
    // A recovery code that is still due stays due when the identity enters the room again before its first send.
    const code = entry.recoveryCode || (before?.key && before.followDue ? before.code : undefined);
    writeSteps(
      slug,
      spaceId,
      {
        created: entry.created,
        introDue: !entry.created && !entry.alreadyMember,
        followDue: true,
        key: Boolean(entry.recoveryCode) || Boolean(before?.key && before.followDue),
        ...(code ? { code } : {}),
        ...(entry.inviteUrl ? { inviteUrl: entry.inviteUrl } : {}),
      },
      now,
    );
  }
  pruneSteps(slug, now);
  return { facts: [], next: entry.created ? stepAfterNew(CLI_STEP_WORDS) : stepAfterJoin(CLI_STEP_WORDS) };
}

/** After a read: the introduction step, one time, in a room that the identity joined and sent nothing in. */
export function roomRead(slug: string, spaceId: string, now = Date.now()): StepHint | null {
  const steps = readSteps(stepsPath(slug, spaceId), now);
  if (!steps?.introDue) return null;
  writeSteps(slug, spaceId, { ...steps, introDue: false }, now);
  return { facts: [], next: stepAfterFirstRead(CLI_STEP_WORDS) };
}

/** After a send: the step for the room home and the final reply, one time, in a room that the identity entered. */
export function roomSent(slug: string, spaceId: string, now = Date.now()): StepHint | null {
  const steps = readSteps(stepsPath(slug, spaceId), now);
  if (!steps?.followDue) return null;
  writeSteps(slug, spaceId, { created: steps.created, introDue: false, followDue: false, key: false }, now);
  const facts = { created: steps.created, key: steps.key, code: steps.code, inviteUrl: steps.inviteUrl };
  return {
    facts: factsAfterFirstSend(CLI_WORDS, facts, ORIGIN),
    next: stepAfterFirstSend(CLI_STEP_WORDS, facts, followStep(CLI_WORDS, ORIGIN)),
  };
}
