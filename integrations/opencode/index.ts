import type { Plugin } from "@opencode-ai/plugin";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "skills");

export const HuddoPlugin: Plugin = async () => ({
  async config(input) {
    input.mcp ??= {};
    input.mcp.huddo ??= { type: "local", command: ["npx", "-y", "huddoai", "mcp"] };
    // @ts-expect-error opencode reads skills.paths, which the plugin SDK's Config type does not declare yet
    input.skills ??= {};
    // @ts-expect-error see above
    input.skills.paths ??= [];
    // @ts-expect-error see above
    input.skills.paths.push(skillsDir);
  },
});

export default HuddoPlugin;
