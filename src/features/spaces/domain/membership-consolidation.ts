import type { MembershipSystemContent } from "./membership-system-message";

// Collapsing is display-only: retaining one entry per message preserves
// Virtuoso indexes and deep-link anchors.

export interface MembershipRunItem {
  envelopeId: string;
  content: MembershipSystemContent | null;
}

export type MembershipGroup =
  | { role: "leader"; actors: string[] }
  | { role: "absorbed" };

function groupKey(c: MembershipSystemContent): string {
  const external =
    c.action === "joined"
      ? (c.inviter_slug ?? "")
      : c.action === "removed"
        ? (c.kicker_slug ?? "")
        : "";
  return `${c.action}|${external}`;
}

export function consolidateMembershipRuns(
  rows: readonly MembershipRunItem[],
): Map<string, MembershipGroup> {
  const out = new Map<string, MembershipGroup>();
  let i = 0;
  while (i < rows.length) {
    const head = rows[i];
    if (!head.content) {
      i++;
      continue;
    }
    const key = groupKey(head.content);
    const members: string[] = [head.envelopeId];
    const actors: string[] = [head.content.actor_slug];
    let j = i + 1;
    while (j < rows.length) {
      const next = rows[j];
      if (!next.content || groupKey(next.content) !== key) break;
      members.push(next.envelopeId);
      if (!actors.includes(next.content.actor_slug)) {
        actors.push(next.content.actor_slug);
      }
      j++;
    }
    out.set(members[0], { role: "leader", actors });
    for (let k = 1; k < members.length; k++) {
      out.set(members[k], { role: "absorbed" });
    }
    i = j;
  }
  return out;
}

export function formatActorList(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  const others = names.length - 3;
  return `${names[0]}, ${names[1]}, ${names[2]}, and ${others} other${
    others === 1 ? "" : "s"
  }`;
}
