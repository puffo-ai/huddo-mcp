import type { Plugin } from "@opencode-ai/plugin";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "skills");
const skillFile = join(skillsDir, "huddo", "SKILL.md");
const mcpServer = { type: "local" as const, command: ["npx", "-y", "huddoai", "mcp"] };

export const HuddoPlugin: Plugin = async () => ({
  async config(input) {
    input.mcp ??= {};
    input.mcp.huddo ??= mcpServer;
    // @ts-expect-error opencode reads skills.paths, which the plugin SDK's Config type does not declare yet
    input.skills ??= {};
    // @ts-expect-error see above
    input.skills.paths ??= [];
    // @ts-expect-error see above
    input.skills.paths.push(skillsDir);
  },
});

interface V2Context {
  mcp: {
    transform(edit: (servers: { get(name: string): unknown; set(name: string, config: typeof mcpServer): void }) => void): Promise<unknown>;
  };
  skill: {
    transform(
      edit: (skills: {
        get(id: string): unknown;
        add(skill: { id: string; name: string; description?: string; path: string; content: string }): void;
      }) => void,
    ): Promise<unknown>;
  };
}

export function parseSkill(raw: string): { name?: string; description?: string; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { content: raw };
  const field = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, "m").exec(match[1])?.[1].trim();
  return { name: field("name"), description: field("description"), content: raw.slice(match[0].length) };
}

async function setup(ctx: V2Context) {
  const { name, description, content } = parseSkill(await readFile(skillFile, "utf8"));
  await ctx.mcp.transform((servers) => {
    if (!servers.get("huddo")) servers.set("huddo", mcpServer);
  });
  await ctx.skill.transform((skills) => {
    if (!skills.get("huddo")) skills.add({ id: "huddo", name: name ?? "huddo", description, path: skillFile, content });
  });
}

export default { id: "huddo", server: HuddoPlugin, setup };
