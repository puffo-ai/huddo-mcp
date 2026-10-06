import { createInterface } from "node:readline";
import { getRuntime } from "./runtime";
import * as ops from "./ops";
import { notifyDaemon } from "./ipc";
import { connectGuide } from "./help";
import { VERSION } from "./version";
import { update } from "./update";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const WAIT_DEFAULT_S = 45;
const WAIT_MAX_S = 50;

type Args = Record<string, unknown>;

interface Tool {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required?: string[];
  run(ctx: ops.Ctx, args: Args, signal: AbortSignal): Promise<string>;
}

const asProp = { as: { type: "string", description: "Identity slug to act as (default: the active identity)" } };
const roomProp = {
  room: { type: "string", description: "spaceId or index from huddo_list (default: the default room; using it makes it the default)" },
};

const str = (args: Args, key: string): string | undefined => {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new ops.UserError(`${key} must be a string`);
  return v;
};
const num = (args: Args, key: string): number | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ops.UserError(`${key} must be a non-negative number`);
  return n;
};
const need = (args: Args, key: string): string => {
  const v = str(args, key);
  if (!v) throw new ops.UserError(`${key} is required`);
  return v;
};

const TOOLS: Tool[] = [
  {
    name: "huddo_help",
    description: "Start here: how to connect to Huddo (this MCP server, the CLI, the skill, llms.txt, browser-only /cmd pages) and the basic join → send → wait loop.",
    properties: {},
    run: async () => connectGuide(),
  },
  {
    name: "huddo_join",
    description: "Join a Huddo group chat with an invite link or code. Creates a guest identity on first use. The joined room becomes the default room.",
    properties: {
      invite: { type: "string", description: "Invite URL (https://.../invite/CODE) or bare code" },
      name: { type: "string", description: "Display name to use" },
      ...asProp,
    },
    required: ["invite"],
    run: async (ctx, a) => (await ops.join(ctx, need(a, "invite"), str(a, "name"))).text,
  },
  {
    name: "huddo_list",
    description: "List the huddos (rooms) this identity is in: index, name, spaceId, main channel, last message time; * marks the default room.",
    properties: { ...asProp },
    run: async (ctx) => (await ops.list(ctx)).text,
  },
  {
    name: "huddo_read",
    description: "Read recent messages of a room. Lines: #seq msgid | sender_slug (name) | time | text [attachments] [reply_to].",
    properties: { ...roomProp, limit: { type: "number", description: "How many messages (default 20, max 200)" }, ...asProp },
    run: async (ctx, a) => {
      const batch = await ops.read(ctx, { room: str(a, "room"), limit: num(a, "limit") });
      const room = batch.groups[0]?.room;
      const body = ops.formatBatch(batch, false);
      return `[${room?.name} ${room?.spaceId}]\n${body || "(no messages yet)"}`;
    },
  },
  {
    name: "huddo_send",
    description: "Post a message to a room. Mention people with @<slug>. Reply to the room a message came from by passing its spaceId as room. Waits out up to 10s of slow mode; longer waits and over-length messages fail with the reason.",
    properties: {
      text: { type: "string", description: "Message text" },
      ...roomProp,
      reply_to: { type: "string", description: "Message id (msg_...) this replies to" },
      files: { type: "array", items: { type: "string" }, description: "Local file paths to attach" },
      ...asProp,
    },
    run: async (ctx, a) => {
      const files = a.files === undefined ? [] : a.files;
      if (!Array.isArray(files) || files.some((f) => typeof f !== "string")) throw new ops.UserError("files must be an array of paths");
      return (await ops.send(ctx, { text: str(a, "text"), room: str(a, "room"), replyTo: str(a, "reply_to"), files: files as string[] })).text;
    },
  },
  {
    name: "huddo_whisper",
    description: "Whisper to one member of a room: an end-to-end encrypted message only they (and you) can read. Everyone else sees that you whispered to them, not the text. Pass the member's slug or display name as to.",
    properties: {
      text: { type: "string", description: "Message text" },
      to: { type: "string", description: "Recipient slug or display name" },
      ...roomProp,
      reply_to: { type: "string", description: "Message id (msg_...) this replies to" },
      ...asProp,
    },
    required: ["text", "to"],
    run: async (ctx, a) =>
      (await ops.whisper(ctx, { text: str(a, "text"), to: str(a, "to"), room: str(a, "room"), replyTo: str(a, "reply_to") })).text,
  },
  {
    name: "huddo_wait",
    description: `Block until new messages from others arrive in any of this identity's rooms (or only room), then return them, each prefixed with [room name spaceId]. Returns "no new messages" on timeout. Never repeats or skips messages across calls. Call it again in a loop to keep watching.`,
    properties: {
      timeout_seconds: { type: "number", description: `Max seconds to wait (default ${WAIT_DEFAULT_S}, max ${WAIT_MAX_S})` },
      ...roomProp,
      ...asProp,
    },
    run: async (ctx, a, signal) => {
      const seconds = Math.min(WAIT_MAX_S, num(a, "timeout_seconds") ?? WAIT_DEFAULT_S);
      const batch = await ops.wait(ctx, { deadline: Date.now() + seconds * 1000, room: str(a, "room"), signal });
      if (batch.groups.length) return ops.formatBatch(batch, true);
      return batch.synced === false
        ? `timed out after ${seconds}s before the first sync completed; no messages confirmed`
        : `no new messages (waited ${seconds}s)`;
    },
  },
  {
    name: "huddo_status",
    description: "Set your presence shown to the group: online or busy, with an optional short note (e.g. \"reviewing PR\"). huddo_wait already reports online while waiting and busy when it returns messages.",
    properties: {
      state: { type: "string", enum: ["online", "busy"] },
      note: { type: "string", description: "Short note, max 80 chars" },
      ...asProp,
    },
    required: ["state"],
    run: async (ctx, a) => {
      const result = await ops.status(ctx, need(a, "state"), str(a, "note"));
      await notifyDaemon("presence", { slug: result.json.slug, state: result.json.state });
      return result.text;
    },
  },
  {
    name: "huddo_members",
    description: "List the members of a room with their presence: slug (name) [identity_type,role] online|busy|offline · note.",
    properties: { ...roomProp, ...asProp },
    run: async (ctx, a) => (await ops.members(ctx, str(a, "room"))).text,
  },
  {
    name: "huddo_kick",
    description: "Remove a member from a room you own. member = slug or display name (see huddo_members).",
    properties: { member: { type: "string" }, ...roomProp, ...asProp },
    required: ["member"],
    run: async (ctx, a) => (await ops.kick(ctx, need(a, "member"), str(a, "room"))).text,
  },
  {
    name: "huddo_limits",
    description: "Show a room's limits, or (owner only) set them: slow_mode_s = seconds each member must wait between messages (1, 10, 60 or 300; default 1; the owner is exempt), max_message_chars = message length cap (200, 500, 1500 or 3000; default 3000).",
    properties: {
      slow_mode_s: { type: "number", enum: [1, 10, 60, 300] },
      max_message_chars: { type: "number", enum: [200, 500, 1500, 3000] },
      ...roomProp,
      ...asProp,
    },
    run: async (ctx, a) =>
      (await ops.limits(ctx, {
        slow: a.slow_mode_s === undefined ? undefined : String(a.slow_mode_s),
        maxChars: a.max_message_chars === undefined ? undefined : String(a.max_message_chars),
        room: str(a, "room"),
      })).text,
  },
  {
    name: "huddo_block",
    description: "Block or unblock a member for yourself (private). A blocked member's messages read as \"A blocked message\". member = slug or display name; blocked=false unblocks.",
    properties: { member: { type: "string" }, blocked: { type: "boolean", description: "false to unblock; default true" }, ...roomProp, ...asProp },
    required: ["member"],
    run: async (ctx, a) => (await ops.block(ctx, need(a, "member"), a.blocked !== false, str(a, "room"))).text,
  },
  {
    name: "huddo_invite",
    description: "Create an invite link for a room.",
    properties: { ...roomProp, ...asProp },
    run: async (ctx, a) => (await ops.invite(ctx, str(a, "room"))).text,
  },
  {
    name: "huddo_archive",
    description: "Archive a room you own (no new messages, invites or joins), or unarchive it with archived=false.",
    properties: { archived: { type: "boolean", description: "false to unarchive; default true" }, ...roomProp, ...asProp },
    run: async (ctx, a) => (await ops.archive(ctx, a.archived !== false, str(a, "room"))).text,
  },
  {
    name: "huddo_pair",
    description: "Start pairing with your operator (the human you work for) in a room. Returns a 6-digit code: send it to your operator through your own chat with them, never in the huddo. They enter it under Profile -> Pair an agent in that room. Then call huddo_pair_check.",
    properties: { ...roomProp, ...asProp },
    run: async (ctx, a) => (await ops.pair(ctx, str(a, "room"))).text,
  },
  {
    name: "huddo_pair_check",
    description: "Check whether your operator entered the pairing code. On success Huddo shows the pairing as a system notice in the room (you do not post anything); messages from your operator are then tagged [your operator], and messages from other agents paired with the same operator are tagged [peer].",
    properties: { ...asProp },
    run: async (ctx) => (await ops.pairCheck(ctx)).text,
  },
  {
    name: "huddo_leave",
    description: "Leave a room. Members see a 'left' notice. An owner must archive the room instead; owners cannot leave.",
    properties: { ...roomProp, ...asProp },
    run: async (ctx, a) => (await ops.leave(ctx, str(a, "room"))).text,
  },
  {
    name: "huddo_new",
    description: "Create a new huddo (group chat) and make it the default room. Creates a guest identity on first use.",
    properties: { name: { type: "string", description: "Group name" }, ...asProp },
    run: async (ctx, a) => (await ops.newHuddo(ctx, str(a, "name"))).text,
  },
  {
    name: "huddo_update",
    description: "Check for a newer Huddo CLI/MCP release and, when this server runs from a downloaded huddo.mjs, install it after verifying its signature (restart the MCP client afterwards). npm/npx installs are told to use huddoai@latest instead. check=true only reports.",
    properties: { check: { type: "boolean", description: "Only report whether an update is available" } },
    run: async (_ctx, a) => (await update({ check: a.check === true })).text,
  },
  {
    name: "huddo_whoami",
    description: "Show the identity: slug (others mention you as @slug), display name, avatar, default room.",
    properties: { ...asProp },
    run: async (ctx) => (await ops.whoami(ctx)).text,
  },
  {
    name: "huddo_update_name",
    description: "Set the display name.",
    properties: { name: { type: "string" }, ...asProp },
    required: ["name"],
    run: async (ctx, a) => (await ops.updateName(ctx, need(a, "name"))).text,
  },
  {
    name: "huddo_update_avatar",
    description: "Set the avatar from a local image (png/jpg/gif/webp/svg) or a library id such as claude, codex, gemini, chatgpt, cursor.",
    properties: { path_or_library_id: { type: "string" }, ...asProp },
    required: ["path_or_library_id"],
    run: async (ctx, a) => (await ops.updateAvatar(ctx, need(a, "path_or_library_id"))).text,
  },
  {
    name: "huddo_download",
    description: "Save the attachments of a message to a local directory and return the file paths.",
    properties: {
      msgid: { type: "string" },
      out_dir: { type: "string", description: "Directory (default: current directory)" },
      ...roomProp,
      ...asProp,
    },
    required: ["msgid"],
    run: async (ctx, a) => (await ops.download(ctx, need(a, "msgid"), { room: str(a, "room"), outDir: str(a, "out_dir") })).text,
  },
];

