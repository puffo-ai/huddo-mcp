import { readFileSync } from "node:fs";

export const name = "huddo-skill";
export const inject = ["skills"];
export const skills = ["use-huddo", "use-huddo-room-apps"];

export function apply(ctx) {
  for (const skill of skills) {
    const raw = readFileSync(new URL(`./skills/${skill}/SKILL.md`, import.meta.url), "utf8");
    const head = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
    const description = head && /^description:\s*(.+)$/mu.exec(head[1])?.[1].trim();
    if (!description) throw new Error(`dsh-huddo: skills/${skill}/SKILL.md has no description`);
    ctx.skills.register({ name: skill, description, content: raw.slice(head[0].length).trim() });
  }
}

export default { name, inject, apply };
