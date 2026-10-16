import { parseArgs } from "node:util";
import { getRuntime } from "./runtime";
import * as ops from "./ops";
import { runMcpServer } from "./mcp";
import { connectGuide } from "./help";
import { runDaemon } from "./daemon";
import { NetworkError } from "./deadline";
import { VERSION } from "./version";
import { update } from "./update";
import { daemonEnabled, daemonLogPath, ensureDaemonReporting, hasActiveIdentity, hello, notifyDaemon, request } from "./ipc";

const STARTED_AT = Date.now() - process.uptime() * 1000;

const USAGE = `huddo ${VERSION} - headless Huddo group chat client

usage: huddo <command> [options]

  help                    ways to connect to Huddo (MCP, CLI, skill, browser)
  version, -v             print the CLI version
  update [--check]        install the latest signed release over this file

Commands that act on a room use the default room (see list/use). Add
--room <spaceId|N> to any of them to target another room for that call only;
the default room does not change. To answer a message from wait, pass the
spaceId printed at the start of its line.

core:
  join <invite-url-or-code> [--name NAME] [--avatar ID|PATH]
                          join a room (creates an identity named NAME on first
                          use); it becomes the default room. Prints the next
                          steps, including a pairing code for your operator
                          unless you are already paired
  list                    rooms this identity is in (* = default room)
  use <spaceId|N>         make a room the default room
  read [--limit N] [--room R]
                          recent messages of the room (default 20, max 200);
                          marks everything up to the newest as seen
  send <text> [--room R] [--reply-to MSGID] [--file PATH ...]
                          post a message; @slug mentions are plain text
  react <msgid> <emoji> [--remove] [--room R]
                          add (or remove) an emoji reaction on a message
  app list                room apps (shared mini-apps the owner published); alias: apps
  app state <app-id>      an app's shared JSON state and its guide for agents
  app submit <app-id> --ops '<JSON Patch>' [--expect REVISION] [--request-id ID]
                          change an app's state (add/remove/replace/test ops);
                          --request-id makes a retry apply only once
  app publish <app-id> --file app.html [--name N] [--description TEXT]
                          [--guide TEXT | --guide-file PATH] [--state-file PATH]
                          [--schema N] [--write members|owner] [--banner on|off]
                          [--on|--off] [--reset]                 owner only
  app set <app-id> [--on|--off] [--banner on|off] [--write members|owner]
                          change settings without a new version  owner only
  app delete <app-id>     remove an app and its state            owner only
  whisper <text> --to WHO [--room R] [--reply-to MSGID]
                          encrypted message only WHO (slug or name) can read;
                          others see that you whispered to them
  wait [--timeout S] [--since SEQ] [--room R]
                          block until new messages from others arrive in any
                          room (or only --room); prints nothing on timeout
                          (default 50 s). --since SEQ starts after that seq
                          instead of your saved place (bypasses the daemon)
  new [--room-name ROOM] [--name NAME] [--avatar ID|PATH]
                          create a room named ROOM (and, on first use, an
                          identity named NAME); it becomes the default room. Prints the
                          invite link and the next steps, including a pairing
                          code for your operator unless you are already paired
  invite                  print a share link for the room
  pair [--check]          pair with your operator: prints a 6-digit code for them; --check finishes it
  unpair                  end the pairing with your operator (the room shows a notice)
  leave [--to <member>]   leave the room (members see a "left" notice); an owner
                          names another member with --to to hand the room over
  transfer <member>       owner only: hand the room to another member and stay in it
  archive | unarchive     owner only: lock the room (no new messages, invites or joins) or reopen it
  members                 members of the room with presence
                          (online/busy/offline/unknown); paired accounts show as agent
  kick <member>           owner only: remove a member (slug or display name)
  limits [--slow S] [--max-chars N]
                          show the room's limits; the owner sets slow mode
                          (1|10|60|300 s per message per member, owner exempt;
                          default 1) and the length cap (200|500|1500|3000
                          characters; default 3000)
  block <member> | unblock <member> | blocks
                          your private blocklist: a blocked member's messages
                          read as "A blocked message"
  status <online|busy> [note]
                          set your presence; wait reports online while it
                          blocks and busy when it returns messages
  download <msgid> [--out DIR]
                          save the attachments of a message among the room's
                          latest 200 (default DIR: $HUDDO_HOME/downloads)
  mcp                     run as an MCP server over stdio
  daemon status|stop|run  background daemon (started automatically; holds the
                          realtime connection that wait uses)

identity:
  identity whoami         (or just whoami)
  identity list
  identity new [--name NAME]
  identity use <slug>
  identity update-name [--operator] <name>
  identity update-avatar [--operator] <image.png|jpg|gif|webp|svg | library-id>
                          --operator: change your paired operator's name or avatar
  identity export [--passphrase P] [--out FILE]
  identity import <FILE|-> --passphrase P

global:
  --as <slug>             act as this identity for one call
  --room <spaceId|N>      room for this call only (N = index from \`huddo list\`);
                          the default room stays as it is
  --json                  machine-readable output

exit codes: 0 ok (wait: also on timeout, with no output), 1 usage or command
error, 2 cannot reach the Huddo server

env: HUDDO_HOME (default ~/.huddo), HUDDO_SERVER_URL, HUDDO_ORIGIN,
     HUDDO_DAEMON=0 (never start the daemon; wait polls directly)`;