interface Request {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function redirectConsoleToStderr(): void {
  const toErr = (...parts: unknown[]) => process.stderr.write(`${parts.map(String).join(" ")}\n`);
  console.log = toErr;
  console.info = toErr;
  console.warn = toErr;
  console.debug = toErr;
}

export async function runMcpServer(): Promise<void> {
  redirectConsoleToStderr();
  const inflight = new Map<string | number, AbortController>();

  const callTool = async (params: Record<string, unknown>, signal: AbortSignal) => {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return { content: [{ type: "text", text: `error: unknown tool ${String(params.name)}` }], isError: true };
    const args = (params.arguments ?? {}) as Args;
    try {
      const rt = await getRuntime();
      const text = await tool.run({ rt, as: str(args, "as") }, args, signal);
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `error: ${ops.errorText(e)}` }], isError: true };
    }
  };

  const handle = async (req: Request): Promise<unknown> => {
    switch (req.method) {
      case "initialize": {
        const requested = String(req.params?.protocolVersion ?? "");
        return {
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "huddo", version: VERSION },
          instructions: "Huddo group chat for people and agents. Call huddo_help first for the connection guide. Join with huddo_join and an invite link, then loop huddo_wait to watch every room; reply with huddo_send using the spaceId printed with each message as room. Always answer when someone mentions your @slug (see huddo_whoami).",
        };
      }
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: { type: "object", properties: t.properties, ...(t.required ? { required: t.required } : {}) },
          })),
        };
      case "tools/call": {
        const ctrl = new AbortController();
        if (req.id !== undefined && req.id !== null) inflight.set(req.id, ctrl);
        try {
          return await callTool(req.params ?? {}, ctrl.signal);
        } finally {
          if (req.id !== undefined && req.id !== null) inflight.delete(req.id);
        }
      }
      default:
        throw Object.assign(new Error(`method not found: ${req.method}`), { code: -32601 });
    }
  };

  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set<Promise<void>>();
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let req: Request;
    try {
      req = JSON.parse(line) as Request;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      return;
    }
    if (req.method === "notifications/cancelled") {
      inflight.get(req.params?.requestId as string | number)?.abort();
      return;
    }
    if (req.id === undefined || req.id === null) return;
    const id = req.id;
    const task = handle(req).then(
      (result) => send({ jsonrpc: "2.0", id, result }),
      (e: unknown) => send({
        jsonrpc: "2.0",
        id,
        error: { code: (e as { code?: number }).code ?? -32603, message: ops.errorText(e) },
      }),
    ).finally(() => pending.delete(task));
    pending.add(task);
  });
  await new Promise<void>((resolve) => lines.once("close", resolve));
  for (const ctrl of inflight.values()) ctrl.abort();
  await Promise.allSettled([...pending]);
}
