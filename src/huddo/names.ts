export const DOODLES: Record<string, string> = {
  Fox: "M4 5 L8 10 L12 8 L16 10 L20 5 L18 14 L12 20 L6 14 Z M9.5 13h.01 M14.5 13h.01",
  Owl: "M6 9a6 6 0 0 1 12 0v5a6 6 0 0 1-12 0Z M6 9 5 4l4 2 M18 9l1-5-4 2 M9.5 10.5a1.8 1.8 0 1 0 .01 0 M14.5 10.5a1.8 1.8 0 1 0 .01 0 M12 13l-1 1.5h2Z",
  Cat: "M5 9V4l4 3h6l4-3v5a7 7 0 0 1-14 0Z M9.5 12h.01 M14.5 12h.01 M12 14.5l-1 1 M12 14.5l1 1",
  Whale: "M3 13c0 4 4 6 9 6s8-3 8-7c0-1 1-3 2-4-2 0-3 1-3 2-2-3-6-4-9-3-4 1-7 3-7 6Z M8 13h.01 M8 7V5 M6 6l2-1 2 1",
  Fish: "M3 12c3-5 10-6 14 0-4 6-11 5-14 0Z M17 12l4-4v8Z M8 11h.01",
  Snail: "M14 7a5 5 0 1 1-.01 0 M14 12a2 2 0 1 1 2-2 M3 18h17 M5 18c-1-3-1-6 1-8 M6 10 5 7 M7 10l1-3",
  Turtle: "M5 15a7 6 0 0 1 14 0Z M19 13a2 2 0 1 1 3 1 M7 15v3 M17 15v3 M9 15l1-4h4l1 4",
  Rabbit: "M9 10C8 4 9 2 10 2s1 4 1 8 M13 10c0-4 0-8 1-8s2 2 1 8 M12 9a5 5 0 1 1-.01 0 M10 14h.01 M14 14h.01",
  Bee: "M6 13a6 4.5 0 1 0 12 0a6 4.5 0 1 0-12 0 M10 9v8 M14 9v8 M10 9c-2-4-6-2-4 1 M14 9c2-4 6-2 4 1",
  Moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10Z",
  Cloud: "M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11 1 3.5 3.5 0 0 0 1 7Z",
  Leaf: "M5 19C5 9 11 4 20 4c0 9-5 15-15 15Z M5 19l8-8",
  Star: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7Z",
  Mushroom: "M3 12a9 7 0 0 1 18 0Z M9 12v6a3 3 0 0 0 6 0v-6 M8 8h.01 M14 7h.01",
  Cactus: "M10 21V5a2 2 0 0 1 4 0v16 M10 14H7a2 2 0 0 1-2-2V9 M14 12h3a2 2 0 0 0 2-2V7 M7 21h10",
};

const NOUNS = Object.keys(DOODLES);

const ADJECTIVES = [
  "Quiet", "Brave", "Gentle", "Swift", "Sunny", "Curious", "Clever", "Merry", "Calm", "Bold",
  "Bright", "Cozy", "Lucky", "Witty", "Mellow", "Nimble", "Plucky", "Sleepy", "Breezy", "Jolly",
];

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)]!;

export function randomHumanName(random: () => number = Math.random): string {
  return `${pick(ADJECTIVES, random)} ${pick(NOUNS, random)}`;
}

export function randomAgentName(random: () => number = Math.random): string {
  return `Agent ${pick(NOUNS, random)}`;
}

export function doodleFor(name: string): string | null {
  const last = name.trim().split(/\s+/).pop() ?? "";
  return DOODLES[last] ?? null;
}

export const MAX_DISPLAY_NAME_CHARS = 32;

export function displayNameError(name: string): string | null {
  const chars = [...name.trim()].length;
  if (chars === 0) return "display name is empty";
  return chars > MAX_DISPLAY_NAME_CHARS ? `display name is ${chars} characters; the limit is ${MAX_DISPLAY_NAME_CHARS}` : null;
}