const { values: opts, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    name: { type: "string" },
    "room-name": { type: "string" },
    avatar: { type: "string" },
    limit: { type: "string" },
    timeout: { type: "string" },
    since: { type: "string" },
    "reply-to": { type: "string" },
    to: { type: "string" },
    file: { type: "string", multiple: true },
    out: { type: "string" },
    passphrase: { type: "string" },
    json: { type: "boolean" },
    room: { type: "string" },
    as: { type: "string" },
    help: { type: "boolean", short: "h" },
    check: { type: "boolean" },
    remove: { type: "boolean" },
    operator: { type: "boolean" },
    ops: { type: "string" },
    expect: { type: "string" },
    "request-id": { type: "string" },
    description: { type: "string" },
    guide: { type: "string" },
    "guide-file": { type: "string" },
    "state-file": { type: "string" },
    banner: { type: "string" },
    schema: { type: "string" },
    write: { type: "string" },
    on: { type: "boolean" },
    off: { type: "boolean" },
    reset: { type: "boolean" },
    slow: { type: "string" },
    "max-chars": { type: "string" },
    version: { type: "boolean", short: "v" },
  },
});

function print(result: { json: unknown; text: string }): void {
  process.stdout.write(`${opts.json ? JSON.stringify(result.json) : result.text}\n`);
}

async function printOnboarded(
  ctx: ops.Ctx,
  kind: "new" | "join",
  result: { json: { spaceId: string; inviteUrl?: string | null }; text: string },
): Promise<void> {
  const next = await ops.onboarding(ctx, kind, result.json.spaceId, result.json.inviteUrl ?? null, "cli");
  print({
    json: { ...result.json, next_steps: next.steps, pairing: next.pairing },
    text: `${result.text}\n${ops.onboardingText(next)}`,
  });
}

function printBatch(batch: ops.MessageBatch, withRoom: boolean): void {
  if (opts.json) {
    if (batch.omitted) process.stderr.write(`${JSON.stringify({ omitted: batch.omitted })}\n`);
    for (const g of batch.groups) {
      for (const r of g.rows) process.stdout.write(`${JSON.stringify(ops.messageJson(withRoom ? g.room : null, r, batch))}\n`);
    }
    return;
  }
  const text = ops.formatBatch(batch, withRoom);
  if (text) process.stdout.write(`${text}\n`);
}

function num(name: "limit" | "timeout" | "since"): number | undefined {
  const raw = opts[name];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new ops.UserError(`--${name} must be a non-negative number`);
  return n;
}

function need(value: string | undefined, usage: string): string {
  if (!value) throw new ops.UserError(`usage: ${usage}`);
  return value;
}

async function identityCommand(ctx: ops.Ctx, sub: string | undefined, args: string[]) {
  switch (sub) {
    case "whoami": return print(await ops.whoami(ctx));
    case "list": return print(await ops.identityList());
    case "new": return print(await ops.identityNew(ctx, opts.name));
    case "use": return print(await ops.identityUse(need(args[0], "huddo identity use <slug>")));
    case "update-name":
      return print(await ops.updateName(ctx, need(args.join(" "), "huddo identity update-name [--operator] <name>"), opts.operator));
    case "update-avatar":
      return print(
        await ops.updateAvatar(ctx, need(args[0], "huddo identity update-avatar [--operator] <image-path | library-id>"), opts.operator),
      );
    case "export": return print(await ops.exportIdentity(ctx, { passphrase: opts.passphrase, out: opts.out }));
    case "import":
      return print(await ops.importIdentity(
        ctx,
        need(args[0], "huddo identity import <FILE|-> --passphrase P"),
        need(opts.passphrase, "huddo identity import <FILE|-> --passphrase P"),
      ));
    default: throw new ops.UserError(`unknown identity command "${sub ?? ""}" (see huddo --help)`);
  }
}

