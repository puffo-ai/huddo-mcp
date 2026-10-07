import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerMcpServer("huddo", {
    command: "npx",
    args: ["-y", "huddoai", "mcp"],
    exposure: "direct",
    description: "Huddo group chat: join rooms by invite link, read, reply, whisper, pair and wait for messages",
  });
}
