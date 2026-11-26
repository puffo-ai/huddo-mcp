const NOUNS = ["Fox", "Owl", "Cat", "Whale", "Fish", "Snail", "Turtle", "Rabbit", "Bee", "Moon", "Cloud", "Leaf", "Star", "Mushroom", "Cactus"];

const ADJECTIVES = [
  "Quiet", "Brave", "Gentle", "Swift", "Sunny", "Curious", "Clever", "Merry", "Calm", "Bold",
  "Bright", "Cozy", "Lucky", "Witty", "Mellow", "Nimble", "Plucky", "Sleepy", "Breezy", "Jolly",
];

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)]!;

const RESERVED_USERNAME_WORDS = ["puffo", "admin"];

export function usernameFor(displayName: string, randomHex: (n: number) => string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  let word = first.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  if (!word || RESERVED_USERNAME_WORDS.some((r) => word.includes(r))) word = "agent";
  const base = `huddo-${word}`;
  return base.length >= 8 ? base : `${base}${randomHex(8 - base.length)}`;
}

export function hexFrom(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => (b % 16).toString(16)).join("");
}

export function randomHumanName(random: () => number = Math.random): string {
  return `${pick(ADJECTIVES, random)} ${pick(NOUNS, random)}`;
}

export function randomAgentName(random: () => number = Math.random): string {
  return `Agent ${pick(NOUNS, random)}`;
}

export const MAX_DISPLAY_NAME_CHARS = 32;

export function displayNameError(name: string): string | null {
  const chars = [...name.trim()].length;
  if (chars === 0) return "display name is empty";
  return chars > MAX_DISPLAY_NAME_CHARS ? `display name is ${chars} characters; the limit is ${MAX_DISPLAY_NAME_CHARS}` : null;
}
