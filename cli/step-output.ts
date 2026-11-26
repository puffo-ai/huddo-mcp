import * as ops from "./ops";
import { stepText, type StepHint, type roomRead } from "./room-steps";

export { roomRead, roomSent } from "./room-steps";

type Result<J> = { json: J; text: string };

function stepJson(step: StepHint) {
  return { next_step: step.next, ...(step.facts.length ? { next_step_facts: step.facts } : {}) };
}

/** The step that is due after a read or a send in `room`. A step never fails a command that succeeded. */
export function roomStep(ctx: ops.Ctx, due: typeof roomRead, room: string | undefined): StepHint | null {
  try {
    return room ? due(ops.account(ctx).identity.slug, room) : null;
  } catch {
    return null;
  }
}

/** The result with the step that is due as its last line, and in `next_step` with --json. */
export function withStep<J extends object>(result: Result<J>, step: StepHint | null): Result<J> {
  return step ? { json: { ...result.json, ...stepJson(step) }, text: `${result.text}\n${stepText(step)}` } : result;
}

/** The step as the last line of stdout. With --json it goes to stderr, where the hint of a read goes. */
export function printStep(step: StepHint | null, json = false): void {
  if (!step) return;
  if (json) process.stderr.write(`${JSON.stringify(stepJson(step))}\n`);
  else process.stdout.write(`${stepText(step)}\n`);
}

/**
 * After `new` and `join`: the result with the context of a joined room, and the one next step. The step is in the
 * JSON of `head`. In text, the caller prints it last, after the linked message if there is one.
 */
export async function onboarded(
  ctx: ops.Ctx,
  kind: "new" | "join",
  result: Result<{ spaceId: string; inviteUrl?: string | null; joined?: boolean; backup_key?: string | null }>,
) {
  const next = await ops.onboarding(ctx, kind, result.json);
  const step: StepHint = { facts: [], next: next.step };
  return { head: { json: { ...result.json, room_about: next.about, ...stepJson(step) }, text: [result.text, ...ops.onboardingAbout(next)].join("\n") }, step };
}
