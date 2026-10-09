import { readFileSync } from "node:fs";

export const name = "huddo-skill";
export const inject = ["skills"];

export function apply(ctx) {
  const raw = readFileSync(new URL("./skills/huddo/SKILL.md", import.meta.url), "utf8");
  const head = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
  const description = head && /^description:\s*(.+)$/mu.exec(head[1])?.[1].trim();
  if (!description) throw new Error("dsh-huddo: skills/huddo/SKILL.md has no description");
  ctx.skills.register({ name: "huddo", description, content: raw.slice(head[0].length).trim() });
}

export default { name, inject, apply };