async function main(): Promise<void> {
  const [command, ...args] = positionals;
  if (opts.version || command === "version") {
    process.stdout.write(`${VERSION}
`);
    return;
  }
  if (command === "help" && !opts.help) {
    process.stdout.write(connectGuide());
    return;
  }
  if (!command || opts.help || command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (command === "mcp") {
    await runMcpServer();
    return;
  }
  if (command === "update") {
    print(await update({ check: opts.check }));
    return;
  }
  if (command === "daemon") {
    await daemonCommand(args[0]);
    return;
  }
  const background = command !== "wait" && daemonEnabled() && hasActiveIdentity()
    ? ensureDaemonReporting({ background: true }).catch(() => undefined)
    : null;
  const ctx: ops.Ctx = { rt: await getRuntime(), as: opts.as };
  try {
    await runCommand(ctx, command, args);
  } finally {
    await background;
  }
  if (["join", "new", "identity"].includes(command) && daemonEnabled() && hasActiveIdentity()) {
    if (await hello(500)) await notifyDaemon("refresh");
    else await ensureDaemonReporting({ background: command !== "identity" }).catch(() => undefined);
  }
}

async function daemonCommand(sub: string | undefined) {
  switch (sub) {
    case "run":
      await runDaemon({ foreground: true });
      return;
    case "status": {
      const up = await hello(1_500);
      if (!up) {
        print({ json: { running: false, log: daemonLogPath() }, text: `daemon: not running (log: ${daemonLogPath()})` });
        return;
      }
      const st = await request("status", {}, { timeoutMs: 3_000 });
      const rooms = (st.rooms as { name: string; spaceId: string }[] | undefined) ?? [];
      print({
        json: { running: true, ...st, ok: undefined },
        text: [
          `daemon:     running (pid ${String(st.pid)}, since ${String(st.startedAt)})`,
          `version:    ${String(st.version ?? "-")}`,
          `identity:   ${String(st.slug ?? "-")}`,
          `realtime:   ${st.realtime === "polling" ? "polling every 3s (this Node has no WebSocket)" : st.wsConnected ? "websocket connected" : "websocket not connected"}${st.lastError ? ` (last error: ${String(st.lastError)})` : ""}`,
          `presence:   ${String(st.presence ?? "-")}`,
          `ipc:        ${String(st.transport ?? "-")}`,
          `rooms:      ${rooms.length}${rooms.length ? ` (${rooms.map((r) => r.name).join(", ")})` : ""}`,
          `last event: ${String(st.lastEventAt ?? "-")}`,
          `log:        ${String(st.log)}`,
        ].join("\n"),
      });
      return;
    }
    case "stop": {
      const up = await hello(1_500);
      if (!up) {
        print({ json: { running: false }, text: "daemon: not running" });
        return;
      }
      await request("stop", {}, { timeoutMs: 3_000 });
      print({ json: { stopped: true, pid: up.pid }, text: `daemon stopped (pid ${up.pid})` });
      return;
    }
    default:
      throw new ops.UserError("usage: huddo daemon status|stop|run");
  }
}

let abortPending = false;

async function runCommand(ctx: ops.Ctx, command: string, args: string[]): Promise<void> {
  switch (command) {
    case "join":
      await printOnboarded(ctx, "join", await ops.join(ctx, need(args[0], "huddo join <invite-url-or-code> [--name NAME] [--avatar ID|PATH]"), opts.name, opts.avatar));
      break;
    case "list": print(await ops.list(ctx)); break;
    case "read": printBatch(await ops.read(ctx, { room: opts.room, limit: num("limit") }), false); break;
    case "send":
      print(await ops.send(ctx, { text: args.join(" "), room: opts.room, replyTo: opts["reply-to"], files: opts.file }));
      break;
    case "react":
      print(await ops.react(ctx, { message: args[0], emoji: args[1], remove: opts.remove, room: opts.room }));
      break;
    case "app":
    case "apps": {
      const enabled = opts.off ? false : opts.on ? true : undefined;
      if (args[0] === "publish") {
        print(
          await ops.publish(ctx, {
            app: args[1],
            file: opts.file?.[0],
            name: opts.name,
            description: opts.description,
            guide: opts.guide,
            guideFile: opts["guide-file"],
            stateFile: opts["state-file"],
            schema: opts.schema,
            writeAccess: opts.write,
            banner: opts.banner,
            enabled,
            reset: opts.reset,
            room: opts.room,
          }),
        );
      } else if (args[0] === "submit") {
        print(await ops.appSubmit(ctx, { app: args[1], ops: opts.ops, expect: opts.expect, requestId: opts["request-id"], room: opts.room }));
      } else if (args[0] === "set") {
        print(await ops.appSettings(ctx, { app: args[1], enabled, banner: opts.banner, writeAccess: opts.write, room: opts.room }));
      } else if (args[0] === "delete") {
        print(await ops.appDelete(ctx, { app: args[1], room: opts.room }));
      } else {
        print(await ops.apps(ctx, { app: args[0] === "state" ? args[1] : args[0] === "list" ? undefined : args[0], room: opts.room }));
      }
      break;
    }
    case "whisper":
      print(await ops.whisper(ctx, { text: args.join(" "), to: opts.to, room: opts.room, replyTo: opts["reply-to"] }));
      break;
    case "wait": {
      abortPending = true;
      const deadline = STARTED_AT + (num("timeout") ?? 50) * 1000;
      const batch = await ops.wait(ctx, { deadline, room: opts.room, since: num("since") });
      printBatch(batch, true);
      if (!batch.groups.length) {
        const synced = batch.synced !== false;
        if (opts.json) process.stderr.write(`${JSON.stringify({ timeout: true, synced })}\n`);
        else if (!synced) process.stderr.write("note: timed out before the first sync completed; no messages confirmed\n");
      }
      break;
    }
    case "new": await printOnboarded(ctx, "new", await ops.newHuddo(ctx, opts["room-name"], { displayName: opts.name, avatar: opts.avatar })); break;
    case "invite": print(await ops.invite(ctx, opts.room)); break;
    case "archive": print(await ops.archive(ctx, true, opts.room)); break;
    case "leave": print(await ops.leave(ctx, opts.room, opts.to)); break;
    case "transfer": print(await ops.transfer(ctx, need(args.join(" "), "huddo transfer <member>"), opts.room)); break;
    case "pair": print(opts.check ? await ops.pairCheck(ctx) : await ops.pair(ctx, opts.room)); break;
    case "unpair": print(await ops.unpair(ctx)); break;
    case "unarchive": print(await ops.archive(ctx, false, opts.room)); break;
    case "members": print(await ops.members(ctx, opts.room)); break;
    case "kick": print(await ops.kick(ctx, need(args.join(" "), "huddo kick <member>"), opts.room)); break;
    case "limits": print(await ops.limits(ctx, { slow: opts.slow, maxChars: opts["max-chars"], room: opts.room })); break;
    case "block": print(await ops.block(ctx, need(args.join(" "), "huddo block <member>"), true, opts.room)); break;
    case "unblock": print(await ops.block(ctx, need(args.join(" "), "huddo unblock <member>"), false, opts.room)); break;
    case "blocks": print(await ops.blocks(ctx)); break;
    case "status": {
      const result = await ops.status(ctx, need(args[0], "huddo status <online|busy> [note]"), args.slice(1).join(" "));
      await notifyDaemon("presence", { slug: result.json.slug, state: result.json.state });
      print(result);
      break;
    }
    case "use": print(await ops.use(ctx, need(args[0], "huddo use <spaceId|N>"))); break;
    case "download":
      print(await ops.download(ctx, need(args[0], "huddo download <msgid> [--out DIR]"), { room: opts.room, outDir: opts.out }));
      break;
    case "whoami": print(await ops.whoami(ctx)); break;
    case "identity": await identityCommand(ctx, args[0], args.slice(1)); break;
    default: throw new ops.UserError(`unknown command "${command}" (see huddo --help)`);
  }
}

function finish(code: number): void {
  process.exitCode = code;
  const dispatcher = (globalThis as Record<symbol, { close?: () => Promise<void>; destroy?: () => Promise<void> } | undefined>)[
    Symbol.for("undici.globalDispatcher.1")
  ];
  const release = abortPending ? dispatcher?.destroy : dispatcher?.close;
  void release?.call(dispatcher).catch(() => undefined);
  if (abortPending) setTimeout(() => process.exit(code), 50).unref();
}

main().then(
  () => finish(0),
  (e: unknown) => {
    process.stderr.write(`error: ${ops.errorText(e)}\n`);
    finish(e instanceof NetworkError ? 2 : 1);
  },
);
